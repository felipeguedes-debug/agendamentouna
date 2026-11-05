-- Block 5: cadence engine and WhatsAPI.
-- Cadence steps get a version: saving changed steps writes the rows of a new
-- version, and the older rows stay for the dispatch log and for the dispatches kept
-- in the next 24 h (PRD 6, rule 7). Dispatches get the sender's lease and attempts,
-- and the reason column now covers failed, skipped and canceled dispatches.

-- DropIndex
DROP INDEX "CadenceStep_cadenceId_position_key";

-- AlterTable
ALTER TABLE "CadenceStep" ADD COLUMN     "cadenceVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Dispatch" RENAME COLUMN "failureReason" TO "statusReason";
ALTER TABLE "Dispatch" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "SandboxMessage" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "whatsappInstanceId" UUID NOT NULL,
    "dispatchId" UUID,
    "toPhone" TEXT,
    "text" TEXT,
    "providerMessageId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SandboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SandboxMessage_providerMessageId_key" ON "SandboxMessage"("providerMessageId");

-- CreateIndex
CREATE INDEX "SandboxMessage_practiceId_createdAt_idx" ON "SandboxMessage"("practiceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SandboxMessage_id_practiceId_key" ON "SandboxMessage"("id", "practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CadenceStep_cadenceId_cadenceVersion_position_key" ON "CadenceStep"("cadenceId", "cadenceVersion", "position");

-- CreateIndex
CREATE INDEX "Dispatch_whatsappInstanceId_providerMessageId_idx" ON "Dispatch"("whatsappInstanceId", "providerMessageId");

-- AddForeignKey
ALTER TABLE "SandboxMessage" ADD CONSTRAINT "SandboxMessage_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SandboxMessage" ADD CONSTRAINT "SandboxMessage_whatsappInstanceId_practiceId_fkey" FOREIGN KEY ("whatsappInstanceId", "practiceId") REFERENCES "WhatsappInstance"("id", "practiceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SandboxMessage" ADD CONSTRAINT "SandboxMessage_dispatchId_practiceId_fkey" FOREIGN KEY ("dispatchId", "practiceId") REFERENCES "Dispatch"("id", "practiceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Practice isolation (D-30): the new table's practiceId never changes.
CREATE TRIGGER "SandboxMessage_practice_immutable"
  BEFORE UPDATE OF "practiceId" ON "SandboxMessage"
  FOR EACH ROW EXECUTE FUNCTION forbid_practice_change();
