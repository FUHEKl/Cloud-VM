-- Add planId to user quotas
ALTER TABLE "user_quotas" ADD COLUMN "planId" TEXT;

-- Add plan configs catalog
CREATE TABLE "plan_configs" (
	"id" TEXT NOT NULL,
	"planId" TEXT NOT NULL,
	"amountDt" DOUBLE PRECISION NOT NULL,
	"rank" INTEGER NOT NULL,
	"vmHoursMonthly" INTEGER NOT NULL,
	"maxVms" INTEGER NOT NULL,
	"maxCpu" INTEGER NOT NULL,
	"maxRamMb" INTEGER NOT NULL,
	"maxDiskGb" INTEGER NOT NULL,
	"updatedAt" TIMESTAMP(3) NOT NULL,

	CONSTRAINT "plan_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plan_configs_planId_key" ON "plan_configs"("planId");
