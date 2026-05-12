/*
  Warnings:

  - A unique constraint covering the columns `[guiCallbackToken]` on the table `virtual_machines` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "virtual_machines" ADD COLUMN     "guiCallbackToken" TEXT,
ADD COLUMN     "guiReady" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "guiReadyAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "virtual_machines_guiCallbackToken_key" ON "virtual_machines"("guiCallbackToken");
