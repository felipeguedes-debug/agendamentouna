import type { AppointmentCategory } from "@/generated/prisma/enums";
import type { PracticeContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { isUuid } from "@/lib/db";
import { AgendaError } from "@/lib/agenda/errors";
import { replanAppointments } from "@/lib/cadence/plan";
import { findTypeColor } from "@/lib/domain/colors";

/**
 * "Tipos de atendimento" (PRD 4; D-12, D-14, D-42). The manager and the admin edit;
 * the secretary views; the professional sees the active types at their own price.
 * Types are deactivated, never deleted: appointments keep pointing at them.
 */

/** Categories a type can have. Bloqueio is for time blocks, not for appointments (D-42). */
export const TYPE_CATEGORIES = [
  "CONSULTATION",
  "FOLLOW_UP",
  "PROCEDURE",
  "EXAM",
  "TELECONSULTATION",
] as const satisfies readonly AppointmentCategory[];

export const MIN_DURATION_MINUTES = 5;
export const MAX_DURATION_MINUTES = 480;
const MAX_PRICE_CENTS = 10_000_000;
const MAX_NAME = 80;
const MAX_PREPARATION = 500;

export type AppointmentTypeInput = {
  name: string;
  displayName: string | null;
  category: AppointmentCategory;
  durationMinutes: number;
  defaultPriceCents: number;
  color: string;
  preparation: string | null;
  cadenceId: string | null;
  professionalPrices: { professionalId: string; priceCents: number }[];
};

export type AppointmentTypeRow = Awaited<ReturnType<typeof listAppointmentTypes>>[number];

const COMPARED_FIELDS = [
  "name",
  "displayName",
  "category",
  "durationMinutes",
  "defaultPriceCents",
  "color",
  "preparation",
  "cadenceId",
] as const;

export function isValidDuration(minutes: number) {
  return Number.isInteger(minutes) && minutes >= MIN_DURATION_MINUTES && minutes <= MAX_DURATION_MINUTES;
}

export function isValidPrice(cents: number) {
  return Number.isInteger(cents) && cents >= 0 && cents <= MAX_PRICE_CENTS;
}

export async function listAppointmentTypes({ user, access, db }: PracticeContext) {
  const ownOnly = !can(access.role, "appointment-types:view");
  const ownProfessionalIds = ownOnly
    ? (await db.professional.findMany({ where: { userId: user.id }, select: { id: true } })).map((row) => row.id)
    : [];
  const types = await db.appointmentType.findMany({
    where: ownOnly ? { active: true } : {},
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: {
      cadence: { select: { name: true } },
      prices: { include: { professional: { select: { name: true } } }, orderBy: { professional: { name: "asc" } } },
    },
  });
  return types.map((type) => {
    const ownPrice = type.prices.find((price) => ownProfessionalIds.includes(price.professionalId));
    return {
      id: type.id,
      name: type.name,
      displayName: type.displayName,
      category: type.category,
      durationMinutes: type.durationMinutes,
      defaultPriceCents: type.defaultPriceCents,
      // For the professional, their own price (D-40: "Vê os próprios").
      priceCents: ownPrice?.priceCents ?? type.defaultPriceCents,
      color: type.color,
      preparation: type.preparation,
      cadenceId: type.cadenceId,
      cadenceName: type.cadence?.name ?? null,
      active: type.active,
      professionalPrices: ownOnly
        ? []
        : type.prices.map((price) => ({ professionalId: price.professionalId, professionalName: price.professional.name, priceCents: price.priceCents })),
    };
  });
}

async function validate({ db }: PracticeContext, input: AppointmentTypeInput) {
  const name = input.name.trim();
  if (!name) throw new AgendaError("type_name_required", "Name is required");
  const displayName = input.displayName?.trim() || null;
  const preparation = input.preparation?.trim() || null;
  if (name.length > MAX_NAME || (displayName?.length ?? 0) > MAX_NAME || (preparation?.length ?? 0) > MAX_PREPARATION) {
    throw new AgendaError("invalid_text", "Text too long");
  }
  if (!(TYPE_CATEGORIES as readonly string[]).includes(input.category)) throw new AgendaError("invalid_category", `Invalid category ${input.category}`);
  if (!isValidDuration(input.durationMinutes)) throw new AgendaError("invalid_duration", "Invalid duration");
  if (!isValidPrice(input.defaultPriceCents)) throw new AgendaError("invalid_price", "Invalid price");
  const color = findTypeColor(input.color);
  if (!color) throw new AgendaError("invalid_color", `Color ${input.color} is not in the palette`);

  let cadenceId: string | null = null;
  if (input.cadenceId) {
    const cadence = isUuid(input.cadenceId) ? await db.cadence.findUnique({ where: { id: input.cadenceId } }) : null;
    if (!cadence) throw new AgendaError("cadence_unavailable", "Cadence not found in the practice");
    cadenceId = cadence.id;
  }

  const professionalIds = input.professionalPrices.map((price) => price.professionalId);
  if (new Set(professionalIds).size !== professionalIds.length || !professionalIds.every(isUuid)) {
    throw new AgendaError("professional_unavailable", "Invalid professional prices");
  }
  if (professionalIds.length > 0) {
    const found = await db.professional.count({ where: { id: { in: professionalIds } } });
    if (found !== professionalIds.length) throw new AgendaError("professional_unavailable", "Professional not found in the practice");
  }
  if (!input.professionalPrices.every((price) => isValidPrice(price.priceCents))) throw new AgendaError("invalid_price", "Invalid professional price");

  return {
    fields: {
      name,
      displayName,
      category: input.category,
      durationMinutes: input.durationMinutes,
      defaultPriceCents: input.defaultPriceCents,
      color: color.hex,
      preparation,
      cadenceId,
    },
    professionalPrices: input.professionalPrices,
  };
}

function assertCanEdit({ access }: PracticeContext) {
  if (!can(access.role, "appointment-types:edit")) throw new AgendaError("not_allowed", "Cannot edit appointment types");
}

export async function createAppointmentType(context: PracticeContext, input: AppointmentTypeInput) {
  assertCanEdit(context);
  const { fields, professionalPrices } = await validate(context, input);
  const { user, access, db } = context;
  return db.$transaction(async (tx) => {
    const type = await tx.appointmentType.create({ data: { practiceId: access.practiceId, ...fields } });
    if (professionalPrices.length > 0) {
      await tx.appointmentTypePrice.createMany({
        data: professionalPrices.map((price) => ({ practiceId: access.practiceId, appointmentTypeId: type.id, ...price })),
      });
    }
    await tx.auditEvent.create({
      data: { practiceId: access.practiceId, actorType: "USER", actorUserId: user.id, action: "appointment_type.created", entityType: "AppointmentType", entityId: type.id, changedFields: [] },
    });
    return type;
  });
}

async function findType({ db }: PracticeContext, id: string) {
  const type = isUuid(id) ? await db.appointmentType.findUnique({ where: { id }, include: { prices: true } }) : null;
  if (!type) throw new AgendaError("type_unavailable", "Appointment type not found");
  return type;
}

/**
 * Changing a type never touches the values of appointments already booked: they
 * hold copies (D-12). A new cadence replans their dispatches after the next 24 h
 * (PRD 6, rule 7).
 */
export async function updateAppointmentType(context: PracticeContext, id: string, input: AppointmentTypeInput) {
  assertCanEdit(context);
  const current = await findType(context, id);
  const { fields, professionalPrices } = await validate(context, input);
  const changedFields: string[] = COMPARED_FIELDS.filter((field) => current[field] !== fields[field]);
  const priceKey = (prices: { professionalId: string; priceCents: number }[]) =>
    prices.map((price) => `${price.professionalId}:${price.priceCents}`).sort().join();
  if (priceKey(current.prices) !== priceKey(professionalPrices)) changedFields.push("prices");
  if (changedFields.length === 0) return current;

  const { user, access, db } = context;
  const updated = await db.$transaction(async (tx) => {
    const type = await tx.appointmentType.update({ where: { id: current.id }, data: fields });
    if (changedFields.includes("prices")) {
      await tx.appointmentTypePrice.deleteMany({ where: { appointmentTypeId: current.id } });
      await tx.appointmentTypePrice.createMany({
        data: professionalPrices.map((price) => ({ practiceId: access.practiceId, appointmentTypeId: current.id, ...price })),
      });
    }
    await tx.auditEvent.create({
      data: { practiceId: access.practiceId, actorType: "USER", actorUserId: user.id, action: "appointment_type.updated", entityType: "AppointmentType", entityId: current.id, changedFields },
    });
    return type;
  });
  if (changedFields.includes("cadenceId")) await replanAppointments(db, { appointmentTypeId: current.id }, new Date());
  return updated;
}

export async function setAppointmentTypeActive(context: PracticeContext, id: string, active: boolean) {
  assertCanEdit(context);
  const current = await findType(context, id);
  if (current.active === active) return;
  const { user, access, db } = context;
  await db.$transaction(async (tx) => {
    await tx.appointmentType.update({ where: { id: current.id }, data: { active } });
    await tx.auditEvent.create({
      data: {
        practiceId: access.practiceId,
        actorType: "USER",
        actorUserId: user.id,
        action: active ? "appointment_type.reactivated" : "appointment_type.deactivated",
        entityType: "AppointmentType",
        entityId: current.id,
        changedFields: ["active"],
      },
    });
  });
}
