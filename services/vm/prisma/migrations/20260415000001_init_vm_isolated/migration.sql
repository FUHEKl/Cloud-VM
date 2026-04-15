-- Baseline migration for isolated vm database

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VmStatus') THEN
    CREATE TYPE "VmStatus" AS ENUM ('PENDING', 'RUNNING', 'STOPPED', 'SUSPENDED', 'ERROR', 'DELETED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "plans" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "maxVms" INTEGER NOT NULL DEFAULT 3,
  "cpu" INTEGER NOT NULL,
  "ramMb" INTEGER NOT NULL,
  "diskGb" INTEGER NOT NULL,
  "priceMonthly" DOUBLE PRECISION NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "plans_name_key" ON "plans"("name");

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
  "sshPrivateKeyEncrypted" TEXT,
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'virtual_machines_planId_fkey') THEN
    ALTER TABLE "virtual_machines"
      ADD CONSTRAINT "virtual_machines_planId_fkey"
      FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
