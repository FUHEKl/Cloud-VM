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
