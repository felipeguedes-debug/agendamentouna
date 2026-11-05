import { Prisma } from "@/generated/prisma/client";
import type { BasePrismaClient } from "./client";

/**
 * Practice isolation (D-02, D-30). `scopeToPractice()` returns a client that can
 * only read and write rows of one practice:
 *
 * - practice-scoped models get `practiceId` added to every filter and stamped on
 *   every create; data naming another practice is rejected;
 * - `Practice` is limited to the scoped practice and `User` to its members;
 * - cross-practice models and raw SQL are not available.
 *
 * The database backs this up: composite foreign keys keep references inside one
 * practice and a trigger keeps `practiceId` from changing.
 */

/** Models whose rows belong to one practice through `practiceId`. */
export const PRACTICE_SCOPED_MODELS = [
  "Membership",
  "Invitation",
  "Location",
  "Professional",
  "ProfessionalLocation",
  "WorkingHours",
  "ScheduleException",
  "TimeBlock",
  "Patient",
  "ContactConsent",
  "AppointmentType",
  "AppointmentTypePrice",
  "Appointment",
  "AppointmentStatusChange",
  "AppointmentFlag",
  "Cadence",
  "CadenceStep",
  "CadenceProfessional",
  "Dispatch",
  "WhatsappInstance",
  "SandboxMessage",
  "GoogleSecondaryCalendar",
  "GoogleLinkRequest",
  "PendingGoogleChange",
  "CrmConnection",
  "CrmInboundEvent",
  "ServerError",
  // Minutes on the "Sem confirmação" list (PRD 8, D-75).
  "ConfirmationWorkTime",
  "AuditEvent",
] as const satisfies readonly Prisma.ModelName[];

/** Logs that only grow: the audit trail (D-31) and the contact consent log (D-47). Database triggers back this up. */
export const APPEND_ONLY_MODELS = ["AuditEvent", "ContactConsent"] as const satisfies readonly (typeof PRACTICE_SCOPED_MODELS)[number][];

/** Only reachable through the base client, in services that justify it. */
export const CROSS_PRACTICE_MODELS = [
  "Organization",
  "OrganizationMember",
  "GoogleConnection",
  // A Google connection's calendars, and the sandbox provider's fake Google (Block 6).
  "GoogleCalendar",
  "SandboxGoogleCalendar",
  "SandboxGoogleEvent",
  // A FlwChat account, which several practices may share (D-73), and the sandbox's fake one.
  "CrmAccount",
  "SandboxCrmContact",
  "SandboxCrmNote",
  "SandboxCrmSubscription",
  // A device's Web Push, tied to its session (D-78), and the sandbox's fake delivery.
  "PushSubscription",
  "SandboxPushMessage",
  // Better Auth (D-35): sign-in is not tied to a practice.
  "Session",
  "Account",
  "Verification",
  "TwoFactor",
  // Better Auth's attempt counter, by address (D-96).
  "RateLimit",
] as const satisfies readonly Prisma.ModelName[];

/** Relations of `User` that would reveal other practices; not readable when scoped. */
export const USER_RELATION_FIELDS = [
  "organizationMemberships",
  "memberships",
  "professionals",
  "googleConnections",
  "sessions",
  "accounts",
  "twoFactors",
  "pushSubscriptions",
] as const;

export class PracticeScopeError extends Error {
  override name = "PracticeScopeError";
}

type Args = Record<string, unknown>;

const scopedModels = new Set<string>(PRACTICE_SCOPED_MODELS);
const appendOnlyModels = new Set<string>(APPEND_ONLY_MODELS);
const crossPracticeModels = new Set<string>(CROSS_PRACTICE_MODELS);
const userRelationFields = new Set<string>(USER_RELATION_FIELDS);

const READ_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);
const UPDATE_OPERATIONS = new Set(["update", "updateMany", "updateManyAndReturn"]);
const DELETE_OPERATIONS = new Set(["delete", "deleteMany"]);
const CREATE_OPERATIONS = new Set(["create", "createMany", "createManyAndReturn"]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return UUID.test(value);
}

export function scopeToPractice(client: BasePrismaClient, practiceId: string) {
  if (!isUuid(practiceId)) {
    throw new PracticeScopeError(`Invalid practice id: "${practiceId}"`);
  }

  return client.$extends(
    Prisma.defineExtension({
      name: "practice-scope",
      query: {
        $allOperations({ model, operation, args, query }) {
          if (!model) {
            throw new PracticeScopeError(
              `${operation} is not available in the practice-scoped client`,
            );
          }
          return query(scopeArgs(model, operation, (args ?? {}) as Args, practiceId));
        },
      },
    }),
  );
}

export type PracticeScopedClient = ReturnType<typeof scopeToPractice>;

function scopeArgs(model: string, operation: string, args: Args, practiceId: string): Args {
  if (scopedModels.has(model)) return scopePracticeModel(model, operation, args, practiceId);
  if (model === "Practice") return scopePractice(operation, args, practiceId);
  if (model === "User") return scopeUser(operation, args, practiceId);
  if (crossPracticeModels.has(model)) {
    throw new PracticeScopeError(`${model} is cross-practice; use the base client in a dedicated service`);
  }
  throw new PracticeScopeError(`${model} is not classified for practice isolation`);
}

function scopePracticeModel(model: string, operation: string, args: Args, practiceId: string): Args {
  const filter = { practiceId };

  if (appendOnlyModels.has(model) && (UPDATE_OPERATIONS.has(operation) || DELETE_OPERATIONS.has(operation) || operation === "upsert")) {
    throw new PracticeScopeError(`${model} is append-only`);
  }

  if (READ_OPERATIONS.has(operation) || DELETE_OPERATIONS.has(operation)) {
    return { ...args, where: and(args.where, filter) };
  }
  if (UPDATE_OPERATIONS.has(operation)) {
    assertDataStaysInPractice(model, args.data, practiceId);
    return { ...args, where: and(args.where, filter) };
  }
  if (CREATE_OPERATIONS.has(operation)) {
    const data = Array.isArray(args.data)
      ? args.data.map((row) => stampPractice(model, row, practiceId))
      : stampPractice(model, args.data, practiceId);
    return { ...args, data };
  }
  if (operation === "upsert") {
    assertDataStaysInPractice(model, args.update, practiceId);
    return {
      ...args,
      where: and(args.where, filter),
      create: stampPractice(model, args.create, practiceId),
    };
  }
  throw new PracticeScopeError(`${model}.${operation} is not supported in the practice-scoped client`);
}

function scopePractice(operation: string, args: Args, practiceId: string): Args {
  const filter = { id: practiceId };
  if (READ_OPERATIONS.has(operation)) {
    return { ...args, where: and(args.where, filter) };
  }
  if (UPDATE_OPERATIONS.has(operation)) {
    const data = asRecord(args.data);
    if (data && ("id" in data || "organizationId" in data || "organization" in data)) {
      throw new PracticeScopeError("A practice cannot change its id or organization");
    }
    assertNoRelationLinks(args.data, "Practice.data");
    return { ...args, where: and(args.where, filter) };
  }
  throw new PracticeScopeError(`Practice.${operation} is not available in the practice-scoped client`);
}

function scopeUser(operation: string, args: Args, practiceId: string): Args {
  if (!READ_OPERATIONS.has(operation)) {
    throw new PracticeScopeError(`User.${operation} is not available in the practice-scoped client`);
  }
  if (args.include !== undefined) {
    throw new PracticeScopeError("User relations are not readable in the practice-scoped client");
  }
  const select = asRecord(args.select);
  if (select && Object.keys(select).some((key) => userRelationFields.has(key) || key === "_count")) {
    throw new PracticeScopeError("User relations are not readable in the practice-scoped client");
  }
  return { ...args, where: and(args.where, { memberships: { some: { practiceId } } }) };
}

function stampPractice(model: string, data: unknown, practiceId: string): Args {
  const record = asRecord(data);
  if (!record) {
    throw new PracticeScopeError(`${model} create expects a data object`);
  }
  assertDataStaysInPractice(model, record, practiceId);
  return { ...record, practiceId };
}

function assertDataStaysInPractice(model: string, data: unknown, practiceId: string) {
  const record = asRecord(data);
  if (!record) return;
  const value = record.practiceId;
  if (value !== undefined && value !== practiceId && asRecord(value)?.set !== practiceId) {
    throw new PracticeScopeError(`${model}.practiceId must be the scoped practice`);
  }
  assertNoRelationLinks(record, `${model}.data`);
}

/**
 * Relation links (`connect`, `connectOrCreate`, `disconnect`, relation `set`) and the
 * `practice` relation can point a row at another practice; the scoped client takes
 * scalar foreign keys instead, which the composite foreign keys then check.
 */
function assertNoRelationLinks(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRelationLinks(item, `${path}[${index}]`));
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  for (const [key, child] of Object.entries(record)) {
    const isRelationSet = key === "set" && Array.isArray(child) && child.some((item) => asRecord(item));
    if (key === "connect" || key === "connectOrCreate" || key === "disconnect" || key === "practice" || isRelationSet) {
      throw new PracticeScopeError(
        `${path}.${key} is not allowed in the practice-scoped client; use scalar foreign keys such as patientId`,
      );
    }
    assertNoRelationLinks(child, `${path}.${key}`);
  }
}

function and(where: unknown, condition: Args): Args {
  const record = asRecord(where);
  if (!record) return condition;
  const existing = record.AND === undefined ? [] : Array.isArray(record.AND) ? record.AND : [record.AND];
  return { ...record, AND: [...existing, condition] };
}

function asRecord(value: unknown): Args | undefined {
  return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype
    ? (value as Args)
    : undefined;
}
