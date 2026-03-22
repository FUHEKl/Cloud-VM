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


async def main():
    logger.info("Starting worker...")

    # Connect to NATS
    nc = await nats.connect(NATS_URL)
    js = nc.jetstream()
    logger.info(f"Connected to NATS at {NATS_URL}")

    # Connect to Redis
    redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    redis_client.ping()
    logger.info(f"Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")

    # Initialize VM handler
    handler = VMHandler()

    # Ensure JetStream stream exists
    try:
        await js.find_stream_by_subject("vm.>")
    except nats.js.errors.NotFoundError:
        await js.add_stream(name="VM", subjects=["vm.>"])
        logger.info("Created JetStream stream 'VM'")

    # --- Subscription handlers ---

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

    # Subscribe with durable consumers
    await js.subscribe(
        "vm.create",
        cb=handle_vm_create,
        durable="worker-vm-create",
        config=ConsumerConfig(deliver_policy=DeliverPolicy.ALL),
    )
    logger.info("Subscribed to vm.create")

    await js.subscribe(
        "vm.action",
        cb=handle_vm_action,
        durable="worker-vm-action",
        config=ConsumerConfig(deliver_policy=DeliverPolicy.ALL),
    )
    logger.info("Subscribed to vm.action")

    await js.subscribe(
        "vm.delete",
        cb=handle_vm_delete,
        durable="worker-vm-delete",
        config=ConsumerConfig(deliver_policy=DeliverPolicy.ALL),
    )
    logger.info("Subscribed to vm.delete")

    logger.info("Worker is ready and listening for messages...")

    # Keep the worker alive
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
