-- Baseline migration for isolated user database

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role') THEN
    CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VmStatus') THEN
    CREATE TYPE "VmStatus" AS ENUM ('PENDING', 'RUNNING', 'STOPPED', 'SUSPENDED', 'ERROR', 'DELETED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'USER',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
  "mfaSecret" TEXT,
  "mfaEnabledAt" TIMESTAMP(3),
  "mfaRecoveryCodeHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "mfaRecoveryCodesGeneratedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

CREATE TABLE IF NOT EXISTS "refresh_tokens" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "refresh_tokens_token_key" ON "refresh_tokens"("token");

CREATE TABLE IF NOT EXISTS "ssh_keys" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "publicKey" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ssh_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ssh_keys_userId_fingerprint_key" ON "ssh_keys"("userId", "fingerprint");

CREATE TABLE IF NOT EXISTS "virtual_machines" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "oneVmId" INTEGER,
  "status" "VmStatus" NOT NULL DEFAULT 'PENDING',
  "cpu" INTEGER NOT NULL,
  "ramMb" INTEGER NOT NULL,
  "diskGb" INTEGER NOT NULL,
  "ipAddress" TEXT,
  "osTemplate" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planId" TEXT,
  "sshHost" TEXT,
  "sshPort" INTEGER DEFAULT 22,
  "sshUsername" TEXT DEFAULT 'root',
  "stoppedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "virtual_machines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "virtual_machines_userId_name_key" ON "virtual_machines"("userId", "name");

CREATE TABLE IF NOT EXISTS "user_quotas" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "maxVms" INTEGER NOT NULL DEFAULT 3,
  "maxCpu" INTEGER NOT NULL DEFAULT 4,
  "maxRamMb" INTEGER NOT NULL DEFAULT 4096,
  "maxDiskGb" INTEGER NOT NULL DEFAULT 50,
  CONSTRAINT "user_quotas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_quotas_userId_key" ON "user_quotas"("userId");

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

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

CREATE INDEX IF NOT EXISTS "mfa_audit_logs_userId_createdAt_idx" ON "mfa_audit_logs"("userId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refresh_tokens_userId_fkey') THEN
    ALTER TABLE "refresh_tokens"
      ADD CONSTRAINT "refresh_tokens_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ssh_keys_userId_fkey') THEN
    ALTER TABLE "ssh_keys"
      ADD CONSTRAINT "ssh_keys_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'virtual_machines_userId_fkey') THEN
    ALTER TABLE "virtual_machines"
      ADD CONSTRAINT "virtual_machines_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_quotas_userId_fkey') THEN
    ALTER TABLE "user_quotas"
      ADD CONSTRAINT "user_quotas_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_userId_fkey') THEN
    ALTER TABLE "notifications"
      ADD CONSTRAINT "notifications_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mfa_audit_logs_userId_fkey') THEN
    ALTER TABLE "mfa_audit_logs"
      ADD CONSTRAINT "mfa_audit_logs_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
