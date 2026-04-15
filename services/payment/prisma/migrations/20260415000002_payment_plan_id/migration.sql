-- Store subscription plan identity explicitly instead of parsing method strings
ALTER TABLE "payments"
ADD COLUMN IF NOT EXISTS "planId" TEXT;
