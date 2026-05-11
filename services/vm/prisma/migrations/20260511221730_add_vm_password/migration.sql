/*
  Warnings:

  - You are about to drop the column `sshPrivateKeyEncrypted` on the `virtual_machines` table. All the data in the column will be lost.
  - You are about to drop the `mfa_audit_logs` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "virtual_machines" DROP COLUMN "sshPrivateKeyEncrypted",
ADD COLUMN     "vmPasswordEncrypted" TEXT,
ALTER COLUMN "sshUsername" SET DEFAULT 'cloudvm';

-- DropTable
DROP TABLE "mfa_audit_logs";
