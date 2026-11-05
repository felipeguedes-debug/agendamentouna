import type { CadenceAnchor, CadenceStepAction, AppointmentStatus } from "@/generated/prisma/enums";
import { encryptSecret } from "@/lib/crypto/secrets";
import { addDays, todayIn, toZoned } from "@/lib/dates/zoned";
import { forPractice, prisma } from "@/lib/db";

// Cadence test data (Block 5). Every helper creates its own rows.

export const TEST_INSTANCE_TOKEN = "test-instance-token";

export type StepInput = {
  anchor: CadenceAnchor;
  offsetMinutes?: number;
  fixedTime?: string | null;
  eligibleStatuses?: AppointmentStatus[];
  action: CadenceStepAction;
  template?: string;
};

/** Every day, all day: the plan keeps the nominal times, so tests can predict them. */
export async function openWindowAllDay(practiceId: string, marginMinutes = 120) {
  await prisma.practice.update({
    where: { id: practiceId },
    data: { sendWindowStart: "00:00", sendWindowEnd: "23:59", sendWindowDays: [0, 1, 2, 3, 4, 5, 6], sendMarginMinutes: marginMinutes },
  });
}

export async function grantConsent(practiceId: string, patientId: string, granted = true) {
  await forPractice(practiceId).contactConsent.create({ data: { practiceId, patientId, granted, channel: "IN_PERSON" } });
}

export async function addInstance(practiceId: string, professionalId: string, options: { status?: "CONNECTED" | "DISCONNECTED" | "PENDING_QR"; token?: string } = {}) {
  return forPractice(practiceId).whatsappInstance.create({
    data: {
      practiceId,
      professionalId,
      providerInstanceId: `test-${professionalId}`,
      apiUrl: "https://whatsapi.test",
      tokenEncrypted: encryptSecret(options.token ?? TEST_INSTANCE_TOKEN),
      phoneNumber: "+5585900000099",
      status: options.status ?? "CONNECTED",
    },
  });
}

export async function createCadence(practiceId: string, name: string, steps: StepInput[], options: { professionalIds?: string[] } = {}) {
  return forPractice(practiceId).cadence.create({
    data: {
      practiceId,
      name,
      steps: {
        create: steps.map((step, index) => ({
          position: index + 1,
          anchor: step.anchor,
          offsetMinutes: step.offsetMinutes ?? 0,
          fixedTime: step.fixedTime ?? null,
          eligibleStatuses: step.eligibleStatuses ?? ["SCHEDULED"],
          action: step.action,
          template: step.template ?? `Passo ${index + 1}, {primeiro_nome}`,
        })),
      },
      professionals: options.professionalIds ? { create: options.professionalIds.map((professionalId) => ({ professionalId })) } : undefined,
    },
    include: { steps: { orderBy: { position: "asc" } } },
  });
}

export async function createTypeWithCadence(practiceId: string, name: string, cadenceId: string) {
  return forPractice(practiceId).appointmentType.create({
    data: { practiceId, name, category: "CONSULTATION", durationMinutes: 30, defaultPriceCents: 30000, color: "#0F766E", cadenceId },
  });
}

let patientCounter = 0;

/** A patient with a unique phone and, by default, consent granted. */
export async function createPatient(practiceId: string, options: { consent?: boolean | null; name?: string; phone?: string } = {}) {
  patientCounter += 1;
  const suffix = String(Date.now() % 1_000_000).padStart(6, "0").slice(-4) + String(patientCounter).padStart(4, "0");
  const patient = await forPractice(practiceId).patient.create({
    data: { practiceId, name: options.name ?? `Paciente Régua ${patientCounter}`, phone: options.phone ?? `+55859${suffix}` },
  });
  if (options.consent !== null) await grantConsent(practiceId, patient.id, options.consent ?? true);
  return patient;
}

/** A local day `days` ahead in Fortaleza. */
export function dayAhead(days: number, now = new Date()) {
  return addDays(todayIn("America/Fortaleza", now), days);
}

/** Local date and time in Fortaleza of `now` plus `minutes`, rounded to the minute. */
export function localSlot(minutesAhead: number, now = new Date()) {
  const parts = toZoned(new Date(now.getTime() + minutesAhead * 60_000), "America/Fortaleza");
  return { date: parts.date, time: parts.time };
}

export async function dispatchesOf(practiceId: string, appointmentId: string) {
  return forPractice(practiceId).dispatch.findMany({
    where: { appointmentId },
    include: { cadenceStep: { select: { position: true, cadenceVersion: true, action: true, offsetMinutes: true } } },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
  });
}
