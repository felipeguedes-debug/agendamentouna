import type { PracticeContext } from "@/lib/auth/access";
import { can, type Permission } from "@/lib/auth/permissions";
import { isUuid } from "@/lib/db";
import { AgendaError } from "@/lib/agenda/errors";
import { OPEN_STATUSES } from "@/lib/appointments/status";
import { markPatientsForCrmSync, requestCrmSync } from "@/lib/crm/queue";
import { consentHistory, consentStateOf, isManualConsentChannel, latestConsents, type ConsentState, type ManualConsentChannel } from "./consent";
import { formatPhone, normalizePhone, phoneDigits } from "./phone";

/**
 * Patients of a practice: the search and quick registration of the booking form
 * (D-22, D-45) and the Pacientes screen (D-50). The name search ignores accents
 * and case through `Patient.searchName`, kept by a database trigger; the phone
 * search matches digits. Anonymized patients (D-28) never show up in a search.
 */

export const DEFAULT_INSURANCE = "Particular";
export const PATIENTS_PAGE_SIZE = 50;
const MIN_TERM = 2;
const MIN_PHONE_DIGITS = 4;
const MAX_NAME = 120;
const MAX_INSURANCE = 80;

export type PatientOption = {
  id: string;
  name: string;
  phone: string;
  insurance: string;
  lastVisitAt: Date | null;
  acceptsWhatsapp: boolean;
};

/** The same normalization as lower(unaccent()) for the letters people type. */
export function normalizeSearchText(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[%_\\]/g, "")
    .trim();
}

/** Name or phone digits; null when the term is too short to filter. */
export function patientSearchWhere(term: string) {
  const text = normalizeSearchText(term);
  if (text.length < MIN_TERM) return null;
  const digits = phoneDigits(term);
  return { OR: [{ searchName: { contains: text } }, ...(digits.length >= MIN_PHONE_DIGITS ? [{ phone: { contains: digits } }] : [])] };
}

function assertCan({ access }: PracticeContext, permission: Permission) {
  if (!can(access.role, permission)) throw new AgendaError("not_allowed", `Missing ${permission}`);
}

async function lastVisits({ db }: PracticeContext, ids: string[]) {
  const rows = await db.appointment.groupBy({ by: ["patientId"], where: { patientId: { in: ids }, status: "COMPLETED" }, _max: { startsAt: true } });
  return new Map(rows.map((row) => [row.patientId, row._max.startsAt]));
}

async function toOptions(context: PracticeContext, patients: { id: string; name: string; phone: string | null; insurance: string | null }[]) {
  const ids = patients.map((patient) => patient.id);
  if (ids.length === 0) return [];
  const [visits, consents] = await Promise.all([lastVisits(context, ids), latestConsents(context, ids)]);
  return patients.map(
    (patient): PatientOption => ({
      id: patient.id,
      name: patient.name,
      phone: formatPhone(patient.phone),
      insurance: patient.insurance ?? DEFAULT_INSURANCE,
      lastVisitAt: visits.get(patient.id) ?? null,
      acceptsWhatsapp: consents.get(patient.id) === "granted",
    }),
  );
}

/** One patient for the booking form, when "Agendar" comes from the Pacientes screen (D-82). */
export async function patientOption(context: PracticeContext, patientId: string): Promise<PatientOption | null> {
  assertCan(context, "appointments:manage");
  if (!isUuid(patientId)) return null;
  const patient = await context.db.patient.findFirst({ where: { id: patientId, anonymizedAt: null }, select: { id: true, name: true, phone: true, insurance: true } });
  return patient ? (await toOptions(context, [patient]))[0] : null;
}

export async function searchPatients(context: PracticeContext, term: string, limit = 8): Promise<PatientOption[]> {
  assertCan(context, "appointments:manage");
  const search = patientSearchWhere(term);
  if (!search) return [];
  const patients = await context.db.patient.findMany({
    where: { anonymizedAt: null, ...search },
    orderBy: { name: "asc" },
    take: limit,
    select: { id: true, name: true, phone: true, insurance: true },
  });
  return toOptions(context, patients);
}

export async function createPatientQuick(
  context: PracticeContext,
  input: { name: string; phone: string; insurance?: string | null; consentChannel?: ManualConsentChannel | null },
): Promise<PatientOption> {
  assertCan(context, "appointments:manage");
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw new AgendaError("name_required", "Name is required");
  const insurance = input.insurance?.trim() || DEFAULT_INSURANCE;
  if (name.length > MAX_NAME || insurance.length > MAX_INSURANCE) throw new AgendaError("invalid_text", "Text too long");
  const phone = normalizePhone(input.phone);
  if (!phone) throw new AgendaError("invalid_phone", "Invalid phone");
  // Consent collected at registration (PRD 6, rule 1; D-47); without it nothing is recorded.
  const channel = input.consentChannel ?? null;
  if (channel !== null && !isManualConsentChannel(channel)) throw new AgendaError("invalid_channel", "Invalid consent channel");

  const { user, access, db } = context;
  const existing = await db.patient.findFirst({ where: { phone }, select: { id: true, name: true } });
  if (existing) throw new AgendaError("phone_taken", "Phone already registered", { patient: existing });

  const audit = (action: string, entityType: string, entityId: string, changedFields: string[]) => ({
    practiceId: access.practiceId,
    actorType: "USER" as const,
    actorUserId: user.id,
    action,
    entityType,
    entityId,
    changedFields,
  });
  const patient = await db
    .$transaction(async (tx) => {
      const created = await tx.patient.create({ data: { practiceId: access.practiceId, name, phone, insurance } });
      await tx.auditEvent.create({ data: audit("patient.created", "Patient", created.id, []) });
      if (channel) {
        const consent = await tx.contactConsent.create({
          data: { practiceId: access.practiceId, patientId: created.id, granted: true, channel, recordedByUserId: user.id },
        });
        await tx.auditEvent.create({ data: audit("contact_consent.recorded", "ContactConsent", consent.id, ["granted", "channel"]) });
      }
      // PRD 6: a new patient becomes a contact in SynkronosCRM (D-68).
      await markPatientsForCrmSync(tx, [created.id]);
      return created;
    })
    .catch(async (error: unknown) => {
      // Someone registered the same phone in the meantime.
      if ((error as { code?: unknown }).code !== "P2002") throw error;
      const taken = await db.patient.findFirst({ where: { phone }, select: { id: true, name: true } });
      throw new AgendaError("phone_taken", "Phone already registered", { patient: taken ?? undefined });
    });
  await requestCrmSync(access.practiceId, db);
  return (await toOptions(context, [patient]))[0];
}

/** The patient's phone changes here and in the contact in SynkronosCRM (PRD 6, D-68). The cadence reads it when sending. */
export async function updatePatientPhone(context: PracticeContext, input: { patientId: string; phone: string }, now = new Date()) {
  assertCan(context, "appointments:manage");
  const { user, access, db } = context;
  const patient = isUuid(input.patientId) ? await db.patient.findFirst({ where: { id: input.patientId, anonymizedAt: null }, select: { id: true, phone: true } }) : null;
  if (!patient) throw new AgendaError("patient_unavailable", "Patient not found");
  const phone = normalizePhone(input.phone);
  if (!phone) throw new AgendaError("invalid_phone", "Invalid phone");
  if (phone === patient.phone) return;
  const taken = await db.patient.findFirst({ where: { phone, id: { not: patient.id } }, select: { id: true, name: true } });
  if (taken) throw new AgendaError("phone_taken", "Phone already registered", { patient: taken });
  await db
    .$transaction(async (tx) => {
      await tx.patient.update({ where: { id: patient.id }, data: { phone } });
      await tx.auditEvent.create({
        data: { practiceId: access.practiceId, actorType: "USER", actorUserId: user.id, action: "patient.updated", entityType: "Patient", entityId: patient.id, changedFields: ["phone"] },
      });
      await markPatientsForCrmSync(tx, [patient.id], now);
    })
    .catch((error: unknown) => {
      if ((error as { code?: unknown }).code === "P2002") throw new AgendaError("phone_taken", "Phone already registered");
      throw error;
    });
  await requestCrmSync(access.practiceId, db);
}

export type PatientListItem = {
  id: string;
  name: string;
  phone: string;
  insurance: string;
  consent: ConsentState;
  lastVisitAt: Date | null;
  nextAppointmentAt: Date | null;
};

/** The Pacientes screen: by name, a page at a time, with the booking form's search (D-50). */
export async function listPatients(context: PracticeContext, input: { term?: string; page?: number }, now = new Date()) {
  assertCan(context, "patients:view");
  const { db } = context;
  const where = { anonymizedAt: null, ...(patientSearchWhere(input.term ?? "") ?? {}) };
  const total = await db.patient.count({ where });
  const pages = Math.max(1, Math.ceil(total / PATIENTS_PAGE_SIZE));
  const requested = input.page !== undefined && Number.isInteger(input.page) ? input.page : 1;
  const page = Math.min(Math.max(requested, 1), pages);
  const patients = await db.patient.findMany({
    where,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip: (page - 1) * PATIENTS_PAGE_SIZE,
    take: PATIENTS_PAGE_SIZE,
    select: { id: true, name: true, phone: true, insurance: true },
  });
  const ids = patients.map((patient) => patient.id);
  const [visits, next, consents] = await Promise.all([
    lastVisits(context, ids),
    db.appointment.groupBy({
      by: ["patientId"],
      where: { patientId: { in: ids }, status: { in: [...OPEN_STATUSES] }, startsAt: { gte: now } },
      _min: { startsAt: true },
    }),
    latestConsents(context, ids),
  ]);
  const nextByPatient = new Map(next.map((row) => [row.patientId, row._min.startsAt]));
  const items = patients.map(
    (patient): PatientListItem => ({
      id: patient.id,
      name: patient.name,
      phone: formatPhone(patient.phone),
      insurance: patient.insurance ?? DEFAULT_INSURANCE,
      consent: consents.get(patient.id) ?? "unknown",
      lastVisitAt: visits.get(patient.id) ?? null,
      nextAppointmentAt: nextByPatient.get(patient.id) ?? null,
    }),
  );
  return { items, total, page, pages, pageSize: PATIENTS_PAGE_SIZE };
}

export type PatientDetail = NonNullable<Awaited<ReturnType<typeof getPatientDetail>>>;

/** One patient with every appointment in the practice (PRD 4, rule 7) and the consent log. */
export async function getPatientDetail(context: PracticeContext, patientId: string) {
  assertCan(context, "patients:view");
  if (!isUuid(patientId)) return null;
  const { db } = context;
  const patient = await db.patient.findFirst({ where: { id: patientId } });
  if (!patient) return null;
  const [appointments, history] = await Promise.all([
    db.appointment.findMany({
      where: { patientId: patient.id },
      orderBy: { startsAt: "desc" },
      include: {
        professional: { select: { name: true } },
        location: { select: { name: true, timeZone: true } },
        appointmentType: { select: { name: true, color: true, category: true } },
      },
    }),
    consentHistory(context, patient.id),
  ]);
  return {
    id: patient.id,
    name: patient.name,
    phone: formatPhone(patient.phone),
    insurance: patient.anonymizedAt ? null : (patient.insurance ?? DEFAULT_INSURANCE),
    notes: patient.notes,
    createdAt: patient.createdAt,
    anonymizedAt: patient.anonymizedAt,
    consent: consentStateOf(history[0]),
    consentHistory: history,
    appointments: appointments.map((appointment) => ({
      id: appointment.id,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      status: appointment.status,
      priceCents: appointment.priceCents,
      cadenceEnabled: appointment.cadenceEnabled,
      professionalName: appointment.professional.name,
      location: appointment.location,
      typeName: appointment.appointmentType.name,
      typeColor: appointment.appointmentType.color,
      category: appointment.appointmentType.category,
    })),
  };
}
