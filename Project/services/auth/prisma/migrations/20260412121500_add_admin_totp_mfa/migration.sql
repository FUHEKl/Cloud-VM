-- Add admin TOTP MFA fields
ALTER TABLE "users"
  ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mfaSecret" TEXT,
  ADD COLUMN "mfaEnabledAt" TIMESTAMP(3);
