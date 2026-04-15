import json
import asyncio
import logging
import re
import ipaddress
from urllib.parse import urlparse
import sys

import nats
from nats.js.api import ConsumerConfig, DeliverPolicy
from nats.js.errors import NotFoundError
import redis

from config import NATS_URL, REDIS_HOST, REDIS_PORT, ONE_XMLRPC, ONE_USERNAME, ONE_PASSWORD
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
_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
)


def _is_uuid(value: object) -> bool:
    return isinstance(value, str) and _UUID_RE.match(value) is not None


def _validate_vm_create(data: dict) -> tuple[bool, str]:
    required = ["vmId", "name", "cpu", "ramMb", "diskGb", "osTemplate", "userId"]
    for field in required:
        if field not in data:
            return False, f"Missing required field '{field}'"

    if not _is_uuid(data.get("vmId")):
        return False, "vmId must be UUID"
    if not _is_uuid(data.get("userId")):
        return False, "userId must be UUID"
    if not isinstance(data.get("name"), str) or not data["name"].strip():
        return False, "name must be non-empty string"
    if not isinstance(data.get("osTemplate"), str) or not data["osTemplate"].strip():
        return False, "osTemplate must be non-empty string"

    for nfield in ["cpu", "ramMb", "diskGb"]:
        if not isinstance(data.get(nfield), int) or data[nfield] <= 0:
            return False, f"{nfield} must be positive integer"

    return True, "ok"


def _validate_vm_action(data: dict) -> tuple[bool, str]:
    required = ["vmId", "oneVmId", "action", "userId"]
    for field in required:
        if field not in data:
            return False, f"Missing required field '{field}'"

    if not _is_uuid(data.get("vmId")):
        return False, "vmId must be UUID"
    if not _is_uuid(data.get("userId")):
        return False, "userId must be UUID"
    if not isinstance(data.get("oneVmId"), int):
        return False, "oneVmId must be integer"
    if data.get("action") not in {"start", "stop", "restart", "delete"}:
        return False, "action must be one of start/stop/restart/delete"

    return True, "ok"


def _validate_vm_delete(data: dict) -> tuple[bool, str]:
    if "vmId" not in data or "userId" not in data:
        return False, "Missing required fields vmId/userId"

    if not _is_uuid(data.get("vmId")):
        return False, "vmId must be UUID"
    if not _is_uuid(data.get("userId")):
        return False, "userId must be UUID"

    one_vm_id = data.get("oneVmId")
    if one_vm_id is not None and not isinstance(one_vm_id, int):
        return False, "oneVmId must be integer when provided"

    return True, "ok"


def _is_private_or_tailscale_host(host: str) -> bool:
    try:
        ip = ipaddress.ip_address(host)
        tailscale_cgnat = ipaddress.ip_network("100.64.0.0/10")
        return ip.is_private or ip in tailscale_cgnat
    except ValueError:
        return host.endswith(".ts.net") or host in {"localhost"}


def _validate_opennebula_config_or_exit() -> None:
    # SECURITY: Fail fast if credentials missing — prevents silent misconfiguration.
    if not ONE_USERNAME or not ONE_USERNAME.strip():
        logger.error("SECURITY: ONE_USERNAME is missing. Exiting.")
        sys.exit(1)

    # SECURITY: Secrets must never appear in logs — log aggregators are often less secured than the app itself.
    if not ONE_PASSWORD or not ONE_PASSWORD.strip():
        logger.error("SECURITY: ONE_PASSWORD is missing. Exiting.")
        sys.exit(1)

    parsed = urlparse(ONE_XMLRPC)
    if parsed.scheme not in {"http", "https"}:
        logger.error("SECURITY: ONE_XMLRPC must start with http:// or https://. Exiting.")
        sys.exit(1)

    if not parsed.hostname:
        logger.error("SECURITY: ONE_XMLRPC host is invalid. Exiting.")
        sys.exit(1)

    if not _is_private_or_tailscale_host(parsed.hostname):
        logger.warning(
            "SECURITY: ONE_XMLRPC host appears public (%s). This is not recommended.",
            parsed.hostname,
        )


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

    _validate_opennebula_config_or_exit()

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
            is_valid, reason = _validate_vm_create(data)
            if not is_valid:
                logger.warning("SECURITY: rejected malformed vm.create message: %s", reason)
                await msg.ack()
                return

            logger.info("Received vm.create for vmId=%s", data.get("vmId"))

            vm_id = data.get("vmId")
            if vm_id and vm_id not in _logged_vm_create_ssh_keys:
                logger.info(
                    "SECURITY: vm.create received SSH key payload for vmId=%s (content redacted)",
                    vm_id,
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
            is_valid, reason = _validate_vm_action(data)
            if not is_valid:
                logger.warning("SECURITY: rejected malformed vm.action message: %s", reason)
                await msg.ack()
                return

            logger.info(
                "Received vm.action vmId=%s action=%s",
                data.get("vmId"),
                data.get("action"),
            )
            await handler.vm_action(data, nc)
            await msg.ack()
        except Exception as e:
            logger.error("Error handling vm.action: %s", e, exc_info=True)
            await msg.nak()

    async def handle_vm_delete(msg):
        try:
            data = json.loads(msg.data.decode())
            is_valid, reason = _validate_vm_delete(data)
            if not is_valid:
                logger.warning("SECURITY: rejected malformed vm.delete message: %s", reason)
                await msg.ack()
                return

            logger.info("Received vm.delete vmId=%s", data.get("vmId"))
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
