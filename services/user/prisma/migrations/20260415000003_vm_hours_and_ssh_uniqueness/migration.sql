-- Add stoppedAt to improve VM-hour billing accuracy
ALTER TABLE "virtual_machines"
ADD COLUMN IF NOT EXISTS "stoppedAt" TIMESTAMP(3);

-- Prevent duplicate SSH keys per user fingerprint
CREATE UNIQUE INDEX IF NOT EXISTS "ssh_keys_userId_fingerprint_key"
ON "ssh_keys"("userId", "fingerprint");

-- Prevent duplicate VM names for the same user
CREATE UNIQUE INDEX IF NOT EXISTS "virtual_machines_userId_name_key"
ON "virtual_machines"("userId", "name");
