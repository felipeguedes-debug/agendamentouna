import type { AppointmentStatus, LeadSource } from "@/generated/prisma/enums";
import type { PracticeContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { isUuid } from "@/lib/db";
import { AGENDA_ERROR_TEXT, AgendaError } from "@/lib/agenda/errors";
import { isValidDuration, isValidPrice } from "@/lib/appointment-types/appointment-types";
import { importAppointment } from "@/lib/appointments/appointments";
import { requestCrmSync } from "@/lib/crm/queue";
import { requestGoogleSync } from "@/lib/google/queue";
import { planCadences } from "@/lib/cadence/plan";
import { zonedToUtc } from "@/lib/dates/zoned";
import { parseMoneyToCents } from "@/lib/domain/money";
import { normalizePhone } from "@/lib/patients/phone";
import { MAX_AGENDA_ROWS, ROW_ERROR } from "./errors";
import { createMissingPatients, registeredPhones, type NewPatient } from "./patients-import";
import { readSheet, rowError, type ImportReport, type ImportRowError } from "./sheet";
import { AGENDA_COLUMNS, matchKey, parseDate, parseImportStatus, parseLeadSource, parseTime } from "./templates";

/**
 * Agenda spreadsheet import (PRD 4 rule 9; D-18, D-48), in three steps:
 *
 * 1. every row is read against the practice's professionals, locations and types;
 * 2. the patients of the valid rows are found or created by phone, in batches;
 * 3. each row is booked by `importAppointment`, in its own serializable
 *    transaction and in file order, so a conflict (with the agenda or with an
 *    earlier row) fails that row only.
 *
 * Imported appointments start with the cadence off; the manager turns it on in
 * batches (`enableImportedCadence`).
 */

const MAX_NAME = 120;
const MAX_INSURANCE = 80;
const MAX_NOTE = 1000;
/** Statuses the cadence of an imported appointment can still act on. */
const CADENCE_STATUSES = ["SCHEDULED", "CONFIRMED"] as const satisfies readonly AppointmentStatus[];

type Lookups = Awaited<ReturnType<typeof loadLookups>>;

type ValidRow = {
  row: ImportRowError;
  patientName: string;
  phone: string;
  insurance: string | null;
  booking: {
    professionalId: string;
    locationId: string;
    appointmentTypeId: string;
    date: string;
    time: string;
    status: AppointmentStatus;
    durationMinutes?: number;
    priceCents?: number;
    leadSource: LeadSource | null;
    insurance: string | null;
    internalNote: string | null;
  };
};

function byKey<T extends { name: string }>(items: T[]) {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(matchKey(item.name), [...(map.get(matchKey(item.name)) ?? []), item]);
  return map;
}

async function loadLookups({ db }: PracticeContext) {
  const [professionals, locations, types] = await Promise.all([
    db.professional.findMany({
      select: {
        id: true,
        name: true,
        active: true,
        locations: { where: { location: { active: true } }, select: { location: { select: { id: true, name: true, timeZone: true } } } },
      },
    }),
    db.location.findMany({ where: { active: true }, select: { id: true, name: true, timeZone: true } }),
    db.appointmentType.findMany({ select: { id: true, name: true, active: true } }),
  ]);
  return { professionals: byKey(professionals), locations: byKey(locations), types: byKey(types) };
}

/** Reads one row against the practice; the messages list what is wrong with it. */
function readRow(
  cell: (key: string) => string,
  lookups: Lookups,
  now: Date,
): { messages: string[]; valid?: Omit<ValidRow, "row"> } {
  const messages: string[] = [];

  const typedDate = cell("data");
  const date = parseDate(typedDate);
  if (!typedDate) messages.push(ROW_ERROR.dateRequired);
  else if (!date) messages.push(ROW_ERROR.invalidDate(typedDate));
  const typedTime = cell("hora");
  const time = parseTime(typedTime);
  if (!typedTime) messages.push(ROW_ERROR.timeRequired);
  else if (!time) messages.push(ROW_ERROR.invalidTime(typedTime));

  const typedProfessional = cell("profissional");
  const candidates = (lookups.professionals.get(matchKey(typedProfessional)) ?? []).filter((professional) => professional.active);
  let professional: (typeof candidates)[number] | undefined;
  if (!typedProfessional) messages.push(ROW_ERROR.professionalRequired);
  else if (candidates.length === 0) messages.push(ROW_ERROR.unknownProfessional(typedProfessional));
  else if (candidates.length > 1) messages.push(ROW_ERROR.ambiguousProfessional(typedProfessional));
  else professional = candidates[0];

  let location: { id: string; name: string; timeZone: string } | undefined;
  if (professional) {
    const served = professional.locations.map((row) => row.location);
    const typedLocation = cell("unidade");
    if (!typedLocation) {
      if (served.length === 1) location = served[0];
      else if (served.length === 0) messages.push(ROW_ERROR.noLocation(professional.name));
      else messages.push(ROW_ERROR.locationRequired(professional.name));
    } else {
      const named = lookups.locations.get(matchKey(typedLocation)) ?? [];
      location = served.find((candidate) => named.some((row) => row.id === candidate.id));
      if (named.length === 0) messages.push(ROW_ERROR.unknownLocation(typedLocation));
      else if (!location) messages.push(ROW_ERROR.locationNotServed(professional.name, named[0].name));
    }
  }

  const typedType = cell("tipo");
  const types = lookups.types.get(matchKey(typedType)) ?? [];
  const type = types.find((candidate) => candidate.active);
  if (!typedType) messages.push(ROW_ERROR.typeRequired);
  else if (types.length === 0) messages.push(ROW_ERROR.unknownType(typedType));
  else if (!type) messages.push(ROW_ERROR.inactiveType(typedType));

  const patientName = cell("paciente").replace(/\s+/g, " ");
  if (patientName.length > MAX_NAME) messages.push(ROW_ERROR.textTooLong("paciente"));
  const typedPhone = cell("celular");
  const phone = typedPhone ? normalizePhone(typedPhone) : null;
  if (!typedPhone) messages.push(ROW_ERROR.phoneRequired);
  else if (!phone) messages.push(ROW_ERROR.invalidPhone);
  const insurance = cell("convenio") || null;
  if (insurance && insurance.length > MAX_INSURANCE) messages.push(ROW_ERROR.textTooLong("convenio"));
  const internalNote = cell("observacao") || null;
  if (internalNote && internalNote.length > MAX_NOTE) messages.push(ROW_ERROR.textTooLong("observacao"));

  const typedStatus = cell("status");
  const status = parseImportStatus(typedStatus);
  if (!status) messages.push(ROW_ERROR.invalidStatus(typedStatus));
  else if ((status === "COMPLETED" || status === "NO_SHOW") && date && time && location && zonedToUtc(date, time, location.timeZone) > now) {
    messages.push(ROW_ERROR.futureFinalStatus);
  }

  const typedDuration = cell("duracao");
  const durationMinutes = typedDuration ? Number(typedDuration) : undefined;
  if (durationMinutes !== undefined && !(/^\d+$/.test(typedDuration) && isValidDuration(durationMinutes))) messages.push(ROW_ERROR.invalidDuration(typedDuration));
  const typedPrice = cell("valor");
  const priceCents = typedPrice ? parseMoneyToCents(typedPrice) : undefined;
  if (priceCents === null || (priceCents !== undefined && !isValidPrice(priceCents))) messages.push(ROW_ERROR.invalidPrice(typedPrice));
  const typedSource = cell("origem");
  const leadSource = parseLeadSource(typedSource);
  if (leadSource === "invalid") messages.push(ROW_ERROR.invalidLeadSource(typedSource));

  if (messages.length > 0 || !professional || !location || !type || !date || !time || !phone || !status || priceCents === null || leadSource === "invalid") {
    return { messages };
  }
  return {
    messages,
    valid: {
      patientName,
      phone,
      insurance,
      booking: {
        professionalId: professional.id,
        locationId: location.id,
        appointmentTypeId: type.id,
        date,
        time,
        status,
        durationMinutes,
        priceCents,
        leadSource,
        insurance,
        internalNote,
      },
    },
  };
}

function bookingErrorText(error: AgendaError) {
  return error.code === "conflict" ? ROW_ERROR.conflict(error.details) : AGENDA_ERROR_TEXT[error.code];
}

export async function importAgenda(context: PracticeContext, bytes: Uint8Array, now = new Date()): Promise<ImportReport> {
  if (!can(context.access.role, "patients:import")) throw new AgendaError("not_allowed", "Only the manager imports");
  const sheet = readSheet(bytes, AGENDA_COLUMNS, MAX_AGENDA_ROWS);
  const lookups = await loadLookups(context);

  // 1. Read every row.
  const errors: ImportRowError[] = [];
  let valid: ValidRow[] = [];
  for (const row of sheet.rows) {
    const { messages, valid: read } = readRow((key) => sheet.cell(row, key), lookups, now);
    if (read) valid.push({ row: rowError(row, []), ...read });
    else errors.push(rowError(row, messages));
  }

  // 2. Patients by phone; a new phone takes the name and insurance of its first row.
  const newPatients = new Map<string, NewPatient>();
  for (const item of valid) {
    if (!newPatients.has(item.phone) && item.patientName) {
      newPatients.set(item.phone, { name: item.patientName, phone: item.phone, insurance: item.insurance, notes: null, consent: null });
    }
  }
  const ids = await registeredPhones(context, [...new Set(valid.map((item) => item.phone))]);
  const patientsExisting = ids.size;
  const created = await createMissingPatients(context, [...newPatients.values()].filter((patient) => !ids.has(patient.phone)));
  created.ids.forEach((id, phone) => ids.set(phone, id));
  // A phone the practice does not know, with no name in any of its rows.
  valid = valid.filter((item) => {
    if (ids.has(item.phone)) return true;
    errors.push({ ...item.row, messages: [ROW_ERROR.patientNameRequired] });
    return false;
  });

  // 3. Book each row in file order.
  let booked = 0;
  let existing = 0;
  const bookedIds: string[] = [];
  for (const item of valid) {
    try {
      const result = await importAppointment(context, { ...item.booking, patientId: ids.get(item.phone)! }, now);
      if (result.existing) existing += 1;
      else {
        booked += 1;
        bookedIds.push(result.id);
      }
    } catch (error) {
      if (!(error instanceof AgendaError)) throw error;
      errors.push({ ...item.row, messages: [bookingErrorText(error)] });
    }
  }

  // Future rows of a professional linked to Google go to the secondary calendar (D-18, D-62).
  await requestGoogleSync(context.access.practiceId, bookedIds, context.db);
  await requestCrmSync(context.access.practiceId, context.db);

  errors.sort((a, b) => a.line - b.line);
  return {
    header: sheet.header,
    delimiter: sheet.delimiter,
    totalRows: sheet.rows.length,
    created: booked,
    existing,
    errors,
    patientsCreated: created.created,
    patientsExisting,
  };
}

function assertCanEnable({ access }: PracticeContext) {
  if (!can(access.role, "cadence:edit")) throw new AgendaError("not_allowed", "Only the manager turns the cadence on");
}

/** Imported appointments still ahead and open, with the cadence off (D-18). */
function withoutCadence(now: Date) {
  return { cadenceEnabled: false, startsAt: { gt: now }, status: { in: [...CADENCE_STATUSES] } };
}

/** How many future imported appointments wait for the cadence, per professional. */
export async function importedWithoutCadence(context: PracticeContext, now = new Date()) {
  assertCanEnable(context);
  const { db } = context;
  const groups = await db.appointment.groupBy({ by: ["professionalId"], where: withoutCadence(now), _count: { _all: true } });
  const names = new Map(
    (await db.professional.findMany({ where: { id: { in: groups.map((group) => group.professionalId) } }, select: { id: true, name: true } })).map((row) => [row.id, row.name]),
  );
  return groups
    .map((group) => ({ professionalId: group.professionalId, professionalName: names.get(group.professionalId) ?? "", count: group._count._all }))
    .sort((a, b) => a.professionalName.localeCompare(b.professionalName, "pt-BR"));
}

/**
 * Turns the cadence on for the future open imported appointments of one
 * professional or all, and plans their dispatches as if booked now ("ao agendar"
 * goes now, within the send window), in the same transaction.
 */
export async function enableImportedCadence(context: PracticeContext, input: { professionalId?: string }, now = new Date()) {
  assertCanEnable(context);
  const { user, access, db } = context;
  if (input.professionalId !== undefined && !isUuid(input.professionalId)) return 0;
  const where = { ...withoutCadence(now), ...(input.professionalId ? { professionalId: input.professionalId } : {}) };
  return db.$transaction(async (tx) => {
    const ids = (await tx.appointment.findMany({ where, select: { id: true } })).map((row) => row.id);
    if (ids.length === 0) return 0;
    await tx.appointment.updateMany({ where: { id: { in: ids }, cadenceEnabled: false }, data: { cadenceEnabled: true } });
    await tx.auditEvent.createMany({
      data: ids.map((id) => ({
        practiceId: access.practiceId,
        actorType: "USER" as const,
        actorUserId: user.id,
        action: "appointment.cadence_enabled",
        entityType: "Appointment",
        entityId: id,
        changedFields: ["cadenceEnabled"],
      })),
    });
    await planCadences(tx, ids, { now });
    return ids.length;
  });
}
