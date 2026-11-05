import "dotenv/config";
import { hashPassword } from "better-auth/crypto";
import { resetTestDatabase } from "../tests/reset-test-database";
import {
  CONFIRMING_APPOINTMENT_ID,
  CONFIRMING_PATIENT,
  CRM_APPOINTMENT_ID,
  CRM_MANAGER_EMAIL,
  CRM_PATIENT,
  CRM_PRACTICE_NAME,
  CRM_PROFESSIONAL_NAME,
  CRM_SECRETARY_EMAIL,
  E2E_PASSWORD,
  fortalezaDay,
  GOOGLE_ACCOUNT_EMAIL,
  GOOGLE_APPOINTMENT_ID,
  GOOGLE_PATIENT,
  GOOGLE_PRACTICE_NAME,
  GOOGLE_PROFESSIONAL_NAME,
  GOOGLE_SECRETARY_EMAIL,
  INSTANCE_ID,
  INSTANCE_TOKEN,
  MANAGER_EMAIL,
  PRACTICE_NAME,
  PROFESSIONAL_NAME,
  SECRETARY_EMAIL,
  TWO_FACTOR_MANAGER_EMAIL,
  TWO_FACTOR_PRACTICE_NAME,
  TWO_FACTOR_SECRETARY_EMAIL,
  TWO_FACTOR_SECRETARY_NAME,
  TYPE_NAME,
  UNCONFIRMED_PATIENT,
  PWA_CANCELED_PATIENT,
  PWA_CONFIRM_APPOINTMENT_ID,
  PWA_CONFIRM_PATIENT,
  PWA_GOOGLE_PATIENT,
  PWA_MANAGER_EMAIL,
  PWA_NEXT_PATIENT,
  PWA_PAST_PATIENT,
  PWA_PRACTICE_NAME,
  PWA_PROFESSIONAL_EMAIL,
  PWA_PROFESSIONAL_NAME,
  PWA_SECRETARY_EMAIL,
} from "./data";

/**
 * Rebuilds the test database and creates what the end-to-end flows need: one
 * practice with a location, a professional, two types, a secretary and a manager
 * who sign in with a password; for the cadence (Block 5), the professional's
 * WhatsAPI instance, an appointment whose confirmation request went out and one on
 * the "Sem confirmação" list; for Google (Block 6), a second practice whose
 * professional has a sandbox Google account with an appointment already exported;
 * for SynkronosCRM (Block 7), a third practice, not connected yet, with an appointment
 * whose confirmation request went out; for "Exigir 2FA", a fourth practice with a
 * manager and a secretary, neither with two-factor on; for the PWA and the indicators
 * (Block 8), a fifth practice whose professional has a login. Run with tsx by e2e/global-setup.ts.
 */
async function main() {
  process.env.DATABASE_URL = await resetTestDatabase();
  // The fake Google of the tables (D-58), whatever the developer's .env says.
  process.env.GOOGLE_CALENDAR_PROVIDER = "sandbox";
  // The fake CRM of the tables (D-66), whatever the developer's .env says.
  process.env.CRM_PROVIDER = "sandbox";
  // Imported only now, so the client connects to the test database.
  const { prisma, forPractice } = await import("../src/lib/db");
  const { TERMS_VERSION } = await import("../src/lib/legal/terms");
  const { encryptSecret } = await import("../src/lib/crypto/secrets");
  const { planCadences } = await import("../src/lib/cadence/plan");
  const { ensureSandboxAccount, sandboxRefreshToken } = await import("../src/lib/google/sandbox");
  const { ensureSecondaryCalendars } = await import("../src/lib/google/connection");
  const { exportAppointments } = await import("../src/lib/google/outbound");
  const { LINK_SCOPES } = await import("../src/lib/google/provider");

  try {
    const organization = await prisma.organization.create({ data: { name: "Organização E2E" } });
    // The send window open all day, so the flows do not depend on the hour they run.
    const practice = await prisma.practice.create({
      data: { organizationId: organization.id, name: PRACTICE_NAME, sendWindowStart: "00:00", sendWindowEnd: "23:59", sendWindowDays: [0, 1, 2, 3, 4, 5, 6] },
    });
    const practiceId = practice.id;
    const db = forPractice(practiceId);

    const location = await db.location.create({ data: { practiceId, name: "Unidade Centro", address: "Rua de Teste, 10 – Centro, Fortaleza – CE" } });
    const professional = await db.professional.create({ data: { practiceId, name: PROFESSIONAL_NAME } });
    await db.professionalLocation.create({ data: { practiceId, professionalId: professional.id, locationId: location.id } });
    await db.workingHours.createMany({
      data: [1, 2, 3, 4, 5, 6].map((weekday) => ({ practiceId, professionalId: professional.id, locationId: location.id, weekday, startTime: "07:00", endTime: "19:00" })),
    });
    const cadence = await db.cadence.create({
      data: {
        practiceId,
        name: "Consulta padrão",
        steps: {
          create: [
            { position: 1, anchor: "BOOKING", eligibleStatuses: ["SCHEDULED"], action: "REMINDER", template: "Olá, {primeiro_nome}!" },
            { position: 2, anchor: "APPOINTMENT", offsetMinutes: -1440, fixedTime: "18:00", eligibleStatuses: ["SCHEDULED"], action: "REQUEST_CONFIRMATION", template: "Confirma?" },
            { position: 3, anchor: "APPOINTMENT", offsetMinutes: -180, eligibleStatuses: ["SCHEDULED"], action: "REQUEST_CONFIRMATION", template: "Ainda sem confirmação." },
          ],
        },
      },
    });
    const types = await db.appointmentType.createManyAndReturn({
      data: [
        { practiceId, name: TYPE_NAME, category: "CONSULTATION", durationMinutes: 30, defaultPriceCents: 45000, color: "#0F766E", cadenceId: cadence.id },
        { practiceId, name: "Retorno", category: "FOLLOW_UP", durationMinutes: 20, defaultPriceCents: 0, color: "#3B5BDB", cadenceId: cadence.id },
      ],
    });
    await db.patient.create({ data: { practiceId, name: "Maria Souza E2E", phone: "+5585998124455" } });

    // Cadence (Block 5): the instance, and two patients who accepted WhatsApp.
    const firstVisit = types.find((type) => type.name === TYPE_NAME)!;
    await db.whatsappInstance.create({
      data: { id: INSTANCE_ID, practiceId, professionalId: professional.id, providerInstanceId: "e2e", apiUrl: "https://whatsapi.e2e.test", tokenEncrypted: encryptSecret(INSTANCE_TOKEN), phoneNumber: "+5585900000099", status: "CONNECTED" },
    });
    const book = async (patient: { name: string; phone: string }, days: number, id?: string) => {
      const created = await db.patient.create({ data: { practiceId, name: patient.name, phone: patient.phone } });
      await db.contactConsent.create({ data: { practiceId, patientId: created.id, granted: true, channel: "IN_PERSON" } });
      const startsAt = new Date(`${fortalezaDay(days)}T10:00:00-03:00`);
      const appointment = await db.appointment.create({
        data: {
          ...(id ? { id } : {}),
          practiceId,
          locationId: location.id,
          professionalId: professional.id,
          patientId: created.id,
          appointmentTypeId: firstVisit.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 30 * 60_000),
          durationMinutes: 30,
          priceCents: 45000,
          statusChanges: { create: { toStatus: "SCHEDULED", source: "USER" } },
        },
      });
      await planCadences(db, [appointment.id], { now: new Date() });
      return appointment.id;
    };
    // The booking message and the D-1 request went out; the H-3 request waits.
    const confirming = await book(CONFIRMING_PATIENT, 20, CONFIRMING_APPOINTMENT_ID);
    for (const step of [1, 2]) {
      const sentAt = new Date(Date.now() - (30 - step * 10) * 60_000);
      await db.dispatch.updateMany({
        where: { appointmentId: confirming, cadenceStep: { is: { position: step } } },
        data: { status: "SENT", sentAt, scheduledFor: sentAt, messageText: step === 1 ? "Olá, Carla!" : "Confirma?", providerMessageId: `e2e-${step}` },
      });
    }
    const unconfirmed = await book(UNCONFIRMED_PATIENT, 21);
    await db.appointmentFlag.create({ data: { practiceId, appointmentId: unconfirmed, type: "NO_CONFIRMATION" } });

    // Google Agenda (Block 6): the professional linked to a sandbox account, with the
    // secondary calendar created and one future appointment exported to it.
    const googlePractice = await prisma.practice.create({ data: { organizationId: organization.id, name: GOOGLE_PRACTICE_NAME } });
    const googleDb = forPractice(googlePractice.id);
    const googleLocation = await googleDb.location.create({ data: { practiceId: googlePractice.id, name: "Unidade Google", address: "Rua do Google, 20 – Centro, Fortaleza – CE" } });
    const googleProfessional = await googleDb.professional.create({ data: { practiceId: googlePractice.id, name: GOOGLE_PROFESSIONAL_NAME } });
    await googleDb.professionalLocation.create({ data: { practiceId: googlePractice.id, professionalId: googleProfessional.id, locationId: googleLocation.id } });
    const googleType = await googleDb.appointmentType.create({
      data: { practiceId: googlePractice.id, name: "Consulta", category: "CONSULTATION", durationMinutes: 30, defaultPriceCents: 30000, color: "#0F766E" },
    });
    const googlePatient = await googleDb.patient.create({ data: { practiceId: googlePractice.id, name: GOOGLE_PATIENT.name, phone: GOOGLE_PATIENT.phone } });
    const { subject } = await ensureSandboxAccount(GOOGLE_ACCOUNT_EMAIL);
    const connection = await prisma.googleConnection.create({
      data: { googleSubject: subject, email: GOOGLE_ACCOUNT_EMAIL, refreshTokenEncrypted: encryptSecret(sandboxRefreshToken(subject)), scopes: [...LINK_SCOPES] },
    });
    await googleDb.professional.update({ where: { id: googleProfessional.id }, data: { googleConnectionId: connection.id } });
    const googleStart = new Date(`${fortalezaDay(2)}T10:00:00-03:00`);
    await googleDb.appointment.create({
      data: {
        id: GOOGLE_APPOINTMENT_ID,
        practiceId: googlePractice.id,
        locationId: googleLocation.id,
        professionalId: googleProfessional.id,
        patientId: googlePatient.id,
        appointmentTypeId: googleType.id,
        startsAt: googleStart,
        endsAt: new Date(googleStart.getTime() + 30 * 60_000),
        durationMinutes: 30,
        priceCents: 30000,
        statusChanges: { create: { toStatus: "SCHEDULED", source: "USER" } },
      },
    });
    await ensureSecondaryCalendars(connection.id);
    await exportAppointments(googlePractice.id);

    // SynkronosCRM (Block 7): the cadence's first request went out, the second waits.
    const crmPractice = await prisma.practice.create({
      data: { organizationId: organization.id, name: CRM_PRACTICE_NAME, sendWindowStart: "00:00", sendWindowEnd: "23:59", sendWindowDays: [0, 1, 2, 3, 4, 5, 6] },
    });
    const crmDb = forPractice(crmPractice.id);
    const crmLocation = await crmDb.location.create({ data: { practiceId: crmPractice.id, name: "Unidade CRM", address: "Rua do CRM, 30 – Centro, Fortaleza – CE" } });
    const crmProfessional = await crmDb.professional.create({ data: { practiceId: crmPractice.id, name: CRM_PROFESSIONAL_NAME } });
    await crmDb.professionalLocation.create({ data: { practiceId: crmPractice.id, professionalId: crmProfessional.id, locationId: crmLocation.id } });
    await crmDb.whatsappInstance.create({
      data: { practiceId: crmPractice.id, professionalId: crmProfessional.id, providerInstanceId: "e2e-crm", apiUrl: "https://whatsapi.e2e.test", tokenEncrypted: encryptSecret(INSTANCE_TOKEN), phoneNumber: "+5585900000098", status: "CONNECTED" },
    });
    const crmCadence = await crmDb.cadence.create({
      data: {
        practiceId: crmPractice.id,
        name: "Consulta CRM",
        steps: {
          create: [
            { position: 1, anchor: "APPOINTMENT", offsetMinutes: -2880, eligibleStatuses: ["SCHEDULED"], action: "REQUEST_CONFIRMATION", template: "Confirma?" },
            { position: 2, anchor: "APPOINTMENT", offsetMinutes: -1440, fixedTime: "18:00", eligibleStatuses: ["SCHEDULED"], action: "REQUEST_CONFIRMATION", template: "Ainda sem confirmação." },
          ],
        },
      },
    });
    const crmType = await crmDb.appointmentType.create({
      data: { practiceId: crmPractice.id, name: "Vasectomia", displayName: "Procedimento", category: "PROCEDURE", durationMinutes: 30, defaultPriceCents: 30000, color: "#D97706", cadenceId: crmCadence.id },
    });
    const crmPatient = await crmDb.patient.create({ data: { practiceId: crmPractice.id, name: CRM_PATIENT.name, phone: CRM_PATIENT.phone } });
    await crmDb.contactConsent.create({ data: { practiceId: crmPractice.id, patientId: crmPatient.id, granted: true, channel: "IN_PERSON" } });
    const crmStart = new Date(`${fortalezaDay(20)}T10:00:00-03:00`);
    await crmDb.appointment.create({
      data: {
        id: CRM_APPOINTMENT_ID,
        practiceId: crmPractice.id,
        locationId: crmLocation.id,
        professionalId: crmProfessional.id,
        patientId: crmPatient.id,
        appointmentTypeId: crmType.id,
        startsAt: crmStart,
        endsAt: new Date(crmStart.getTime() + 30 * 60_000),
        durationMinutes: 30,
        priceCents: 30000,
        internalNote: "Observação que não sai do sistema",
        statusChanges: { create: { toStatus: "SCHEDULED", source: "USER" } },
      },
    });
    await planCadences(crmDb, [CRM_APPOINTMENT_ID], { now: new Date() });
    const crmSentAt = new Date(Date.now() - 10 * 60_000);
    await crmDb.dispatch.updateMany({
      where: { appointmentId: CRM_APPOINTMENT_ID, cadenceStep: { is: { position: 1 } } },
      data: { status: "SENT", sentAt: crmSentAt, scheduledFor: crmSentAt, messageText: "Confirma?", providerMessageId: "e2e-crm-1" },
    });

    // "Exigir 2FA": a location, so the agenda opens for whoever gets through.
    const twoFactorPractice = await prisma.practice.create({ data: { organizationId: organization.id, name: TWO_FACTOR_PRACTICE_NAME } });
    await forPractice(twoFactorPractice.id).location.create({ data: { practiceId: twoFactorPractice.id, name: "Unidade 2FA", address: "Rua do 2FA, 40 – Centro, Fortaleza – CE" } });

    // PWA and indicators (Block 8): today's appointments later than now, whatever the hour
    // the flows run, a pending Google change, and a past day with known numbers.
    const pwaPractice = await prisma.practice.create({ data: { organizationId: organization.id, name: PWA_PRACTICE_NAME } });
    const pwaDb = forPractice(pwaPractice.id);
    const pwaLocation = await pwaDb.location.create({ data: { practiceId: pwaPractice.id, name: "Unidade PWA", address: "Rua da PWA, 50 – Centro, Fortaleza – CE" } });
    const pwaProfessional = await pwaDb.professional.create({ data: { practiceId: pwaPractice.id, name: PWA_PROFESSIONAL_NAME } });
    await pwaDb.professionalLocation.create({ data: { practiceId: pwaPractice.id, professionalId: pwaProfessional.id, locationId: pwaLocation.id } });
    const pwaType = await pwaDb.appointmentType.create({
      data: { practiceId: pwaPractice.id, name: "Consulta PWA", category: "CONSULTATION", durationMinutes: 30, defaultPriceCents: 20000, color: "#0F766E" },
    });
    const pwaAppointment = async (patient: { name: string; phone: string } | { id: string }, startsAt: Date, status: "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "NO_SHOW" | "CANCELED_BY_PATIENT", id?: string) => {
      const patientId = "id" in patient ? patient.id : (await pwaDb.patient.create({ data: { practiceId: pwaPractice.id, name: patient.name, phone: patient.phone } })).id;
      return pwaDb.appointment.create({
        data: {
          ...(id ? { id } : {}),
          practiceId: pwaPractice.id,
          locationId: pwaLocation.id,
          professionalId: pwaProfessional.id,
          patientId,
          appointmentTypeId: pwaType.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 30 * 60_000),
          durationMinutes: 30,
          priceCents: 20000,
          status,
          statusChanges: { create: { toStatus: status, source: "USER" } },
        },
      });
    };
    const laterToday = Math.min(Date.now() + 90 * 60_000, new Date(`${fortalezaDay(0)}T23:40:00-03:00`).getTime());
    await pwaAppointment(PWA_NEXT_PATIENT, new Date(laterToday), "CONFIRMED");
    await pwaAppointment(PWA_CANCELED_PATIENT, new Date(laterToday + 5 * 60_000), "CANCELED_BY_PATIENT");
    await pwaAppointment(PWA_CONFIRM_PATIENT, new Date(laterToday + 10 * 60_000), "SCHEDULED", PWA_CONFIRM_APPOINTMENT_ID);
    const pwaChanged = await pwaAppointment(PWA_GOOGLE_PATIENT, new Date(`${fortalezaDay(1)}T10:00:00-03:00`), "CONFIRMED");
    await pwaDb.pendingGoogleChange.create({ data: { practiceId: pwaPractice.id, appointmentId: pwaChanged.id, kind: "DELETED" } });
    // Three days ago: 3 Atendido, 1 Faltou, 1 Sem baixa. e2e/indicadores.spec.ts reads 25%.
    const pwaPast = await pwaDb.patient.create({ data: { practiceId: pwaPractice.id, name: PWA_PAST_PATIENT.name, phone: PWA_PAST_PATIENT.phone } });
    const pastOutcomes = ["COMPLETED", "COMPLETED", "COMPLETED", "NO_SHOW", "CONFIRMED"] as const;
    for (const [index, status] of pastOutcomes.entries()) {
      await pwaAppointment({ id: pwaPast.id }, new Date(`${fortalezaDay(-3)}T1${index}:00:00-03:00`), status);
    }

    const people = [
      { name: "Profissional PWA E2E", email: PWA_PROFESSIONAL_EMAIL, role: "PROFESSIONAL" as const, practiceId: pwaPractice.id },
      { name: "Secretária PWA E2E", email: PWA_SECRETARY_EMAIL, role: "SECRETARY" as const, practiceId: pwaPractice.id },
      { name: "Gestora PWA E2E", email: PWA_MANAGER_EMAIL, role: "PRACTICE_MANAGER" as const, practiceId: pwaPractice.id },
      { name: "Gestora 2FA E2E", email: TWO_FACTOR_MANAGER_EMAIL, role: "PRACTICE_MANAGER" as const, practiceId: twoFactorPractice.id },
      { name: TWO_FACTOR_SECRETARY_NAME, email: TWO_FACTOR_SECRETARY_EMAIL, role: "SECRETARY" as const, practiceId: twoFactorPractice.id },
      { name: "Gestora CRM E2E", email: CRM_MANAGER_EMAIL, role: "PRACTICE_MANAGER" as const, practiceId: crmPractice.id },
      { name: "Secretária CRM E2E", email: CRM_SECRETARY_EMAIL, role: "SECRETARY" as const, practiceId: crmPractice.id },
      { name: "Secretária E2E", email: SECRETARY_EMAIL, role: "SECRETARY" as const, practiceId },
      { name: "Gestora E2E", email: MANAGER_EMAIL, role: "PRACTICE_MANAGER" as const, practiceId },
      { name: "Secretária Google E2E", email: GOOGLE_SECRETARY_EMAIL, role: "SECRETARY" as const, practiceId: googlePractice.id },
    ];
    const password = await hashPassword(E2E_PASSWORD);
    for (const person of people) {
      const user = await prisma.user.create({
        data: { name: person.name, email: person.email, emailVerified: true, termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION },
      });
      await prisma.account.create({ data: { userId: user.id, providerId: "credential", accountId: user.id, password } });
      await prisma.membership.create({ data: { practiceId: person.practiceId, userId: user.id, role: person.role } });
    }
    const pwaUser = await prisma.user.findUniqueOrThrow({ where: { email: PWA_PROFESSIONAL_EMAIL } });
    await pwaDb.professional.update({ where: { id: pwaProfessional.id }, data: { userId: pwaUser.id } });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
