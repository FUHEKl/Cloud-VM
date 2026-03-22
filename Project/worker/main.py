import json
import asyncio
import logging

import nats
from nats.js.api import ConsumerConfig, DeliverPolicy
import redis

from config import NATS_URL, REDIS_HOST, REDIS_PORT
from vm_handler import VMHandler
from db_updater import update_vm_status

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

STREAM_NAME = "VM"
STREAM_SUBJECTS = ["vm.>"]


async def ensure_stream(js) -> None:
    """Create the JetStream VM stream if it does not exist yet."""
    try:
        await js.find_stream_name_by_subject("vm.create")
        logger.info("JetStream stream 'VM' already exists")
    except nats.js.errors.NotFoundError:
        await js.add_stream(name=STREAM_NAME, subjects=STREAM_SUBJECTS)
        logger.info("Created JetStream stream 'VM'")


async def main():
    logger.info("Starting worker...")

    nc = await nats.connect(NATS_URL)
    js = nc.jetstream()
    logger.info(f"Connected to NATS at {NATS_URL}")

    redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    redis_client.ping()
    logger.info(f"Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")

    await ensure_stream(js)

    handler = VMHandler(redis_client)
    await handler.load_templates()
    await handler.reconcile_pending_vms(nc)

    # ---------------------------------------------------------------
    # EPHEMERAL consumers with DeliverPolicy.NEW
    # Every restart = fresh start, no stale messages replayed.
    # VMs are only created when the user explicitly requests from UI.
    # ---------------------------------------------------------------
    ephemeral_cfg = ConsumerConfig(deliver_policy=DeliverPolicy.NEW)

    async def handle_vm_create(msg):
        try:
            data = json.loads(msg.data.decode())
            logger.info(f"Received vm.create: {data}")
            await handler.create_vm(data, nc)
            await msg.ack()
        except Exception as e:
            logger.error(f"Error handling vm.create: {e}", exc_info=True)
            await msg.nak()

    async def handle_vm_action(msg):
        try:
            data = json.loads(msg.data.decode())
            logger.info(f"Received vm.action: {data}")
            await handler.vm_action(data, nc)
            await msg.ack()
        except Exception as e:
            logger.error(f"Error handling vm.action: {e}", exc_info=True)
            await msg.nak()

    async def handle_vm_delete(msg):
        try:
            data = json.loads(msg.data.decode())
            logger.info(f"Received vm.delete: {data}")
            await handler.delete_vm(data, nc)
            await msg.ack()
        except Exception as e:
            logger.error(f"Error handling vm.delete: {e}", exc_info=True)
            await msg.nak()

    await js.subscribe("vm.create", cb=handle_vm_create, config=ephemeral_cfg)
    await js.subscribe("vm.action", cb=handle_vm_action, config=ephemeral_cfg)
    await js.subscribe("vm.delete", cb=handle_vm_delete, config=ephemeral_cfg)
    logger.info("Subscribed to vm.create / vm.action / vm.delete (ephemeral, NEW only)")

    async def handle_templates_list(msg):
        try:
            templates = await handler.get_template_list()
            if msg.reply:
                await nc.publish(msg.reply, json.dumps(templates).encode())
        except Exception as e:
            logger.error(f"Error handling templates.list: {e}", exc_info=True)
            if msg.reply:
                await nc.publish(msg.reply, json.dumps([]).encode())

    await nc.subscribe("templates.list", cb=handle_templates_list)
    logger.info("Subscribed to templates.list (core NATS request-reply)")
    logger.info("Worker ready — waiting for messages...")

    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        logger.info("Shutting down worker...")
    finally:
        await nc.drain()
        redis_client.close()
        logger.info("Worker stopped.")


if __name__ == "__main__":
    asyncio.run(main())
