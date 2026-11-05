-- Block 6: two-way Google Calendar.
-- Appointments get the state of their export to the professional's secondary
-- calendar (D-62); connections cache the access token, encrypted, and record when
-- Google revoked them; professionals choose the calendars that count as busy
-- (D-60). New tables: the connection's calendars with their push channel (D-61),
-- the link a manager sends to the professional (D-59), and the sandbox provider's
-- fake Google (D-58). A pending change can now be superseded (D-63).

-- AlterEnum
ALTER TYPE "PendingGoogleChangeResolution" ADD VALUE 'SUPERSEDED';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "googleEventUpdatedAt" TIMESTAMPTZ(3),
ADD COLUMN     "googleSyncAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "googleSyncError" TEXT,
ADD COLUMN     "googleSyncRequestedAt" TIMESTAMPTZ(3),
ADD COLUMN     "googleSyncedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "GoogleConnection" ADD COLUMN     "accessTokenEncrypted" TEXT,
ADD COLUMN     "accessTokenExpiresAt" TIMESTAMPTZ(3),
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "statusChangedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "GoogleSecondaryCalendar" ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Professional" ADD COLUMN     "googleBusyCalendarIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "googleBusyCalendarsChosen" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "GoogleCalendar" (
    "id" UUID NOT NULL,
    "googleConnectionId" UUID NOT NULL,
    "googleCalendarId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "accessRole" TEXT NOT NULL,
    "primary" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMPTZ(3),
    "channelId" TEXT,
    "channelResourceId" TEXT,
    "channelTokenHash" TEXT,
    "channelExpiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GoogleCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandboxGoogleCalendar" (
    "id" UUID NOT NULL,
    "accountSubject" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "accessRole" TEXT NOT NULL DEFAULT 'owner',
    "primary" BOOLEAN NOT NULL DEFAULT false,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Fortaleza',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SandboxGoogleCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandboxGoogleEvent" (
    "id" UUID NOT NULL,
    "calendarId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "summary" TEXT,
    "description" TEXT,
    "location" TEXT,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "startDate" TEXT,
    "endDate" TEXT,
    "transparency" TEXT NOT NULL DEFAULT 'opaque',
    "eventType" TEXT NOT NULL DEFAULT 'default',
    "declined" BOOLEAN NOT NULL DEFAULT false,
    "appointmentId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SandboxGoogleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleLinkRequest" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sentToEmail" TEXT,
    "createdByUserId" UUID,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleLinkRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendar_channelId_key" ON "GoogleCalendar"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendar_googleConnectionId_googleCalendarId_key" ON "GoogleCalendar"("googleConnectionId", "googleCalendarId");

-- CreateIndex
CREATE UNIQUE INDEX "SandboxGoogleCalendar_calendarId_key" ON "SandboxGoogleCalendar"("calendarId");

-- CreateIndex
CREATE INDEX "SandboxGoogleCalendar_accountSubject_idx" ON "SandboxGoogleCalendar"("accountSubject");

-- CreateIndex
CREATE UNIQUE INDEX "SandboxGoogleEvent_calendarId_eventId_key" ON "SandboxGoogleEvent"("calendarId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleLinkRequest_tokenHash_key" ON "GoogleLinkRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "GoogleLinkRequest_practiceId_professionalId_idx" ON "GoogleLinkRequest"("practiceId", "professionalId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleLinkRequest_id_practiceId_key" ON "GoogleLinkRequest"("id", "practiceId");

-- CreateIndex
CREATE INDEX "Appointment_googleSyncRequestedAt_idx" ON "Appointment"("googleSyncRequestedAt");

-- CreateIndex
CREATE INDEX "PendingGoogleChange_practiceId_appointmentId_idx" ON "PendingGoogleChange"("practiceId", "appointmentId");

-- AddForeignKey
ALTER TABLE "GoogleCalendar" ADD CONSTRAINT "GoogleCalendar_googleConnectionId_fkey" FOREIGN KEY ("googleConnectionId") REFERENCES "GoogleConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SandboxGoogleEvent" ADD CONSTRAINT "SandboxGoogleEvent_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "SandboxGoogleCalendar"("calendarId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleLinkRequest" ADD CONSTRAINT "GoogleLinkRequest_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleLinkRequest" ADD CONSTRAINT "GoogleLinkRequest_professionalId_practiceId_fkey" FOREIGN KEY ("professionalId", "practiceId") REFERENCES "Professional"("id", "practiceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Practice isolation (D-30): the new practice-scoped table's practiceId never changes.
CREATE TRIGGER "GoogleLinkRequest_practice_immutable"
  BEFORE UPDATE OF "practiceId" ON "GoogleLinkRequest"
  FOR EACH ROW EXECUTE FUNCTION forbid_practice_change();
