#!/usr/bin/env python3
"""Insert a fake VM row for billing tests, then optionally clean it up.

Example:
  python scripts/fake_vm.py --user-id <uuid> --hours 50 --status STOPPED
"""

from __future__ import annotations

import argparse
import os
import sys
import uuid
from datetime import datetime, timedelta

import psycopg2


def start_of_month(now: datetime) -> datetime:
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a fake VM row for billing tests.")
    parser.add_argument("--user-id", required=True, help="Existing user UUID from the database")
    parser.add_argument("--hours", type=float, default=50, help="Hours of usage to simulate")
    parser.add_argument(
        "--status",
        choices=["STOPPED", "RUNNING"],
        default="STOPPED",
        help="VM status (RUNNING keeps counting usage)",
    )
    parser.add_argument(
        "--db-url",
        default=os.getenv("DATABASE_URL", "postgresql://cloudvm:910204@localhost:5434/cloudvm"),
        help="PostgreSQL connection string",
    )
    parser.add_argument(
        "--keep",
        action="store_true",
        help="Keep the fake VM row (skip interactive cleanup)",
    )
    args = parser.parse_args()

    created_at = start_of_month(datetime.now())
    stopped_at = None
    if args.status == "STOPPED":
        stopped_at = created_at + timedelta(hours=args.hours)

    vm_id = str(uuid.uuid4())
    vm_name = f"fake-billing-{int(datetime.now().timestamp())}"

    insert_sql = """
        INSERT INTO virtual_machines (
          "id",
          "name",
          "oneVmId",
          "status",
          "cpu",
          "ramMb",
          "diskGb",
          "ipAddress",
          "osTemplate",
          "userId",
          "planId",
          "sshHost",
          "sshPort",
          "sshUsername",
          "sshPrivateKeyEncrypted",
          "stoppedAt",
          "createdAt",
          "updatedAt"
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """

    delete_sql = "DELETE FROM virtual_machines WHERE id = %s"

    conn = psycopg2.connect(args.db_url)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    insert_sql,
                    (
                        vm_id,
                        vm_name,
                        9999,
                        args.status,
                        1,
                        1024,
                        10,
                        None,
                        "test",
                        args.user_id,
                        None,
                        None,
                        22,
                        "root",
                        None,
                        stopped_at,
                        created_at,
                        created_at,
                    ),
                )

        print("[OK] Fake VM inserted")
        print(f"  id: {vm_id}")
        print(f"  name: {vm_name}")
        print(f"  status: {args.status}")
        print(f"  createdAt: {created_at.isoformat()}")
        print(f"  stoppedAt: {stopped_at.isoformat() if stopped_at else 'NULL'}")

        if args.keep:
            print("[INFO] --keep specified; leaving row in place.")
            return 0

        input("\nPress Enter after verifying billing to delete the fake VM...")

        with conn:
            with conn.cursor() as cur:
                cur.execute(delete_sql, (vm_id,))

        print("[OK] Fake VM deleted")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
