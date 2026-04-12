-- Alter users for MFA recovery support
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "mfaRecoveryCodeHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "mfaRecoveryCodesGeneratedAt" TIMESTAMP(3);

-- Create per-account MFA audit trail
CREATE TABLE IF NOT EXISTS "mfa_audit_logs" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "ip" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "mfa_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mfa_audit_logs_userId_createdAt_idx"
  ON "mfa_audit_logs"("userId", "createdAt");

ALTER TABLE "mfa_audit_logs"
  ADD CONSTRAINT "mfa_audit_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
