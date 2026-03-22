import json
import asyncio
import logging

import pyone

from config import ONE_XMLRPC, ONE_USERNAME, ONE_PASSWORD
from db_updater import update_vm_status

logger = logging.getLogger(__name__)


class VMHandler:
    """Handles OpenNebula VM lifecycle operations."""

    def __init__(self):
        self.one = pyone.OneServer(
            ONE_XMLRPC,
            session=f"{ONE_USERNAME}:{ONE_PASSWORD}",
        )
        logger.info(f"Connected to OpenNebula at {ONE_XMLRPC}")

    # ------------------------------------------------------------------
    # Public handlers
    # ------------------------------------------------------------------

    async def create_vm(self, data: dict, nats_client) -> None:
        """
        Create a VM from an OpenNebula template.

        Expected data keys:
            vmId        - internal DB id of the VM record
            name        - display name
            cpu         - number of vCPUs
            ramMb       - RAM in megabytes
            diskGb      - root disk in gigabytes
            osTemplate  - name of the ONE template
            userId      - owner user id
        """
        vm_id = data["vmId"]
        name = data["name"]
        cpu = data["cpu"]
        ram_mb = data["ramMb"]
        disk_gb = data["diskGb"]
        os_template = data["osTemplate"]

        try:
            # 1. Find the template by name
            template_id = await self._find_template(os_template)
            if template_id is None:
                raise Exception(f"Template '{os_template}' not found in OpenNebula")

            # 2. Build extra template string for customisation
            disk_size_mb = disk_gb * 1024
            extra_template = (
                f'NAME="{name}"\n'
                f"CPU={cpu}\n"
                f"VCPU={cpu}\n"
                f"MEMORY={ram_mb}\n"
                f'DISK=[SIZE={disk_size_mb}]\n'
            )

            # 3. Instantiate the template
            one_vm_id = await asyncio.to_thread(
                self.one.template.instantiate, template_id, name, False, extra_template
            )
            logger.info(f"Instantiated VM {one_vm_id} from template {template_id}")

            # Update DB with ONE VM id
            update_vm_status(vm_id, "BUILDING", one_vm_id=one_vm_id)

            # 4. Wait for an IP address
            ip_address = await self._get_vm_ip(one_vm_id)

            if ip_address:
                update_vm_status(
                    vm_id,
                    "RUNNING",
                    ip_address=ip_address,
                    one_vm_id=one_vm_id,
                    ssh_host=ip_address,
                )
                await self._publish_status(nats_client, vm_id, "RUNNING", {
                    "oneVmId": one_vm_id,
                    "ipAddress": ip_address,
                    "sshHost": ip_address,
                })
                logger.info(f"VM {vm_id} is RUNNING with IP {ip_address}")
            else:
                update_vm_status(vm_id, "ERROR", one_vm_id=one_vm_id)
                await self._publish_status(nats_client, vm_id, "ERROR", {
                    "oneVmId": one_vm_id,
                    "error": "Timed out waiting for IP address",
                })
                logger.error(f"VM {vm_id}: timed out waiting for IP")

        except Exception as e:
            logger.error(f"Error creating VM {vm_id}: {e}", exc_info=True)
            update_vm_status(vm_id, "ERROR")
            await self._publish_status(nats_client, vm_id, "ERROR", {
                "error": str(e),
            })

    async def vm_action(self, data: dict, nats_client) -> None:
        """
        Execute a lifecycle action on an existing VM.

        Expected data keys:
            vmId     - internal DB id
            oneVmId  - OpenNebula VM id
            action   - one of: start, stop, restart, delete
        """
        vm_id = data["vmId"]
        one_vm_id = data["oneVmId"]
        action = data["action"]

        action_map = {
            "start": ("resume", "RUNNING"),
            "stop": ("poweroff", "STOPPED"),
            "restart": ("reboot", "RUNNING"),
            "delete": ("terminate", "DELETED"),
        }

        if action not in action_map:
            logger.error(f"Unknown action '{action}' for VM {vm_id}")
            return

        one_action, target_status = action_map[action]

        try:
            await asyncio.to_thread(
                self.one.vm.action, one_action, one_vm_id
            )
            logger.info(f"Executed '{one_action}' on ONE VM {one_vm_id}")

            update_vm_status(vm_id, target_status)
            await self._publish_status(nats_client, vm_id, target_status, {
                "oneVmId": one_vm_id,
                "action": action,
            })

        except Exception as e:
            logger.error(f"Error executing {action} on VM {vm_id}: {e}", exc_info=True)
            update_vm_status(vm_id, "ERROR")
            await self._publish_status(nats_client, vm_id, "ERROR", {
                "oneVmId": one_vm_id,
                "error": str(e),
            })

    async def delete_vm(self, data: dict, nats_client) -> None:
        """
        Terminate and delete a VM in OpenNebula.

        Expected data keys:
            vmId    - internal DB id
            oneVmId - OpenNebula VM id
        """
        vm_id = data["vmId"]
        one_vm_id = data["oneVmId"]

        try:
            await asyncio.to_thread(
                self.one.vm.action, "terminate", one_vm_id
            )
            logger.info(f"Terminated ONE VM {one_vm_id}")

            update_vm_status(vm_id, "DELETED")
            await self._publish_status(nats_client, vm_id, "DELETED", {
                "oneVmId": one_vm_id,
            })

        except Exception as e:
            logger.error(f"Error deleting VM {vm_id}: {e}", exc_info=True)
            update_vm_status(vm_id, "ERROR")
            await self._publish_status(nats_client, vm_id, "ERROR", {
                "oneVmId": one_vm_id,
                "error": str(e),
            })

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _find_template(self, template_name: str) -> int | None:
        """Find an OpenNebula template by name and return its ID."""
        try:
            # List all templates accessible to the user (-2 = all, -1 = start, -1 = end)
            templates = await asyncio.to_thread(
                self.one.templatepool.info, -2, -1, -1
            )
            for tmpl in templates.VMTEMPLATE:
                if tmpl.NAME == template_name:
                    return tmpl.ID
        except Exception as e:
            logger.error(f"Error searching for template '{template_name}': {e}")
        return None

    async def _get_vm_ip(self, one_vm_id: int, poll_interval: int = 5, timeout: int = 120) -> str | None:
        """Poll OpenNebula until the VM has an IP address or timeout."""
        elapsed = 0
        while elapsed < timeout:
            try:
                vm_info = await asyncio.to_thread(self.one.vm.info, one_vm_id)
                # Try to extract IP from the NIC section
                template = vm_info.TEMPLATE
                if hasattr(template, "NIC"):
                    nics = template.NIC if isinstance(template.NIC, list) else [template.NIC]
                    for nic in nics:
                        ip = getattr(nic, "IP", None)
                        if ip:
                            return ip
            except Exception as e:
                logger.warning(f"Error polling VM {one_vm_id} for IP: {e}")

            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

        return None

    async def _publish_status(self, nats_client, vm_id: str, status: str, extra_data: dict = None) -> None:
        """Publish a status update message to vm.status.update."""
        payload = {
            "vmId": vm_id,
            "status": status,
        }
        if extra_data:
            payload.update(extra_data)

        await nats_client.publish(
            "vm.status.update",
            json.dumps(payload).encode(),
        )
        logger.info(f"Published status update for VM {vm_id}: {status}")
