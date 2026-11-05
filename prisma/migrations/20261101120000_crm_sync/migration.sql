-- Block 7: SynkronosCRM through FlwChat (D-66 to D-70).
-- The practice's account moves to its own table, with the token encrypted and the
-- webhook secret hashed (D-67, D-68); Practice.flwchatTokenEncrypted was never used.
-- Patients and appointments get the state of their export to the CRM (D-68), the
-- secretary's commands get a log (D-66), and the sandbox provider its fake CRM.

-- CreateEnum
CREATE TYPE "CrmConnectionStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "crmNoteIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "crmSyncAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "crmSyncError" TEXT,
ADD COLUMN     "crmSyncRequestedAt" TIMESTAMPTZ(3),
ADD COLUMN     "crmSyncRetryAt" TIMESTAMPTZ(3),
ADD COLUMN     "crmSyncedAt" TIMESTAMPTZ(3),
ADD COLUMN     "crmSyncedStatus" "AppointmentStatus";

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "crmContactId" TEXT,
ADD COLUMN     "crmEraseRequestedAt" TIMESTAMPTZ(3),
ADD COLUMN     "crmSyncAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "crmSyncError" TEXT,
ADD COLUMN     "crmSyncRequestedAt" TIMESTAMPTZ(3),
ADD COLUMN     "crmSyncRetryAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Practice" DROP COLUMN "flwchatTokenEncrypted";

-- CreateTable
CREATE TABLE "CrmConnection" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "tokenEncrypted" TEXT NOT NULL,
    "status" "CrmConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "statusChangedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "companyId" TEXT,
    "subscriptionId" TEXT,
    "webhookSecretHash" TEXT,
    "connectedByUserId" UUID,
    "reconciledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CrmConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmInboundEvent" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "deliveryKey" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "externalContactId" TEXT,
    "patientId" UUID,
    "appointmentId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmInboundEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandboxCrmContact" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "tagNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hasConversation" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SandboxCrmContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandboxCrmNote" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SandboxCrmNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandboxCrmSubscription" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SandboxCrmSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrmConnection_practiceId_key" ON "CrmConnection"("practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmConnection_webhookSecretHash_key" ON "CrmConnection"("webhookSecretHash");

-- CreateIndex
CREATE UNIQUE INDEX "CrmConnection_id_practiceId_key" ON "CrmConnection"("id", "practiceId");

-- CreateIndex
CREATE INDEX "CrmInboundEvent_practiceId_createdAt_idx" ON "CrmInboundEvent"("practiceId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmInboundEvent_practiceId_patientId_idx" ON "CrmInboundEvent"("practiceId", "patientId");

-- CreateIndex
CREATE INDEX "CrmInboundEvent_practiceId_appointmentId_idx" ON "CrmInboundEvent"("practiceId", "appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmInboundEvent_id_practiceId_key" ON "CrmInboundEvent"("id", "practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmInboundEvent_practiceId_deliveryKey_command_key" ON "CrmInboundEvent"("practiceId", "deliveryKey", "command");

-- CreateIndex
CREATE UNIQUE INDEX "SandboxCrmContact_id_practiceId_key" ON "SandboxCrmContact"("id", "practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "SandboxCrmContact_practiceId_phone_key" ON "SandboxCrmContact"("practiceId", "phone");

-- CreateIndex
CREATE INDEX "SandboxCrmNote_practiceId_contactId_idx" ON "SandboxCrmNote"("practiceId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "SandboxCrmNote_id_practiceId_key" ON "SandboxCrmNote"("id", "practiceId");

-- CreateIndex
CREATE INDEX "SandboxCrmSubscription_practiceId_idx" ON "SandboxCrmSubscription"("practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "SandboxCrmSubscription_id_practiceId_key" ON "SandboxCrmSubscription"("id", "practiceId");

-- CreateIndex
CREATE INDEX "Appointment_crmSyncRequestedAt_idx" ON "Appointment"("crmSyncRequestedAt");

-- CreateIndex
CREATE INDEX "Patient_crmSyncRequestedAt_idx" ON "Patient"("crmSyncRequestedAt");

-- CreateIndex
CREATE INDEX "Patient_crmEraseRequestedAt_idx" ON "Patient"("crmEraseRequestedAt");

-- AddForeignKey
ALTER TABLE "CrmConnection" ADD CONSTRAINT "CrmConnection_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmInboundEvent" ADD CONSTRAINT "CrmInboundEvent_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmInboundEvent" ADD CONSTRAINT "CrmInboundEvent_patientId_practiceId_fkey" FOREIGN KEY ("patientId", "practiceId") REFERENCES "Patient"("id", "practiceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmInboundEvent" ADD CONSTRAINT "CrmInboundEvent_appointmentId_practiceId_fkey" FOREIGN KEY ("appointmentId", "practiceId") REFERENCES "Appointment"("id", "practiceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SandboxCrmContact" ADD CONSTRAINT "SandboxCrmContact_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SandboxCrmNote" ADD CONSTRAINT "SandboxCrmNote_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SandboxCrmNote" ADD CONSTRAINT "SandboxCrmNote_contactId_practiceId_fkey" FOREIGN KEY ("contactId", "practiceId") REFERENCES "SandboxCrmContact"("id", "practiceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SandboxCrmSubscription" ADD CONSTRAINT "SandboxCrmSubscription_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Practice isolation (D-30): the new practice-scoped tables' practiceId never changes.
CREATE TRIGGER "CrmConnection_practice_immutable"
  BEFORE UPDATE OF "practiceId" ON "CrmConnection"
  FOR EACH ROW EXECUTE FUNCTION forbid_practice_change();

CREATE TRIGGER "CrmInboundEvent_practice_immutable"
  BEFORE UPDATE OF "practiceId" ON "CrmInboundEvent"
  FOR EACH ROW EXECUTE FUNCTION forbid_practice_change();

CREATE TRIGGER "SandboxCrmContact_practice_immutable"
  BEFORE UPDATE OF "practiceId" ON "SandboxCrmContact"
  FOR EACH ROW EXECUTE FUNCTION forbid_practice_change();

CREATE TRIGGER "SandboxCrmNote_practice_immutable"
  BEFORE UPDATE OF "practiceId" ON "SandboxCrmNote"
  FOR EACH ROW EXECUTE FUNCTION forbid_practice_change();

CREATE TRIGGER "SandboxCrmSubscription_practice_immutable"
  BEFORE UPDATE OF "practiceId" ON "SandboxCrmSubscription"
  FOR EACH ROW EXECUTE FUNCTION forbid_practice_change();
