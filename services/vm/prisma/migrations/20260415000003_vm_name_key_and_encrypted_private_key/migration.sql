-- Persist recoverable encrypted VM SSH keys and lifecycle stop timestamp
ALTER TABLE "virtual_machines"
ADD COLUMN IF NOT EXISTS "sshPrivateKeyEncrypted" TEXT,
ADD COLUMN IF NOT EXISTS "stoppedAt" TIMESTAMP(3);

-- Prevent duplicate VM names for the same user
CREATE UNIQUE INDEX IF NOT EXISTS "virtual_machines_userId_name_key"
ON "virtual_machines"("userId", "name");
