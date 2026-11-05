import type { AppointmentStatus, CadenceAnchor, CadenceStepAction } from "@/generated/prisma/enums";
import { agendaTimeZone } from "@/lib/agenda/agenda";
import { AgendaError } from "@/lib/agenda/errors";
import type { PracticeContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { isTime } from "@/lib/dates/zoned";
import { isUuid } from "@/lib/db";
import { MAX_CADENCE_STEPS } from "@/lib/domain/cadence";
import { practiceSendWindow, replanAppointments } from "./plan";
import { nextTuesdayAt10, planSteps } from "./schedule";
import { templateProblems } from "./template";

/**
 * The cadence editor (PRD 6 "Estrutura da régua"; D-06, D-07; rules 6 and 7) and the
 * practice's send window, for the manager and the admin (`cadence:edit`,
 * `practice-settings:edit`).
 *
 * - A step goes "ao agendar", N days before at a fixed time, or N hours before; it
 *   asks for confirmation (only while Agendado) or only reminds, for Agendado or
 *   Agendado and Confirmado. The MVP allows 1 to 4 steps.
 * - "Aplica a" picks the types: a type has one cadence, so choosing it here takes it
 *   from its previous cadence. Professionals: all (none chosen) or a list.
 * - Changed steps make a new version; the dispatches already planned for the next
 *   24 h stay, the rest is replanned (src/lib/cadence/plan.ts). Changing the window
 *   replans the same way.
 * - The preview plans the steps for a fictitious appointment next Tuesday at 10h,
 *   booked now, in the agenda's time zone.
 */

const MAX_NAME = 80;
const MAX_DAYS = 30;
const MAX_HOURS = 72;
const MAX_MARGIN_HOURS = 12;
const DEFAULT_TEMPLATE = "Olá, {primeiro_nome}! Seu horário de {tipo} com {profissional} está marcado para {data_extenso} às {hora}, na unidade {endereco}.";

export type StepWhen = "booking" | "days" | "hours";
export type StepStatuses = "scheduled" | "scheduled_confirmed";

/** A step as the form edits it. */
export type StepInput = { when: StepWhen; amount: number; time: string; statuses: StepStatuses; action: CadenceStepAction; template: string };

export type CadenceInput = { name: string; active: boolean; typeIds: string[]; professionalIds: string[]; steps: StepInput[] };

type StoredStep = { anchor: CadenceAnchor; offsetMinutes: number; fixedTime: string | null; eligibleStatuses: AppointmentStatus[]; action: CadenceStepAction; template: string };

const STATUSES: Record<StepStatuses, AppointmentStatus[]> = { scheduled: ["SCHEDULED"], scheduled_confirmed: ["SCHEDULED", "CONFIRMED"] };

export function toStepInput(step: StoredStep): StepInput {
  const statuses: StepStatuses = step.eligibleStatuses.includes("CONFIRMED") ? "scheduled_confirmed" : "scheduled";
  const base = { statuses, action: step.action, template: step.template };
  if (step.anchor === "BOOKING") return { ...base, when: "booking", amount: 0, time: "" };
  if (step.fixedTime) return { ...base, when: "days", amount: Math.max(1, Math.round(-step.offsetMinutes / 1440)), time: step.fixedTime };
  return { ...base, when: "hours", amount: Math.max(1, Math.round(-step.offsetMinutes / 60)), time: "" };
}

function toStoredStep(input: StepInput): StoredStep {
  const amount = Number(input.amount);
  const common = { eligibleStatuses: STATUSES[input.statuses], action: input.action, template: input.template.trim() };
  if (!STATUSES[input.statuses] || !["REQUEST_CONFIRMATION", "REMINDER"].includes(input.action)) throw new AgendaError("invalid_steps", "Invalid step");
  if (input.when === "booking") return { ...common, anchor: "BOOKING", offsetMinutes: 0, fixedTime: null };
  if (input.when === "days" && Number.isInteger(amount) && amount >= 1 && amount <= MAX_DAYS && isTime(input.time)) {
    return { ...common, anchor: "APPOINTMENT", offsetMinutes: -amount * 1440, fixedTime: input.time };
  }
  if (input.when === "hours" && Number.isInteger(amount) && amount >= 1 && amount <= MAX_HOURS) {
    return { ...common, anchor: "APPOINTMENT", offsetMinutes: -amount * 60, fixedTime: null };
  }
  throw new AgendaError("invalid_step_time", "Invalid step time");
}

function sameSteps(a: StoredStep[], b: StoredStep[]) {
  const key = (steps: StoredStep[]) =>
    JSON.stringify(steps.map((step) => [step.anchor, step.offsetMinutes, step.fixedTime, [...step.eligibleStatuses].sort(), step.action, step.template]));
  return key(a) === key(b);
}

function assertCanEdit({ access }: PracticeContext) {
  if (!can(access.role, "cadence:edit")) throw new AgendaError("not_allowed", "Cannot edit cadences");
}

/** The practice's cadences for the side list, with the number of steps and types. */
export async function listCadences(context: PracticeContext) {
  assertCanEdit(context);
  const cadences = await context.db.cadence.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, version: true, active: true, steps: { select: { cadenceVersion: true } }, _count: { select: { appointmentTypes: true } } },
  });
  return cadences.map((cadence) => ({
    id: cadence.id,
    name: cadence.name,
    active: cadence.active,
    stepCount: cadence.steps.filter((step) => step.cadenceVersion === cadence.version).length,
    typeCount: cadence._count.appointmentTypes,
  }));
}

/** Each active professional's WhatsAPI instance and its connection (PRD 3, req. 9). */
export async function listChannels(context: PracticeContext) {
  assertCanEdit(context);
  const professionals = await context.db.professional.findMany({
    where: { active: true },
    select: { name: true, whatsappInstance: { select: { status: true, statusChangedAt: true, phoneNumber: true } } },
  });
  return professionals
    .map((professional) => ({
      professionalName: professional.name,
      status: professional.whatsappInstance?.status ?? null,
      statusChangedAt: professional.whatsappInstance?.statusChangedAt ?? null,
      phoneNumber: professional.whatsappInstance?.phoneNumber ?? null,
    }))
    .sort((a, b) => a.professionalName.localeCompare(b.professionalName, "pt-BR"));
}

async function findCadence({ db }: PracticeContext, id: string) {
  const cadence = isUuid(id) ? await db.cadence.findFirst({ where: { id }, include: { professionals: { select: { professionalId: true } } } }) : null;
  if (!cadence) throw new AgendaError("cadence_unavailable", "Cadence not found in the practice");
  return cadence;
}

export async function getCadenceEditor(context: PracticeContext, id: string) {
  assertCanEdit(context);
  if (!isUuid(id)) return null;
  const { db } = context;
  const cadence = await db.cadence.findFirst({ where: { id }, include: { professionals: { select: { professionalId: true } } } });
  if (!cadence) return null;
  const [steps, types, professionals] = [
    await db.cadenceStep.findMany({ where: { cadenceId: id, cadenceVersion: cadence.version }, orderBy: { position: "asc" } }),
    await db.appointmentType.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, category: true, color: true, active: true, cadenceId: true, cadence: { select: { name: true } } },
    }),
    await db.professional.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ];
  return {
    id: cadence.id,
    name: cadence.name,
    version: cadence.version,
    active: cadence.active,
    steps: steps.map(toStepInput),
    typeIds: types.filter((type) => type.cadenceId === id).map((type) => type.id),
    professionalIds: cadence.professionals.map((row) => row.professionalId),
    types: types.map((type) => ({
      id: type.id,
      name: type.name,
      category: type.category,
      color: type.color,
      active: type.active,
      otherCadence: type.cadenceId && type.cadenceId !== id ? (type.cadence?.name ?? null) : null,
    })),
    professionals,
  };
}

export async function createCadence(context: PracticeContext, name: string) {
  assertCanEdit(context);
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_NAME) throw new AgendaError("cadence_name_required", "Name is required");
  const { access, db } = context;
  return db.$transaction(async (tx) => {
    const cadence = await tx.cadence.create({
      data: {
        practiceId: access.practiceId,
        name: trimmed,
        steps: { create: [{ position: 1, anchor: "BOOKING", offsetMinutes: 0, eligibleStatuses: ["SCHEDULED"], action: "REMINDER", template: DEFAULT_TEMPLATE }] },
      },
    });
    await tx.auditEvent.create({
      data: { practiceId: access.practiceId, actorType: "USER", actorUserId: context.user.id, action: "cadence.created", entityType: "Cadence", entityId: cadence.id, changedFields: [] },
    });
    return cadence.id;
  });
}

function validateSteps(steps: StepInput[]) {
  if (steps.length < 1 || steps.length > MAX_CADENCE_STEPS) throw new AgendaError("invalid_steps", "1 to 4 steps");
  const stored = steps.map(toStoredStep);
  const problems = stored.flatMap((step, index) =>
    templateProblems(step.template).map((problem) => {
      const label = `Passo ${index + 1}`;
      if (problem === "empty") return `${label}: escreva o texto da mensagem`;
      if (problem === "too_long") return `${label}: o texto passou de 1.000 caracteres`;
      return `${label}: variável ${problem.slice("unknown_variable:".length)} não existe`;
    }),
  );
  if (problems.length > 0) throw new AgendaError("invalid_template", "Invalid templates", { details: problems });
  if (stored.some((step) => step.action === "REQUEST_CONFIRMATION" && step.eligibleStatuses.includes("CONFIRMED"))) {
    throw new AgendaError("confirmation_scheduled_only", "A confirmation request is for Agendado only");
  }
  return stored;
}

/** Saves the cadence; returns its version and how many future appointments were replanned. */
export async function saveCadence(context: PracticeContext, id: string, input: CadenceInput, now = new Date()) {
  assertCanEdit(context);
  const { access, db } = context;
  const cadence = await findCadence(context, id);
  const name = input.name.trim();
  if (!name || name.length > MAX_NAME) throw new AgendaError("cadence_name_required", "Name is required");
  const steps = validateSteps(input.steps);
  const typeIds = [...new Set(input.typeIds)];
  const professionalIds = [...new Set(input.professionalIds)];
  if (!typeIds.every(isUuid) || (await db.appointmentType.count({ where: { id: { in: typeIds } } })) !== typeIds.length) {
    throw new AgendaError("type_unavailable", "Unknown type");
  }
  if (!professionalIds.every(isUuid) || (await db.professional.count({ where: { id: { in: professionalIds } } })) !== professionalIds.length) {
    throw new AgendaError("professional_unavailable", "Unknown professional");
  }

  const currentSteps = await db.cadenceStep.findMany({ where: { cadenceId: id, cadenceVersion: cadence.version }, orderBy: { position: "asc" } });
  const currentTypeIds = (await db.appointmentType.findMany({ where: { cadenceId: id }, select: { id: true } })).map((type) => type.id);
  const stepsChanged = !sameSteps(currentSteps, steps);
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((value) => b.includes(value));
  const typesChanged = !sameSet(currentTypeIds, typeIds);
  const professionalsChanged = !sameSet(cadence.professionals.map((row) => row.professionalId), professionalIds);
  const changedFields = [
    ...(name !== cadence.name ? ["name"] : []),
    ...(input.active !== cadence.active ? ["active"] : []),
    ...(stepsChanged ? ["steps"] : []),
    ...(typesChanged ? ["appointmentTypes"] : []),
    ...(professionalsChanged ? ["professionals"] : []),
  ];
  if (changedFields.length === 0) return { version: cadence.version, replanned: 0 };
  const version = stepsChanged ? cadence.version + 1 : cadence.version;

  await db.$transaction(async (tx) => {
    await tx.cadence.update({ where: { id }, data: { name, active: input.active, version } });
    if (stepsChanged) {
      await tx.cadenceStep.createMany({
        data: steps.map((step, index) => ({ practiceId: access.practiceId, cadenceId: id, cadenceVersion: version, position: index + 1, ...step })),
      });
    }
    if (typesChanged) {
      await tx.appointmentType.updateMany({ where: { cadenceId: id, id: { notIn: typeIds } }, data: { cadenceId: null } });
      await tx.appointmentType.updateMany({ where: { id: { in: typeIds } }, data: { cadenceId: id } });
    }
    if (professionalsChanged) {
      await tx.cadenceProfessional.deleteMany({ where: { cadenceId: id } });
      await tx.cadenceProfessional.createMany({ data: professionalIds.map((professionalId) => ({ practiceId: access.practiceId, cadenceId: id, professionalId })) });
    }
    await tx.auditEvent.create({
      data: { practiceId: access.practiceId, actorType: "USER", actorUserId: context.user.id, action: "cadence.updated", entityType: "Cadence", entityId: id, changedFields },
    });
  });

  const affectsDispatches = changedFields.some((field) => field !== "name");
  const replanned = affectsDispatches
    ? await replanAppointments(
        db,
        {
          OR: [
            { appointmentTypeId: { in: [...new Set([...currentTypeIds, ...typeIds])] } },
            { dispatches: { some: { status: "SCHEDULED", cadenceStep: { is: { cadenceId: id } } } } },
          ],
        },
        now,
      )
    : 0;
  return { version, replanned };
}

export type SendWindowInput = { start: string; end: string; days: number[]; marginHours: number };

/** The practice's send window and margin (D-07), read in each location's time zone. */
export async function saveSendWindow(context: PracticeContext, input: SendWindowInput, now = new Date()) {
  const { access, db } = context;
  if (!can(access.role, "practice-settings:edit")) throw new AgendaError("not_allowed", "Cannot edit the practice settings");
  const days = [...new Set(input.days)].sort();
  const valid =
    isTime(input.start) &&
    isTime(input.end) &&
    input.start < input.end &&
    days.length > 0 &&
    days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) &&
    Number.isFinite(input.marginHours) &&
    input.marginHours >= 0 &&
    input.marginHours <= MAX_MARGIN_HOURS;
  if (!valid) throw new AgendaError("invalid_window", "Invalid send window");
  const data = { sendWindowStart: input.start, sendWindowEnd: input.end, sendWindowDays: days, sendMarginMinutes: Math.round(input.marginHours * 60) };
  const current = await db.practice.findFirstOrThrow({ select: { sendWindowStart: true, sendWindowEnd: true, sendWindowDays: true, sendMarginMinutes: true } });
  const changedFields = (Object.keys(data) as (keyof typeof data)[]).filter((field) => JSON.stringify(current[field]) !== JSON.stringify(data[field]));
  if (changedFields.length === 0) return;
  await db.$transaction(async (tx) => {
    await tx.practice.update({ where: { id: access.practiceId }, data });
    await tx.auditEvent.create({
      data: { practiceId: access.practiceId, actorType: "USER", actorUserId: context.user.id, action: "practice.send_window_updated", entityType: "Practice", entityId: access.practiceId, changedFields },
    });
  });
  await replanAppointments(db, {}, now);
}

/** PRD 6, rule 6: the dispatches of a fictitious appointment next Tuesday at 10h, booked now. */
export async function cadencePreview(context: PracticeContext, id: string, now = new Date()) {
  assertCanEdit(context);
  const { db } = context;
  const cadence = await findCadence(context, id);
  const steps = await db.cadenceStep.findMany({ where: { cadenceId: id, cadenceVersion: cadence.version }, orderBy: { position: "asc" } });
  const timeZone = await agendaTimeZone(db);
  const { window, marginMinutes } = await practiceSendWindow(db);
  const startsAt = nextTuesdayAt10(timeZone, now);
  const results = planSteps({ steps, startedAt: now, startsAt, timeZone, window, marginMinutes });
  return {
    startsAt,
    timeZone,
    steps: results.map((result, index) => ({
      position: steps[index].position,
      action: steps[index].action,
      at: "at" in result ? result.at : null,
      adjustment: "at" in result ? result.adjustment : null,
      skipped: "at" in result ? null : result.skipped,
    })),
  };
}
