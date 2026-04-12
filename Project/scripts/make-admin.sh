#!/usr/bin/env bash
# =============================================================================
# make-admin.sh  <email>
#
# Promotes a registered user to the ADMIN role and sets unlimited quotas.
# Run AFTER the stack is started (Postgres must be reachable).
#
# Usage:
#   ./scripts/make-admin.sh your@email.com
# =============================================================================
set -euo pipefail

EMAIL="${1:-}"
if [[ -z "$EMAIL" ]]; then
    echo "Usage: $0 <user-email>"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load .env to get DB credentials
set -a
source "$PROJECT_DIR/.env"
set +a

POSTGRES_USER="${POSTGRES_USER:-cloudvm}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-cloudvm_secret}"
POSTGRES_DB="${POSTGRES_DB:-cloudvm}"
POSTGRES_PORT="${POSTGRES_HOST_PORT:-5434}"

export PGPASSWORD="$POSTGRES_PASSWORD"

echo "[INFO] Promoting '$EMAIL' to ADMIN with unlimited quota..."

psql -h localhost -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<SQL
-- Promote user to ADMIN
UPDATE "User"
SET    role = 'ADMIN'
WHERE  email = '$EMAIL';

-- Unlimited quota: 9999 VMs, 999 vCPUs, 999 GB RAM, 100 TB disk
INSERT INTO "UserQuota" ("id","userId","maxVms","maxCpu","maxRamMb","maxDiskGb","createdAt","updatedAt")
SELECT
    gen_random_uuid()::text,
    id,
    9999,
    999,
    999 * 1024,
    100 * 1024,
    NOW(),
    NOW()
FROM "User"
WHERE email = '$EMAIL'
ON CONFLICT ("userId") DO UPDATE
    SET "maxVms"   = 9999,
        "maxCpu"   = 999,
        "maxRamMb" = 999 * 1024,
        "maxDiskGb"= 100 * 1024,
        "updatedAt"= NOW();

SELECT id, email, role FROM "User" WHERE email = '$EMAIL';
SQL

echo ""
echo "[OK] Done. '$EMAIL' is now ADMIN with unlimited resources."
echo "     Log out and back in so the new JWT role takes effect."
