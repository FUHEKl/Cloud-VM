import logging
from contextlib import contextmanager

import psycopg2
from psycopg2.pool import ThreadedConnectionPool

from config import DATABASE_URL

logger = logging.getLogger(__name__)

_POOL: ThreadedConnectionPool | None = None


def _get_pool() -> ThreadedConnectionPool:
    global _POOL
    if _POOL is None:
        _POOL = ThreadedConnectionPool(minconn=1, maxconn=5, dsn=DATABASE_URL)
    return _POOL


@contextmanager
def _connection_cursor():
    pool = _get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            yield conn, cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


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

    if status in ("STOPPED", "ERROR", "DELETED"):
        set_clauses.append('"stoppedAt" = NOW()')

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

    try:
        with _connection_cursor() as (conn, cur):
            cur.execute(query, params)
        logger.info(f"Updated VM {vm_id} status to {status}")
    except Exception as e:
        logger.error(f"Error updating VM {vm_id} in database: {e}", exc_info=True)
        raise


def get_vm_one_id(vm_id: str) -> int | None:
    """Return the oneVmId for a VM, or None if not yet assigned."""
    try:
        with _connection_cursor() as (conn, cur):
            cur.execute('SELECT "oneVmId" FROM virtual_machines WHERE id = %s', (vm_id,))
            row = cur.fetchone()
            return row[0] if row else None
    except Exception as e:
        logger.error(f"Error fetching oneVmId for VM {vm_id}: {e}")
        return None


def get_vms_pending_sync() -> list:
    """Return VMs in PENDING or ERROR state that already have a oneVmId (need IP polling resumed)."""
    try:
        with _connection_cursor() as (conn, cur):
            cur.execute(
                'SELECT id, "oneVmId" FROM virtual_machines '
                "WHERE status IN ('PENDING', 'ERROR') AND \"oneVmId\" IS NOT NULL"
            )
            return [{"vmId": row[0], "oneVmId": row[1]} for row in cur.fetchall()]
    except Exception as e:
        logger.error(f"Error fetching pending VMs: {e}")
        return []


def get_user_ssh_keys(user_id: str) -> list:
    """Return all SSH public keys for a user."""
    try:
        with _connection_cursor() as (conn, cur):
            cur.execute(
                'SELECT "publicKey" FROM ssh_keys WHERE "userId" = %s',
                (user_id,),
            )
            return [row[0] for row in cur.fetchall()]
    except Exception as e:
        logger.error(f"Error fetching SSH keys for user {user_id}: {e}")
        return []


def delete_vm_record(vm_id: str) -> None:
    """Soft-delete a VM row from virtual_machines so billing history remains intact."""
    try:
        with _connection_cursor() as (conn, cur):
            cur.execute(
                'UPDATE virtual_machines SET status = %s, "stoppedAt" = NOW(), "updatedAt" = NOW() WHERE id = %s',
                ("DELETED", vm_id),
            )
        logger.info(f"Soft-deleted VM {vm_id} in database")
    except Exception as e:
        logger.error(f"Error soft-deleting VM {vm_id} from database: {e}", exc_info=True)
        raise
