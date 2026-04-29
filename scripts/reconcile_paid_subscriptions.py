#!/usr/bin/env python3
"""
One-time reconciliation utility:
Sync latest paid subscription plans from payment DB into user DB quotas.

Why this exists:
- Historical split-DB bug could mark payments as paid in cloudvm_payment,
  while user quotas in cloudvm_user were not updated.

What it does:
1) Reads latest paid/admin_granted plan per user from payment DB.
2) Upserts matching quota into user DB (student/pro/enterprise/unlimited).

Usage (from repo root):
  python scripts/reconcile_paid_subscriptions.py
  python scripts/reconcile_paid_subscriptions.py --dry-run
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple


DEFAULT_PLAN_CATALOG = {
    "student": {
        "quota": {"maxVms": 2, "maxCpu": 2, "maxRamMb": 4096, "maxDiskGb": 40}
    },
    "pro": {
        "quota": {"maxVms": 6, "maxCpu": 8, "maxRamMb": 16384, "maxDiskGb": 120}
    },
    "enterprise": {
        "quota": {"maxVms": 20, "maxCpu": 32, "maxRamMb": 65536, "maxDiskGb": 400}
    },
}

UNLIMITED_QUOTA = {"maxVms": 9999, "maxCpu": 9999, "maxRamMb": 999999, "maxDiskGb": 99999}


@dataclass
class DbSettings:
    container: str
    pg_user: str
    pg_password: str
    payment_db: str
    user_db: str


def parse_dotenv(env_path: Path) -> Dict[str, str]:
    values: Dict[str, str] = {}
    if not env_path.exists():
        return values

    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values

def run_psql(db: str, sql: str, settings: DbSettings, vars: Dict[str, str] | None = None) -> str:
    cmd = [
        "docker", "exec", "-i", settings.container,
        "psql", "-U", settings.pg_user, "-d", db,
        "-v", "ON_ERROR_STOP=1", "--csv", "-f", "-"
    ]
    if vars:
        for k, v in vars.items():
            cmd.extend(["-v", f"{k}={v}"])

    env = os.environ.copy()
    env["PGPASSWORD"] = settings.pg_password
    result = subprocess.run(cmd, input=sql, text=True, capture_output=True, env=env)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"psql failed for database '{db}'")
    return result.stdout


def load_plan_catalog(env: Dict[str, str]) -> Dict[str, Dict[str, int]]:
    raw = env.get("PLAN_CATALOG_JSON", "").strip()
    if not raw:
        return {
            "student": DEFAULT_PLAN_CATALOG["student"]["quota"],
            "pro": DEFAULT_PLAN_CATALOG["pro"]["quota"],
            "enterprise": DEFAULT_PLAN_CATALOG["enterprise"]["quota"],
            "unlimited": UNLIMITED_QUOTA,
        }

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {
            "student": DEFAULT_PLAN_CATALOG["student"]["quota"],
            "pro": DEFAULT_PLAN_CATALOG["pro"]["quota"],
            "enterprise": DEFAULT_PLAN_CATALOG["enterprise"]["quota"],
            "unlimited": UNLIMITED_QUOTA,
        }

    def quota(plan: str, default_quota: Dict[str, int]) -> Dict[str, int]:
        q = (parsed.get(plan) or {}).get("quota") or {}
        return {
            "maxVms": int(q.get("maxVms", default_quota["maxVms"])),
            "maxCpu": int(q.get("maxCpu", default_quota["maxCpu"])),
            "maxRamMb": int(q.get("maxRamMb", default_quota["maxRamMb"])),
            "maxDiskGb": int(q.get("maxDiskGb", default_quota["maxDiskGb"])),
        }

    return {
        "student": quota("student", DEFAULT_PLAN_CATALOG["student"]["quota"]),
        "pro": quota("pro", DEFAULT_PLAN_CATALOG["pro"]["quota"]),
        "enterprise": quota("enterprise", DEFAULT_PLAN_CATALOG["enterprise"]["quota"]),
        "unlimited": UNLIMITED_QUOTA,
    }


def fetch_latest_paid_plans(settings: DbSettings) -> List[Tuple[str, str]]:
    sql = """
SELECT DISTINCT ON ("userId")
  "userId",
  COALESCE(
    NULLIF("planId", ''),
    substring(lower(COALESCE(method, '')) from ':plan:(student|pro|enterprise|unlimited)')
  ) AS plan_id
FROM payments
WHERE status IN ('paid', 'admin_granted')
ORDER BY "userId", "createdAt" DESC;
"""

    out = run_psql(settings.payment_db, sql, settings)
    rows = list(csv.DictReader(io.StringIO(out)))

    result: List[Tuple[str, str]] = []
    for row in rows:
        user_id = (row.get("userId") or "").strip()
        plan_id = (row.get("plan_id") or "").strip().lower()
        if not user_id or plan_id not in {"student", "pro", "enterprise", "unlimited"}:
            continue
        result.append((user_id, plan_id))

    return result


def user_exists(user_id: str, settings: DbSettings) -> bool:
    sql = "SELECT EXISTS(SELECT 1 FROM users WHERE id = :'user_id') AS exists;"
    out = run_psql(settings.user_db, sql, settings, vars={"user_id": user_id})
    if len(out) < 2:
        return False
    return out[1].strip().lower() in {"t", "true", "1"}


def apply_quota(user_id: str, quota: Dict[str, int], settings: DbSettings) -> None:
    sql = f"""
    INSERT INTO user_quotas (id, "userId", "maxVms", "maxCpu", "maxRamMb", "maxDiskGb")
    VALUES (gen_random_uuid()::text, :'user_id', {quota['maxVms']}, {quota['maxCpu']}, {quota['maxRamMb']}, {quota['maxDiskGb']})
    ON CONFLICT ("userId") DO UPDATE
    SET
    "maxVms" = EXCLUDED."maxVms",
    "maxCpu" = EXCLUDED."maxCpu",
    "maxRamMb" = EXCLUDED."maxRamMb",
    "maxDiskGb" = EXCLUDED."maxDiskGb";
    """
    run_psql(settings.user_db, sql, settings, vars={"user_id": user_id})


def main() -> int:
    parser = argparse.ArgumentParser(description="Reconcile paid subscriptions into user quotas")
    parser.add_argument("--dry-run", action="store_true", help="Print actions without writing user quotas")
    parser.add_argument("--container", default="pfe-postgres-1", help="Postgres container name")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    env = parse_dotenv(repo_root / ".env")

    settings = DbSettings(
        container=args.container,
        pg_user=env.get("POSTGRES_USER", "cloudvm"),
        pg_password=env.get("POSTGRES_PASSWORD", "cloudvm_secret"),
        payment_db=(env.get("PAYMENT_DATABASE_URL", "").rsplit("/", 1)[-1] or "cloudvm_payment"),
        user_db=(env.get("USER_DATABASE_URL", "").rsplit("/", 1)[-1] or "cloudvm_user"),
    )

    quotas = load_plan_catalog(env)
    latest = fetch_latest_paid_plans(settings)

    if not latest:
        print("No paid subscriptions found. Nothing to reconcile.")
        return 0

    updated = 0
    skipped_missing_users = 0

    print(f"Found {len(latest)} paid subscriptions to reconcile.")
    for user_id, plan_id in latest:
        if not user_exists(user_id, settings):
            skipped_missing_users += 1
            print(f"- SKIP user not found in user DB: {user_id} ({plan_id})")
            continue

        quota = quotas[plan_id]
        if args.dry_run:
            print(
                f"- DRY-RUN user={user_id} plan={plan_id} "
                f"quota=({quota['maxVms']} vms, {quota['maxCpu']} cpu, {quota['maxRamMb']} ramMb, {quota['maxDiskGb']} diskGb)"
            )
            continue

        apply_quota(user_id, quota, settings)
        updated += 1
        print(f"- UPDATED user={user_id} plan={plan_id}")

    mode = "DRY-RUN" if args.dry_run else "APPLY"
    print(f"Done [{mode}]. updated={updated}, skipped_missing_users={skipped_missing_users}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
