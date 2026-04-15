import logging
from urllib.parse import urlparse

import psycopg2

from config import DATABASE_URL

logger = logging.getLogger(__name__)


def _get_connection():
    """Create a new database connection from DATABASE_URL."""
    return psycopg2.connect(DATABASE_URL)


def update_vm_status(
    vm_id: str,
    status: str,
    ip_address: str = None,
    one_vm_id: int = None,
    ssh_host: str = None,
    ssh_username: str = None,
) -> None:
    """
    Update the virtual_machines table with the latest VM status and metadata.

    Args:
        vm_id:      Internal UUID of the VM record.
        status:     New status string (BUILDING, RUNNING, STOPPED, ERROR, DELETED).
        ip_address: Optional IP address once assigned.
        one_vm_id:  Optional OpenNebula VM ID.
        ssh_host:   Optional SSH host (usually same as ip_address).
    """
    set_clauses = ['status = %s', '"updatedAt" = NOW()']
    params: list = [status]

    if ip_address is not None:
        set_clauses.append('"ipAddress" = %s')
        params.append(ip_address)

    if one_vm_id is not None:
        set_clauses.append('"oneVmId" = %s')
        params.append(one_vm_id)

    if ssh_host is not None:
        set_clauses.append('"sshHost" = %s')
        params.append(ssh_host)

    if ssh_username is not None:
        set_clauses.append('"sshUsername" = %s')
        params.append(ssh_username)

    params.append(vm_id)

    query = f"""
        UPDATE virtual_machines
        SET {', '.join(set_clauses)}
        WHERE id = %s
    """

    conn = None
    try:
        conn = _get_connection()
        with conn.cursor() as cur:
            cur.execute(query, params)
        conn.commit()
        logger.info(f"Updated VM {vm_id} status to {status}")
    except Exception as e:
        logger.error(f"Error updating VM {vm_id} in database: {e}", exc_info=True)
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()


def get_vm_one_id(vm_id: str) -> int | None:
    """Return the oneVmId for a VM, or None if not yet assigned."""
    conn = None
    try:
        conn = _get_connection()
        with conn.cursor() as cur:
            cur.execute('SELECT "oneVmId" FROM virtual_machines WHERE id = %s', (vm_id,))
            row = cur.fetchone()
            return row[0] if row else None
    except Exception as e:
        logger.error(f"Error fetching oneVmId for VM {vm_id}: {e}")
        return None
    finally:
        if conn:
            conn.close()


def get_vms_pending_sync() -> list:
    """Return VMs in PENDING or ERROR state that already have a oneVmId (need IP polling resumed)."""
    conn = None
    try:
        conn = _get_connection()
        with conn.cursor() as cur:
            cur.execute(
                'SELECT id, "oneVmId" FROM virtual_machines '
                "WHERE status IN ('PENDING', 'ERROR') AND \"oneVmId\" IS NOT NULL"
            )
            return [{"vmId": row[0], "oneVmId": row[1]} for row in cur.fetchall()]
    except Exception as e:
        logger.error(f"Error fetching pending VMs: {e}")
        return []
    finally:
        if conn:
            conn.close()


def get_user_ssh_keys(user_id: str) -> list:
    """Return all SSH public keys for a user."""
    conn = None
    try:
        conn = _get_connection()
        with conn.cursor() as cur:
            cur.execute(
                'SELECT "publicKey" FROM ssh_keys WHERE "userId" = %s',
                (user_id,),
            )
            return [row[0] for row in cur.fetchall()]
    except Exception as e:
        logger.error(f"Error fetching SSH keys for user {user_id}: {e}")
        return []
    finally:
        if conn:
            conn.close()


def delete_vm_record(vm_id: str) -> None:
    """Hard delete a VM row from virtual_machines."""
    conn = None
    try:
        conn = _get_connection()
        with conn.cursor() as cur:
            cur.execute('DELETE FROM virtual_machines WHERE id = %s', (vm_id,))
        conn.commit()
        logger.info(f"Deleted VM {vm_id} from database")
    except Exception as e:
        logger.error(f"Error deleting VM {vm_id} from database: {e}", exc_info=True)
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()
