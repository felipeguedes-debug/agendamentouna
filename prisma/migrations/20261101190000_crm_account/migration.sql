-- Block 7: a FlwChat account may serve several practices (D-73).
-- The token, the webhook and the status move to CrmAccount, which belongs to no
-- practice, as GoogleConnection (D-04); CrmConnection keeps the practice's link. The
-- sandbox's fake CRM becomes one per account, so two practices can share it; its
-- tables hold no real data and are recreated, which also drops their triggers. No
-- connection exists yet outside development.

-- Sandbox
DROP TABLE "SandboxCrmNote";
DROP TABLE "SandboxCrmContact";
DROP TABLE "SandboxCrmSubscription";

-- CreateEnum
CREATE TYPE "CrmAccountStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "CrmAccount" (
    "id" UUID NOT NULL,
    "companyId" TEXT,
    "tokenEncrypted" TEXT NOT NULL,
    "status" "CrmAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "statusChangedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "subscriptionId" TEXT,
    "webhookSecretHash" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CrmAccount_pkey" PRIMARY KEY ("id")
);

-- AlterTable
DELETE FROM "CrmConnection";
DROP INDEX "CrmConnection_webhookSecretHash_key";
ALTER TABLE "CrmConnection" DROP COLUMN "companyId",
DROP COLUMN "lastError",
DROP COLUMN "status",
DROP COLUMN "statusChangedAt",
DROP COLUMN "subscriptionId",
DROP COLUMN "tokenEncrypted",
DROP COLUMN "webhookSecretHash",
ADD COLUMN     "crmAccountId" UUID NOT NULL;

-- DropEnum
DROP TYPE "CrmConnectionStatus";

-- CreateTable
CREATE TABLE "SandboxCrmContact" (
    "id" UUID NOT NULL,
    "accountKey" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "tagNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hasConversation" BOOLEAN NOT NULL DEFAULT true,
    "conversationNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SandboxCrmContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandboxCrmNote" (
    "id" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "channelNumber" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SandboxCrmNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandboxCrmSubscription" (
    "id" UUID NOT NULL,
    "accountKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SandboxCrmSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrmAccount_companyId_key" ON "CrmAccount"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmAccount_webhookSecretHash_key" ON "CrmAccount"("webhookSecretHash");

-- CreateIndex
CREATE INDEX "CrmConnection_crmAccountId_idx" ON "CrmConnection"("crmAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "SandboxCrmContact_accountKey_phone_key" ON "SandboxCrmContact"("accountKey", "phone");

-- CreateIndex
CREATE INDEX "SandboxCrmNote_contactId_idx" ON "SandboxCrmNote"("contactId");

-- CreateIndex
CREATE INDEX "SandboxCrmSubscription_accountKey_idx" ON "SandboxCrmSubscription"("accountKey");

-- AddForeignKey
ALTER TABLE "CrmConnection" ADD CONSTRAINT "CrmConnection_crmAccountId_fkey" FOREIGN KEY ("crmAccountId") REFERENCES "CrmAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SandboxCrmNote" ADD CONSTRAINT "SandboxCrmNote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "SandboxCrmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
