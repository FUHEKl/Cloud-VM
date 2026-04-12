import json
import asyncio
import logging

import nats
from nats.js.api import ConsumerConfig, DeliverPolicy
from nats.js.errors import NotFoundError
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

# Keep track of vmIds for which we already logged the incoming sshPublicKey.
# This guarantees a single key print per VM request during the worker process lifetime.
_logged_vm_create_ssh_keys: set[str] = set()


async def ensure_stream(js) -> None:
    """Create the JetStream VM stream if it does not exist yet."""
    try:
        await js.find_stream_name_by_subject("vm.create")
        logger.info("JetStream stream 'VM' already exists")
    except NotFoundError:
        await js.add_stream(name=STREAM_NAME, subjects=STREAM_SUBJECTS)
        logger.info("Created JetStream stream 'VM'")


async def main():
    logger.info("Starting worker...")

    nc = await nats.connect(NATS_URL)
    js = nc.jetstream()
    logger.info("Connected to NATS at %s", NATS_URL)

    redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    redis_client.ping()
    logger.info("Connected to Redis at %s:%s", REDIS_HOST, REDIS_PORT)

    await ensure_stream(js)

    handler = VMHandler(redis_client)
    await handler.load_templates()
    await handler.reconcile_pending_vms(nc)

    # ---------------------------------------------------------------
    # EPHEMERAL consumers with DeliverPolicy.NEW
    # Every restart = fresh start, no stale messages replayed.
    # VMs are only created when the user explicitly requests from UI.
    # ---------------------------------------------------------------
    create_cfg = ConsumerConfig(
        deliver_policy=DeliverPolicy.NEW,
        filter_subject="vm.create",
    )
    action_cfg = ConsumerConfig(
        deliver_policy=DeliverPolicy.NEW,
        filter_subject="vm.action",
    )
    delete_cfg = ConsumerConfig(
        deliver_policy=DeliverPolicy.NEW,
        filter_subject="vm.delete",
    )

    async def handle_vm_create(msg):
        try:
            data = json.loads(msg.data.decode())
            logger.info("Received vm.create: %s", data)

            vm_id = data.get("vmId")
            if vm_id and vm_id not in _logged_vm_create_ssh_keys:
                incoming_ssh_key = data.get("sshPublicKey")
                ssh_key_value = (
                    incoming_ssh_key.strip()
                    if isinstance(incoming_ssh_key, str)
                    else ""
                )
                logger.info(
                    'vm.create ssh key (printed once for vmId=%s): "%s"',
                    vm_id,
                    ssh_key_value,
                )
                _logged_vm_create_ssh_keys.add(vm_id)

            await handler.create_vm(data, nc)
            await msg.ack()
        except Exception as e:
            logger.error("Error handling vm.create: %s", e, exc_info=True)
            await msg.nak()

    async def handle_vm_action(msg):
        try:
            data = json.loads(msg.data.decode())
            logger.info("Received vm.action: %s", data)
            await handler.vm_action(data, nc)
            await msg.ack()
        except Exception as e:
            logger.error("Error handling vm.action: %s", e, exc_info=True)
            await msg.nak()

    async def handle_vm_delete(msg):
        try:
            data = json.loads(msg.data.decode())
            logger.info("Received vm.delete: %s", data)
            await handler.delete_vm(data, nc)
            await msg.ack()
        except Exception as e:
            logger.error("Error handling vm.delete: %s", e, exc_info=True)
            await msg.nak()

    await js.subscribe("vm.create", cb=handle_vm_create, config=create_cfg)
    await js.subscribe("vm.action", cb=handle_vm_action, config=action_cfg)
    await js.subscribe("vm.delete", cb=handle_vm_delete, config=delete_cfg)
    logger.info("Subscribed to vm.create / vm.action / vm.delete (ephemeral, NEW only)")

    async def handle_templates_list(msg):
        try:
            templates = await handler.get_template_list()
            if msg.reply:
                await nc.publish(msg.reply, json.dumps(templates).encode())
        except Exception as e:
            logger.error("Error handling templates.list: %s", e, exc_info=True)
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
