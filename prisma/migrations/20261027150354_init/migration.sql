-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('ADMIN');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PRACTICE_MANAGER', 'SECRETARY', 'PROFESSIONAL');

-- CreateEnum
CREATE TYPE "AppointmentCategory" AS ENUM ('CONSULTATION', 'FOLLOW_UP', 'PROCEDURE', 'EXAM', 'TELECONSULTATION', 'BLOCK');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELED_BY_PATIENT', 'CANCELED_BY_PRACTICE', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "StatusChangeSource" AS ENUM ('USER', 'CADENCE_REPLY', 'GOOGLE', 'CRM', 'IMPORT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AppointmentFlagType" AS ENUM ('RESCHEDULE_REQUESTED', 'REPLIED_WITHOUT_CONFIRMING', 'NO_CONFIRMATION', 'MANUAL_CONTACT');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('INSTAGRAM', 'REFERRAL', 'WEBSITE', 'OTHER');

-- CreateEnum
CREATE TYPE "ConsentChannel" AS ENUM ('IN_PERSON', 'PHONE', 'WHATSAPP', 'FORM', 'IMPORT');

-- CreateEnum
CREATE TYPE "TimeBlockSource" AS ENUM ('MANUAL', 'GOOGLE');

-- CreateEnum
CREATE TYPE "CadenceAnchor" AS ENUM ('BOOKING', 'APPOINTMENT');

-- CreateEnum
CREATE TYPE "CadenceStepAction" AS ENUM ('REQUEST_CONFIRMATION', 'REMINDER');

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('SCHEDULED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED', 'CANCELED');

-- CreateEnum
CREATE TYPE "WhatsappInstanceStatus" AS ENUM ('PENDING_QR', 'CONNECTED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "GoogleConnectionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'ERROR');

-- CreateEnum
CREATE TYPE "PendingGoogleChangeKind" AS ENUM ('MOVED', 'DELETED');

-- CreateEnum
CREATE TYPE "PendingGoogleChangeResolution" AS ENUM ('ACCEPTED', 'REVERTED');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM', 'PATIENT', 'GOOGLE', 'CRM');

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "OrganizationRole" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleConnection" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "googleSubject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "scopes" TEXT[],
    "status" "GoogleConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GoogleConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Practice" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sendWindowStart" TEXT NOT NULL DEFAULT '08:00',
    "sendWindowEnd" TEXT NOT NULL DEFAULT '20:00',
    "sendWindowDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
    "sendMarginMinutes" INTEGER NOT NULL DEFAULT 120,
    "requireTwoFactor" BOOLEAN NOT NULL DEFAULT false,
    "flwchatTokenEncrypted" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Practice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" "Role" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedByUserId" UUID,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Fortaleza',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Professional" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "userId" UUID,
    "googleConnectionId" UUID,
    "allDayEventsBlock" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Professional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessionalLocation" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "locationId" UUID NOT NULL,

    CONSTRAINT "ProfessionalLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkingHours" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,

    CONSTRAINT "WorkingHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleException" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "locationId" UUID,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeBlock" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "source" "TimeBlockSource" NOT NULL DEFAULT 'MANUAL',
    "googleCalendarId" TEXT,
    "googleEventId" TEXT,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TimeBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "insurance" TEXT DEFAULT 'Particular',
    "notes" TEXT,
    "anonymizedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactConsent" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "channel" "ConsentChannel" NOT NULL,
    "recordedByUserId" UUID,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentType" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "category" "AppointmentCategory" NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "defaultPriceCents" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL,
    "preparation" TEXT,
    "cadenceId" UUID,
    "allowsOnlineBooking" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AppointmentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentTypePrice" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "appointmentTypeId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "priceCents" INTEGER NOT NULL,

    CONSTRAINT "AppointmentTypePrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "appointmentTypeId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "internalNote" TEXT,
    "leadSource" "LeadSource",
    "insurance" TEXT,
    "cadenceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "rescheduledFromId" UUID,
    "googleEventId" TEXT,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentStatusChange" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "fromStatus" "AppointmentStatus",
    "toStatus" "AppointmentStatus" NOT NULL,
    "source" "StatusChangeSource" NOT NULL,
    "reason" TEXT,
    "changedByUserId" UUID,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentFlag" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "type" "AppointmentFlagType" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AppointmentFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cadence" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Cadence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CadenceStep" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "cadenceId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "anchor" "CadenceAnchor" NOT NULL,
    "offsetMinutes" INTEGER NOT NULL DEFAULT 0,
    "fixedTime" TEXT,
    "eligibleStatuses" "AppointmentStatus"[],
    "action" "CadenceStepAction" NOT NULL,
    "template" TEXT NOT NULL,

    CONSTRAINT "CadenceStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CadenceProfessional" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "cadenceId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,

    CONSTRAINT "CadenceProfessional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispatch" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "cadenceStepId" UUID,
    "cadenceVersion" INTEGER,
    "whatsappInstanceId" UUID,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "scheduledFor" TIMESTAMPTZ(3) NOT NULL,
    "sentAt" TIMESTAMPTZ(3),
    "status" "DispatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "failureReason" TEXT,
    "messageText" TEXT,
    "providerMessageId" TEXT,
    "replyText" TEXT,
    "repliedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Dispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappInstance" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "providerInstanceId" TEXT NOT NULL,
    "apiUrl" TEXT NOT NULL,
    "tokenEncrypted" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "status" "WhatsappInstanceStatus" NOT NULL DEFAULT 'PENDING_QR',
    "statusChangedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WhatsappInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleSecondaryCalendar" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "googleConnectionId" UUID NOT NULL,
    "googleCalendarId" TEXT NOT NULL,

    CONSTRAINT "GoogleSecondaryCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingGoogleChange" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "kind" "PendingGoogleChangeKind" NOT NULL,
    "proposedStartsAt" TIMESTAMPTZ(3),
    "proposedEndsAt" TIMESTAMPTZ(3),
    "detectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolution" "PendingGoogleChangeResolution",
    "resolvedByUserId" UUID,

    CONSTRAINT "PendingGoogleChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" "AuditActorType" NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID,
    "changedFields" TEXT[],

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleConnection_googleSubject_key" ON "GoogleConnection"("googleSubject");

-- CreateIndex
CREATE INDEX "Practice_organizationId_idx" ON "Practice"("organizationId");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_id_practiceId_key" ON "Membership"("id", "practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_practiceId_userId_key" ON "Membership"("practiceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_practiceId_idx" ON "Invitation"("practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_id_practiceId_key" ON "Invitation"("id", "practiceId");

-- CreateIndex
CREATE INDEX "Location_practiceId_idx" ON "Location"("practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Location_id_practiceId_key" ON "Location"("id", "practiceId");

-- CreateIndex
CREATE INDEX "Professional_googleConnectionId_idx" ON "Professional"("googleConnectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Professional_id_practiceId_key" ON "Professional"("id", "practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Professional_practiceId_userId_key" ON "Professional"("practiceId", "userId");

-- CreateIndex
CREATE INDEX "ProfessionalLocation_practiceId_idx" ON "ProfessionalLocation"("practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionalLocation_id_practiceId_key" ON "ProfessionalLocation"("id", "practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionalLocation_professionalId_locationId_key" ON "ProfessionalLocation"("professionalId", "locationId");

-- CreateIndex
CREATE INDEX "WorkingHours_practiceId_professionalId_weekday_idx" ON "WorkingHours"("practiceId", "professionalId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "WorkingHours_id_practiceId_key" ON "WorkingHours"("id", "practiceId");

-- CreateIndex
CREATE INDEX "ScheduleException_practiceId_professionalId_startsOn_idx" ON "ScheduleException"("practiceId", "professionalId", "startsOn");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleException_id_practiceId_key" ON "ScheduleException"("id", "practiceId");

-- CreateIndex
CREATE INDEX "TimeBlock_practiceId_professionalId_startsAt_idx" ON "TimeBlock"("practiceId", "professionalId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "TimeBlock_id_practiceId_key" ON "TimeBlock"("id", "practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "TimeBlock_professionalId_googleCalendarId_googleEventId_key" ON "TimeBlock"("professionalId", "googleCalendarId", "googleEventId");

-- CreateIndex
CREATE INDEX "Patient_practiceId_name_idx" ON "Patient"("practiceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_id_practiceId_key" ON "Patient"("id", "practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_practiceId_phone_key" ON "Patient"("practiceId", "phone");

-- CreateIndex
CREATE INDEX "ContactConsent_practiceId_patientId_recordedAt_idx" ON "ContactConsent"("practiceId", "patientId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContactConsent_id_practiceId_key" ON "ContactConsent"("id", "practiceId");

-- CreateIndex
CREATE INDEX "AppointmentType_practiceId_idx" ON "AppointmentType"("practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentType_id_practiceId_key" ON "AppointmentType"("id", "practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentTypePrice_id_practiceId_key" ON "AppointmentTypePrice"("id", "practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentTypePrice_appointmentTypeId_professionalId_key" ON "AppointmentTypePrice"("appointmentTypeId", "professionalId");

-- CreateIndex
CREATE INDEX "Appointment_practiceId_startsAt_idx" ON "Appointment"("practiceId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_practiceId_professionalId_startsAt_idx" ON "Appointment"("practiceId", "professionalId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_practiceId_patientId_idx" ON "Appointment"("practiceId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_id_practiceId_key" ON "Appointment"("id", "practiceId");

-- CreateIndex
CREATE INDEX "AppointmentStatusChange_practiceId_appointmentId_changedAt_idx" ON "AppointmentStatusChange"("practiceId", "appointmentId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentStatusChange_id_practiceId_key" ON "AppointmentStatusChange"("id", "practiceId");

-- CreateIndex
CREATE INDEX "AppointmentFlag_practiceId_type_resolvedAt_idx" ON "AppointmentFlag"("practiceId", "type", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentFlag_id_practiceId_key" ON "AppointmentFlag"("id", "practiceId");

-- CreateIndex
CREATE INDEX "Cadence_practiceId_idx" ON "Cadence"("practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Cadence_id_practiceId_key" ON "Cadence"("id", "practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CadenceStep_id_practiceId_key" ON "CadenceStep"("id", "practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CadenceStep_cadenceId_position_key" ON "CadenceStep"("cadenceId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "CadenceProfessional_id_practiceId_key" ON "CadenceProfessional"("id", "practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CadenceProfessional_cadenceId_professionalId_key" ON "CadenceProfessional"("cadenceId", "professionalId");

-- CreateIndex
CREATE INDEX "Dispatch_status_scheduledFor_idx" ON "Dispatch"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "Dispatch_practiceId_appointmentId_idx" ON "Dispatch"("practiceId", "appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispatch_id_practiceId_key" ON "Dispatch"("id", "practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappInstance_id_practiceId_key" ON "WhatsappInstance"("id", "practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappInstance_professionalId_practiceId_key" ON "WhatsappInstance"("professionalId", "practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleSecondaryCalendar_id_practiceId_key" ON "GoogleSecondaryCalendar"("id", "practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleSecondaryCalendar_professionalId_practiceId_key" ON "GoogleSecondaryCalendar"("professionalId", "practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleSecondaryCalendar_googleConnectionId_googleCalendarId_key" ON "GoogleSecondaryCalendar"("googleConnectionId", "googleCalendarId");

-- CreateIndex
CREATE INDEX "PendingGoogleChange_practiceId_resolvedAt_idx" ON "PendingGoogleChange"("practiceId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PendingGoogleChange_id_practiceId_key" ON "PendingGoogleChange"("id", "practiceId");

-- CreateIndex
CREATE INDEX "AuditEvent_practiceId_occurredAt_idx" ON "AuditEvent"("practiceId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_practiceId_entityType_entityId_idx" ON "AuditEvent"("practiceId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_id_practiceId_key" ON "AuditEvent"("id", "practiceId");

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleConnection" ADD CONSTRAINT "GoogleConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Practice" ADD CONSTRAINT "Practice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Professional" ADD CONSTRAINT "Professional_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Professional" ADD CONSTRAINT "Professional_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Professional" ADD CONSTRAINT "Professional_googleConnectionId_fkey" FOREIGN KEY ("googleConnectionId") REFERENCES "GoogleConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalLocation" ADD CONSTRAINT "ProfessionalLocation_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalLocation" ADD CONSTRAINT "ProfessionalLocation_professionalId_practiceId_fkey" FOREIGN KEY ("professionalId", "practiceId") REFERENCES "Professional"("id", "practiceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalLocation" ADD CONSTRAINT "ProfessionalLocation_locationId_practiceId_fkey" FOREIGN KEY ("locationId", "practiceId") REFERENCES "Location"("id", "practiceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkingHours" ADD CONSTRAINT "WorkingHours_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkingHours" ADD CONSTRAINT "WorkingHours_professionalId_practiceId_fkey" FOREIGN KEY ("professionalId", "practiceId") REFERENCES "Professional"("id", "practiceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkingHours" ADD CONSTRAINT "WorkingHours_locationId_practiceId_fkey" FOREIGN KEY ("locationId", "practiceId") REFERENCES "Location"("id", "practiceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleException" ADD CONSTRAINT "ScheduleException_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleException" ADD CONSTRAINT "ScheduleException_professionalId_practiceId_fkey" FOREIGN KEY ("professionalId", "practiceId") REFERENCES "Professional"("id", "practiceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleException" ADD CONSTRAINT "ScheduleException_locationId_practiceId_fkey" FOREIGN KEY ("locationId", "practiceId") REFERENCES "Location"("id", "practiceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeBlock" ADD CONSTRAINT "TimeBlock_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeBlock" ADD CONSTRAINT "TimeBlock_professionalId_practiceId_fkey" FOREIGN KEY ("professionalId", "practiceId") REFERENCES "Professional"("id", "practiceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactConsent" ADD CONSTRAINT "ContactConsent_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactConsent" ADD CONSTRAINT "ContactConsent_patientId_practiceId_fkey" FOREIGN KEY ("patientId", "practiceId") REFERENCES "Patient"("id", "practiceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentType" ADD CONSTRAINT "AppointmentType_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentType" ADD CONSTRAINT "AppointmentType_cadenceId_practiceId_fkey" FOREIGN KEY ("cadenceId", "practiceId") REFERENCES "Cadence"("id", "practiceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentTypePrice" ADD CONSTRAINT "AppointmentTypePrice_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentTypePrice" ADD CONSTRAINT "AppointmentTypePrice_appointmentTypeId_practiceId_fkey" FOREIGN KEY ("appointmentTypeId", "practiceId") REFERENCES "AppointmentType"("id", "practiceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentTypePrice" ADD CONSTRAINT "AppointmentTypePrice_professionalId_practiceId_fkey" FOREIGN KEY ("professionalId", "practiceId") REFERENCES "Professional"("id", "practiceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_locationId_practiceId_fkey" FOREIGN KEY ("locationId", "practiceId") REFERENCES "Location"("id", "practiceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_professionalId_practiceId_fkey" FOREIGN KEY ("professionalId", "practiceId") REFERENCES "Professional"("id", "practiceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_practiceId_fkey" FOREIGN KEY ("patientId", "practiceId") REFERENCES "Patient"("id", "practiceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_appointmentTypeId_practiceId_fkey" FOREIGN KEY ("appointmentTypeId", "practiceId") REFERENCES "AppointmentType"("id", "practiceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_rescheduledFromId_practiceId_fkey" FOREIGN KEY ("rescheduledFromId", "practiceId") REFERENCES "Appointment"("id", "practiceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentStatusChange" ADD CONSTRAINT "AppointmentStatusChange_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentStatusChange" ADD CONSTRAINT "AppointmentStatusChange_appointmentId_practiceId_fkey" FOREIGN KEY ("appointmentId", "practiceId") REFERENCES "Appointment"("id", "practiceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentFlag" ADD CONSTRAINT "AppointmentFlag_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentFlag" ADD CONSTRAINT "AppointmentFlag_appointmentId_practiceId_fkey" FOREIGN KEY ("appointmentId", "practiceId") REFERENCES "Appointment"("id", "practiceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cadence" ADD CONSTRAINT "Cadence_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadenceStep" ADD CONSTRAINT "CadenceStep_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadenceStep" ADD CONSTRAINT "CadenceStep_cadenceId_practiceId_fkey" FOREIGN KEY ("cadenceId", "practiceId") REFERENCES "Cadence"("id", "practiceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadenceProfessional" ADD CONSTRAINT "CadenceProfessional_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadenceProfessional" ADD CONSTRAINT "CadenceProfessional_cadenceId_practiceId_fkey" FOREIGN KEY ("cadenceId", "practiceId") REFERENCES "Cadence"("id", "practiceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadenceProfessional" ADD CONSTRAINT "CadenceProfessional_professionalId_practiceId_fkey" FOREIGN KEY ("professionalId", "practiceId") REFERENCES "Professional"("id", "practiceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_appointmentId_practiceId_fkey" FOREIGN KEY ("appointmentId", "practiceId") REFERENCES "Appointment"("id", "practiceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_cadenceStepId_practiceId_fkey" FOREIGN KEY ("cadenceStepId", "practiceId") REFERENCES "CadenceStep"("id", "practiceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_whatsappInstanceId_practiceId_fkey" FOREIGN KEY ("whatsappInstanceId", "practiceId") REFERENCES "WhatsappInstance"("id", "practiceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappInstance" ADD CONSTRAINT "WhatsappInstance_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappInstance" ADD CONSTRAINT "WhatsappInstance_professionalId_practiceId_fkey" FOREIGN KEY ("professionalId", "practiceId") REFERENCES "Professional"("id", "practiceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleSecondaryCalendar" ADD CONSTRAINT "GoogleSecondaryCalendar_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleSecondaryCalendar" ADD CONSTRAINT "GoogleSecondaryCalendar_professionalId_practiceId_fkey" FOREIGN KEY ("professionalId", "practiceId") REFERENCES "Professional"("id", "practiceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleSecondaryCalendar" ADD CONSTRAINT "GoogleSecondaryCalendar_googleConnectionId_fkey" FOREIGN KEY ("googleConnectionId") REFERENCES "GoogleConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingGoogleChange" ADD CONSTRAINT "PendingGoogleChange_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingGoogleChange" ADD CONSTRAINT "PendingGoogleChange_appointmentId_practiceId_fkey" FOREIGN KEY ("appointmentId", "practiceId") REFERENCES "Appointment"("id", "practiceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Practice isolation (D-30): a row never moves to another practice. Every table
-- with a "practiceId" column gets this trigger; the schema guard test checks it.
CREATE FUNCTION forbid_practice_change() RETURNS trigger AS $$
BEGIN
  IF NEW."practiceId" IS DISTINCT FROM OLD."practiceId" THEN
    RAISE EXCEPTION '%."practiceId" is immutable', TG_TABLE_NAME USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND column_name = 'practiceId'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OF "practiceId" ON %I FOR EACH ROW EXECUTE FUNCTION forbid_practice_change()',
      t || '_practice_immutable', t
    );
  END LOOP;
END $$;

-- The audit trail is append-only (D-31).
CREATE FUNCTION forbid_audit_event_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent is append-only: % is not allowed', TG_OP USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_event_append_only
  BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_event_change();

CREATE TRIGGER audit_event_no_truncate
  BEFORE TRUNCATE ON "AuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_event_change();
