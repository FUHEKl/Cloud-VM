import json
import asyncio
import logging
import os
import unicodedata
import re

import pyone
import redis as redis_lib

from config import ONE_XMLRPC, ONE_USERNAME, ONE_PASSWORD, ONE_IP_OFFSET
from db_updater import update_vm_status, get_vm_one_id, get_user_ssh_keys, delete_vm_record

logger = logging.getLogger(__name__)


def _escape_one_template_value(value: str) -> str:
    """Escape a value so it can be safely embedded inside OpenNebula template quotes."""
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _load_extra_ssh_keys() -> list[str]:
    """
    Load extra SSH public keys from a file mounted into the container.

    The file is written by scripts/setup-https.sh from the server's
    /root/.ssh/id_rsa.pub so that the OpenNebula/Jetstream host key is
    automatically injected into every new VM's authorized_keys.

    Returns an empty list if the file is absent or empty.
    """
    path = os.getenv("EXTRA_SSH_KEYS_FILE", "/app/extra_ssh_keys.txt")
    try:
        with open(path) as fh:
            keys = [line.strip() for line in fh if line.strip()]
        if keys:
            logger.info("Loaded %d extra SSH key(s) from %s", len(keys), path)
        return keys
    except FileNotFoundError:
        logger.debug("Extra SSH keys file not found at %s — skipping", path)
        return []
    except Exception as exc:
        logger.warning("Could not read extra SSH keys from %s: %s", path, exc)
        return []


def _inject_extra_ssh_keys_enabled() -> bool:
    """
    SECURITY: extra host-level SSH keys are disabled by default to preserve
    per-user access isolation between VMs.

    Set INJECT_EXTRA_SSH_KEYS=true to opt in explicitly.
    """
    raw = os.getenv("INJECT_EXTRA_SSH_KEYS", "false").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _sanitize_ssh_public_keys(keys: list[str]) -> list[str]:
    """
    SECURITY: normalize/validate SSH keys before template injection.
    - Trim trailing spaces/newlines
    - Allow only known public key prefixes
    - Reject overly long keys
    - Deduplicate while preserving order
    """
    allowed_prefixes = (
        "ssh-rsa",
        "ssh-ed25519",
        "ecdsa-sha2-nistp256",
    )

    sanitized: list[str] = []
    seen: set[str] = set()

    for raw in keys:
        if not isinstance(raw, str):
            continue

        key = raw.strip()
        if not key:
            continue

        if len(key) > 4096:
            logger.warning("SECURITY: rejected SSH key over max length (4096)")
            continue

        if not key.startswith(allowed_prefixes):
            logger.warning("SECURITY: rejected SSH key with unsupported prefix")
            continue

        if key in seen:
            continue

        sanitized.append(key)
        seen.add(key)

    return sanitized

logger = logging.getLogger(__name__)

REDIS_TTL = 86400  # 24 hours

# Map ONE LCM_STATE int → human-readable status string for real-time UI
LCM_STATUS_MAP = {
    1:  "PROLOG",
    2:  "BOOT",
    3:  "RUNNING",
    5:  "MIGRATE",
    6:  "SAVE_STOP",
    8:  "PROLOG_MIGRATE",
    14: "SHUTDOWN",
    17: "BOOT_UNKNOWN",
    18: "BOOT_POWEROFF",
    19: "BOOT_SUSPENDED",
    20: "BOOT_STOPPED",
}


class VMHandler:
    """Handles OpenNebula VM lifecycle operations."""

    def __init__(self, redis_client: redis_lib.Redis):
        self.one = pyone.OneServer(
            ONE_XMLRPC,
            session=f"{ONE_USERNAME}:{ONE_PASSWORD}",
        )
        self.redis = redis_client
        self._template_cache = None
        logger.info(f"Connected to OpenNebula at {ONE_XMLRPC}")

    # ------------------------------------------------------------------
    # Public handlers
    # ------------------------------------------------------------------

    async def create_vm(self, data: dict, nats_client) -> None:
        vm_id     = data["vmId"]
        name      = data["name"]
        cpu       = data["cpu"]
        ram_mb    = data["ramMb"]
        disk_gb   = data["diskGb"]
        os_template = data["osTemplate"]
        user_id   = data.get("userId")
        generated_ssh_public_key = data.get("sshPublicKey")

        # Idempotency: if already instantiated, just resume IP polling
        existing_one_id = get_vm_one_id(vm_id)
        if existing_one_id is not None:
            logger.info(f"VM {vm_id} already has oneVmId={existing_one_id}, resuming IP polling")
            asyncio.create_task(self._wait_for_ip_and_update(vm_id, existing_one_id, nats_client))
            return

        try:
            template_id = await self._find_template(os_template)
            if template_id is None:
                raise Exception(f"Template '{os_template}' not found in OpenNebula")

            ssh_keys: list[str] = []

            # SECURITY: host-level keys are opt-in only. Enabling this makes
            # every VM trust the same key, which weakens tenant isolation.
            if _inject_extra_ssh_keys_enabled():
                extra_keys = _load_extra_ssh_keys()
                if extra_keys:
                    ssh_keys.extend(extra_keys)

            db_ssh_key_count = 0
            if user_id:
                keys = get_user_ssh_keys(user_id)
                if keys:
                    ssh_keys.extend(keys)
                    db_ssh_key_count = len(keys)

            payload_ssh_key_count = 0
            if isinstance(generated_ssh_public_key, str) and generated_ssh_public_key.strip():
                ssh_keys.append(generated_ssh_public_key.strip())
                payload_ssh_key_count = 1

            ssh_keys = _sanitize_ssh_public_keys(ssh_keys)
            ssh_keys_str = "\n".join(ssh_keys)

            logger.info(
                "VM %s SSH keys prepared (total=%s, fromDb=%s, fromPayload=%s)",
                vm_id,
                len(ssh_keys),
                db_ssh_key_count,
                payload_ssh_key_count,
            )

            extra_template = (
                f'NAME="{name}"\n'
                f"CPU={cpu}\n"
                f"VCPU={cpu}\n"
                f"MEMORY={ram_mb}\n"
            )
            if ssh_keys_str:
                # Inject key(s) as a per-VM template attribute and let template
                # CONTEXT map it via SSH_PUBLIC_KEY="$SSH_PUBLIC_KEY".
                #
                # We encode newlines as literal \n to keep this attribute
                # single-line and parse-safe in OpenNebula template text.
                keys_for_template = ssh_keys_str.replace("\r", "").replace("\n", "\\n")
                escaped_ssh_keys = _escape_one_template_value(keys_for_template)
                extra_template += f'SSH_PUBLIC_KEY="{escaped_ssh_keys}"\n'

            one_vm_id = await asyncio.to_thread(
                self.one.template.instantiate, template_id, name, False, extra_template
            )
            logger.info(f"Instantiated VM {one_vm_id} from template {template_id}")

            update_vm_status(vm_id, "PENDING", one_vm_id=one_vm_id)
            self._cache_vm_status(vm_id, "PENDING")
            await self._publish_status(nats_client, vm_id, "PENDING", {"oneVmId": one_vm_id})

            asyncio.create_task(self._wait_for_ip_and_update(vm_id, one_vm_id, nats_client))

        except Exception as e:
            logger.error(f"Error creating VM {vm_id}: {e}", exc_info=True)
            update_vm_status(vm_id, "ERROR")
            self._cache_vm_status(vm_id, "ERROR")
            await self._publish_status(nats_client, vm_id, "ERROR", {"error": str(e)})

    async def vm_action(self, data: dict, nats_client) -> None:
        vm_id     = data["vmId"]
        one_vm_id = data["oneVmId"]
        action    = data["action"]

        action_map = {
            "start":   ("resume",    "RUNNING"),
            "stop":    ("poweroff",  "STOPPED"),
            "restart": ("reboot",    "RUNNING"),
            "delete":  ("terminate", "DELETED"),
        }

        if action not in action_map:
            logger.error(f"Unknown action '{action}' for VM {vm_id}")
            return

        one_action, target_status = action_map[action]

        try:
            await asyncio.to_thread(self.one.vm.action, one_action, one_vm_id)
            logger.info(f"Executed '{one_action}' on ONE VM {one_vm_id}")
            update_vm_status(vm_id, target_status)
            self._cache_vm_status(vm_id, target_status)
            if target_status == "DELETED":
                self._delete_vm_cache(vm_id)
            await self._publish_status(nats_client, vm_id, target_status, {
                "oneVmId": one_vm_id,
                "action": action,
            })
        except Exception as e:
            logger.error(f"Error executing {action} on VM {vm_id}: {e}", exc_info=True)
            update_vm_status(vm_id, "ERROR")
            self._cache_vm_status(vm_id, "ERROR")
            await self._publish_status(nats_client, vm_id, "ERROR", {
                "oneVmId": one_vm_id,
                "error": str(e),
            })

    async def delete_vm(self, data: dict, nats_client) -> None:
        vm_id     = data["vmId"]
        one_vm_id = data.get("oneVmId")
        user_id   = data.get("userId")

        if one_vm_id is None:
            logger.warning(f"VM {vm_id} has no oneVmId — deleting from DB without OpenNebula")
            delete_vm_record(vm_id)
            self._delete_vm_cache(vm_id)
            await self._publish_status(nats_client, vm_id, "DELETED", {"userId": user_id})
            return

        try:
            await asyncio.to_thread(self.one.vm.action, "terminate", one_vm_id)
            logger.info(f"Terminated ONE VM {one_vm_id}")
            delete_vm_record(vm_id)
            self._delete_vm_cache(vm_id)
            await self._publish_status(nats_client, vm_id, "DELETED", {
                "oneVmId": one_vm_id,
                "userId": user_id,
            })
        except Exception as e:
            logger.error(f"Error deleting VM {vm_id}: {e}", exc_info=True)
            update_vm_status(vm_id, "ERROR")
            self._cache_vm_status(vm_id, "ERROR")
            await self._publish_status(nats_client, vm_id, "ERROR", {
                "oneVmId": one_vm_id,
                "error": str(e),
            })

    async def reconcile_pending_vms(self, nats_client) -> None:
        """At startup, resume IP polling for VMs stuck in PENDING with a oneVmId."""
        from db_updater import get_vms_pending_sync
        try:
            vms = get_vms_pending_sync()
            if not vms:
                logger.info("No VMs need reconciliation")
                return
            logger.info(f"Reconciling {len(vms)} VM(s)")
            for vm in vms:
                asyncio.create_task(
                    self._wait_for_ip_and_update(vm["vmId"], vm["oneVmId"], nats_client)
                )
        except Exception as e:
            logger.error(f"Reconciliation error: {e}", exc_info=True)

    async def load_templates(self) -> None:
        try:
            self._template_cache = await asyncio.to_thread(
                self.one.templatepool.info, -2, -1, -1
            )
            count = len(self._template_cache.VMTEMPLATE)
            logger.info(f"Loaded {count} OpenNebula templates")
        except Exception as e:
            logger.error(f"Failed to load templates: {e}")
            self._template_cache = None

    async def get_template_list(self) -> list:
        if self._template_cache is None:
            await self.load_templates()
        if self._template_cache is None:
            return []
        return [
            {"id": t.ID, "name": t.NAME}
            for t in self._template_cache.VMTEMPLATE
        ]

    # ------------------------------------------------------------------
    # Redis helpers
    # ------------------------------------------------------------------

    def _cache_vm_status(self, vm_id: str, status: str, ip: str = None) -> None:
        try:
            self.redis.set(f"vm:{vm_id}:status", status, ex=REDIS_TTL)
            if ip:
                self.redis.set(f"vm:{vm_id}:ip", ip, ex=REDIS_TTL)
        except Exception as e:
            logger.warning(f"Redis write failed for VM {vm_id}: {e}")

    def _delete_vm_cache(self, vm_id: str) -> None:
        try:
            self.redis.delete(f"vm:{vm_id}:status", f"vm:{vm_id}:ip")
            logger.info(f"Cleared Redis cache for VM {vm_id}")
        except Exception as e:
            logger.warning(f"Redis delete failed for VM {vm_id}: {e}")

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _wait_for_ip_and_update(
        self,
        vm_id: str,
        one_vm_id: int,
        nats_client,
        poll_interval: int = 8,
        timeout: int = 300,
    ) -> None:
        """Background task: poll OpenNebula until RUNNING with an IP, emitting real-time states."""
        elapsed   = 0
        last_lcm  = -1

        while elapsed < timeout:
            try:
                vm    = await asyncio.to_thread(self.one.vm.info, one_vm_id)
                state = vm.STATE
                lcm   = vm.LCM_STATE

                # Terminal failure states
                if state in (6, 7):
                    logger.error(f"VM {vm_id} (ONE {one_vm_id}) failure state={state}")
                    update_vm_status(vm_id, "ERROR", one_vm_id=one_vm_id)
                    self._cache_vm_status(vm_id, "ERROR")
                    await self._publish_status(nats_client, vm_id, "ERROR", {
                        "oneVmId": one_vm_id,
                        "error": f"VM failure state={state}",
                    })
                    return

                # Emit intermediate state changes in real time (PROLOG, BOOT, etc.)
                if lcm != last_lcm and lcm in LCM_STATUS_MAP:
                    intermediate = LCM_STATUS_MAP[lcm]
                    if intermediate != "RUNNING":
                        await self._publish_status(nats_client, vm_id, intermediate, {
                            "oneVmId": one_vm_id,
                        })
                        logger.info(f"VM {vm_id} intermediate state: {intermediate}")
                    last_lcm = lcm

                # STATE=3, LCM_STATE=3 → RUNNING
                if state == 3 and lcm == 3:
                    original_ip = self._extract_ip(vm)
                    if original_ip:
                        ip = self._apply_ip_offset(original_ip, ONE_IP_OFFSET)
                        update_vm_status(
                            vm_id,
                            "RUNNING",
                            ip_address=ip,
                            one_vm_id=one_vm_id,
                            ssh_host=ip,
                            ssh_username="cloudvm",
                        )
                        self._cache_vm_status(vm_id, "RUNNING", ip=ip)
                        await self._publish_status(nats_client, vm_id, "RUNNING", {
                            "oneVmId":   one_vm_id,
                            "ipAddress": ip,
                            "sshHost":   ip,
                        })
                        logger.info(
                            "VM %s RUNNING, OpenNebula IP=%s, adjusted IP=%s",
                            vm_id,
                            original_ip,
                            ip,
                        )
                        return

            except Exception as e:
                logger.warning(f"Error polling VM {one_vm_id}: {e}")

            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

        # Timeout
        logger.error(f"VM {vm_id}: timed out waiting for IP after {timeout}s")
        update_vm_status(vm_id, "ERROR", one_vm_id=one_vm_id)
        self._cache_vm_status(vm_id, "ERROR")
        await self._publish_status(nats_client, vm_id, "ERROR", {
            "oneVmId": one_vm_id,
            "error":   "Timed out waiting for IP address",
        })

    def _extract_ip(self, vm) -> str | None:
        try:
            template = vm.TEMPLATE
            nic = template.get("NIC")
            if nic:
                if isinstance(nic, list):
                    nic = nic[0]
                if isinstance(nic, dict):
                    ip = nic.get("IP")
                    if ip:
                        return ip
            ctx = template.get("CONTEXT")
            if ctx and isinstance(ctx, dict):
                ip = ctx.get("ETH0_IP")
                if ip:
                    return ip
        except Exception as e:
            logger.warning(f"Error extracting IP from TEMPLATE: {e}")
        try:
            monitoring = vm.MONITORING
            if hasattr(monitoring, "GUEST_IP") and monitoring.GUEST_IP:
                return monitoring.GUEST_IP
            if hasattr(monitoring, "GUEST_IP_ADDRESSES") and monitoring.GUEST_IP_ADDRESSES:
                return monitoring.GUEST_IP_ADDRESSES.split(",")[0].strip()
        except Exception:
            pass
        return None

    def _apply_ip_offset(self, ip: str, offset: int) -> str:
        """
        Add `offset` to the last octet of an IPv4 address.

        offset=0  → return the IP unchanged (correct for most setups)
        offset=1  → increment last octet by 1 (set ONE_IP_OFFSET=1 in .env
                    when OpenNebula reports the bridge/gateway IP and the VM
                    guest IP is one higher)

        Any offset that would push the last octet above 255 is clamped and a
        warning is logged.
        """
        if offset == 0:
            return ip
        try:
            parts = ip.strip().split(".")
            if len(parts) != 4:
                return ip
            octets = [int(p) for p in parts]
            if any(o < 0 or o > 255 for o in octets):
                return ip
            new_last = octets[3] + offset
            if new_last > 255:
                logger.warning(
                    "ONE_IP_OFFSET=%d would push last octet of %s above 255 — keeping original",
                    offset, ip,
                )
                return ip
            octets[3] = new_last
            adjusted = ".".join(str(o) for o in octets)
            logger.info("IP offset applied: %s → %s (ONE_IP_OFFSET=%d)", ip, adjusted, offset)
            return adjusted
        except Exception:
            return ip

    async def _find_template(self, template_name: str) -> int | None:
        if self._template_cache is None:
            await self.load_templates()
        if self._template_cache is None:
            return None
        templates = self._template_cache.VMTEMPLATE

        def normalize(s: str) -> str:
            s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
            return re.sub(r"[^a-z0-9]", "", s.lower())

        target_lower = template_name.lower()
        target_norm  = normalize(template_name)

        for t in templates:
            if t.NAME == template_name:
                return t.ID
        for t in templates:
            if t.NAME.lower() == target_lower:
                return t.ID
        for t in templates:
            if normalize(t.NAME) == target_norm:
                return t.ID
        for t in templates:
            if target_lower in t.NAME.lower():
                return t.ID

        logger.warning(
            f"Template '{template_name}' not found. Available: {[t.NAME for t in templates]}"
        )
        return None

    async def _publish_status(
        self, nats_client, vm_id: str, status: str, extra_data: dict = None
    ) -> None:
        payload = {"vmId": vm_id, "status": status}
        if extra_data:
            payload.update(extra_data)
        await nats_client.publish(
            "vm.status.update",
            json.dumps(payload).encode(),
        )
        logger.info(f"Published status update for VM {vm_id}: {status}")
