-- Block 8: PWA and indicators (D-74 to D-78).
-- A session may become a remembered device of the PWA (D-17, D-77). A device may
-- subscribe to Web Push, tied to its session (D-78); an appointment carries the mark
-- of the confirmation still to announce, and the sandbox provider its fake delivery.
-- The time spent on the "Sem confirmação" list starts being measured (D-75).

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "pushRequestedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "rememberedDevice" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "endpointHash" TEXT NOT NULL,
    "keysEncrypted" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandboxPushMessage" (
    "id" UUID NOT NULL,
    "endpointHash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "ttlSeconds" INTEGER NOT NULL,
    "sentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SandboxPushMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfirmationWorkTime" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "lastBeatAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ConfirmationWorkTime_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpointHash_key" ON "PushSubscription"("endpointHash");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "PushSubscription_sessionId_idx" ON "PushSubscription"("sessionId");

-- CreateIndex
CREATE INDEX "SandboxPushMessage_endpointHash_idx" ON "SandboxPushMessage"("endpointHash");

-- CreateIndex
CREATE UNIQUE INDEX "ConfirmationWorkTime_id_practiceId_key" ON "ConfirmationWorkTime"("id", "practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfirmationWorkTime_practiceId_userId_date_key" ON "ConfirmationWorkTime"("practiceId", "userId", "date");

-- CreateIndex
CREATE INDEX "Appointment_pushRequestedAt_idx" ON "Appointment"("pushRequestedAt");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfirmationWorkTime" ADD CONSTRAINT "ConfirmationWorkTime_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Practice isolation (D-30): the new practice-scoped table's practiceId never changes.
CREATE TRIGGER "ConfirmationWorkTime_practice_immutable"
  BEFORE UPDATE OF "practiceId" ON "ConfirmationWorkTime"
  FOR EACH ROW EXECUTE FUNCTION forbid_practice_change();
