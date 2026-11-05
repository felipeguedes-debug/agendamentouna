import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "./client";
import { PracticeScopeError, PRACTICE_SCOPED_MODELS, scopeToPractice } from "./practice-scope";

// Block 1 done criterion: no practice reads or writes another practice's data,
// not even with a guessed id (PRD 7, Isolamento).

const base = createPrismaClient(process.env.DATABASE_URL_TEST);

type Fixture = Awaited<ReturnType<typeof createPractice>>;

async function createPractice(label: string) {
  const organization = await base.organization.create({ data: { name: `Org ${label}` } });
  const practice = await base.practice.create({
    data: { organizationId: organization.id, name: `Practice ${label}` },
  });
  const practiceId = practice.id;
  const user = await base.user.create({
    data: { name: `Secretary ${label}`, email: `secretary-${label}@example.com` },
  });
  await base.membership.create({ data: { practiceId, userId: user.id, role: "SECRETARY" } });
  const location = await base.location.create({
    data: { practiceId, name: `Location ${label}`, address: "Rua Exemplo, 1" },
  });
  const professional = await base.professional.create({ data: { practiceId, name: `Dr. ${label}` } });
  const patient = await base.patient.create({
    data: { practiceId, name: `Patient ${label}`, phone: `+55859000000${label === "A" ? "01" : "02"}` },
  });
  const type = await base.appointmentType.create({
    data: {
      practiceId,
      name: "Primeira consulta",
      category: "CONSULTATION",
      durationMinutes: 30,
      defaultPriceCents: label === "A" ? 45000 : 99000,
      color: "#0F766E",
    },
  });
  const startsAt = new Date("2026-11-03T13:00:00Z");
  const appointment = await base.appointment.create({
    data: {
      practiceId,
      locationId: location.id,
      professionalId: professional.id,
      patientId: patient.id,
      appointmentTypeId: type.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      durationMinutes: 30,
      priceCents: type.defaultPriceCents,
      statusChanges: { create: { toStatus: "SCHEDULED", source: "USER" } },
    },
  });
  const auditEvent = await base.auditEvent.create({
    data: {
      practiceId,
      actorType: "USER",
      actorUserId: user.id,
      action: "appointment.created",
      entityType: "Appointment",
      entityId: appointment.id,
      changedFields: [],
    },
  });
  return { organization, practiceId, user, location, professional, patient, type, appointment, auditEvent };
}

let a: Fixture;
let b: Fixture;
let scopedA: ReturnType<typeof scopeToPractice>;

beforeAll(async () => {
  a = await createPractice("A");
  b = await createPractice("B");
  scopedA = scopeToPractice(base, a.practiceId);
});

afterAll(async () => {
  await base.$disconnect();
});

describe("practice-scoped client: reads", () => {
  it("lists only the scoped practice's rows", async () => {
    const patients = await scopedA.patient.findMany();
    expect(patients.map((patient) => patient.id)).toEqual([a.patient.id]);
  });

  it("does not find another practice's row by id", async () => {
    expect(await scopedA.patient.findUnique({ where: { id: b.patient.id } })).toBeNull();
    expect(await scopedA.appointment.findFirst({ where: { id: b.appointment.id } })).toBeNull();
    await expect(scopedA.patient.findUniqueOrThrow({ where: { id: b.patient.id } })).rejects.toThrow();
  });

  it("ignores a filter that names another practice", async () => {
    expect(await scopedA.patient.findMany({ where: { practiceId: b.practiceId } })).toEqual([]);
  });

  it("counts, aggregates and groups only the scoped practice", async () => {
    expect(await scopedA.appointment.count()).toBe(1);
    const sum = await scopedA.appointment.aggregate({ _sum: { priceCents: true } });
    expect(sum._sum.priceCents).toBe(45000);
    const groups = await scopedA.appointment.groupBy({ by: ["status"], _count: { _all: true } });
    expect(groups).toEqual([{ status: "SCHEDULED", _count: { _all: 1 } }]);
  });

  it("keeps included relations inside the practice", async () => {
    const appointments = await scopedA.appointment.findMany({
      include: { patient: true, statusChanges: true },
    });
    expect(appointments).toHaveLength(1);
    expect(appointments[0].patient.practiceId).toBe(a.practiceId);
    expect(appointments[0].statusChanges.every((change) => change.practiceId === a.practiceId)).toBe(true);
  });

  it("keeps the scope inside interactive transactions", async () => {
    const ids = await scopedA.$transaction(async (tx) => {
      const patients = await tx.patient.findMany();
      return patients.map((patient) => patient.id);
    });
    expect(ids).toEqual([a.patient.id]);
  });
});

describe("practice-scoped client: writes", () => {
  it("cannot update another practice's row", async () => {
    await expect(
      scopedA.patient.update({ where: { id: b.patient.id }, data: { name: "Hijacked" } }),
    ).rejects.toThrow();
    const { count } = await scopedA.patient.updateMany({ where: { id: b.patient.id }, data: { name: "Hijacked" } });
    expect(count).toBe(0);
    expect((await base.patient.findUniqueOrThrow({ where: { id: b.patient.id } })).name).toBe("Patient B");
  });

  it("cannot delete another practice's row", async () => {
    await expect(scopedA.appointment.delete({ where: { id: b.appointment.id } })).rejects.toThrow();
    const { count } = await scopedA.appointment.deleteMany({ where: { id: b.appointment.id } });
    expect(count).toBe(0);
    expect(await base.appointment.findUnique({ where: { id: b.appointment.id } })).not.toBeNull();
  });

  it("accepts the scoped practice's own id on create, createMany and upsert", async () => {
    const created = await scopedA.patient.create({ data: { practiceId: a.practiceId, name: "New patient" } });
    expect(created.practiceId).toBe(a.practiceId);

    await scopedA.appointmentFlag.createMany({
      data: [{ practiceId: a.practiceId, appointmentId: a.appointment.id, type: "NO_CONFIRMATION" }],
    });
    const flags = await base.appointmentFlag.findMany({ where: { appointmentId: a.appointment.id } });
    expect(flags.map((flag) => flag.practiceId)).toEqual([a.practiceId]);

    // An upsert aimed at another practice's id creates a row in the scoped practice instead.
    const upserted = await scopedA.patient.upsert({
      where: { id: b.patient.id },
      create: { practiceId: a.practiceId, name: "Upserted patient" },
      update: { name: "Hijacked" },
    });
    expect(upserted.practiceId).toBe(a.practiceId);
    expect(upserted.id).not.toBe(b.patient.id);
    expect((await base.patient.findUniqueOrThrow({ where: { id: b.patient.id } })).name).toBe("Patient B");
  });

  it("stamps the scoped practice when practiceId is left out", async () => {
    // The generated types require practiceId; the scoped client fills it in anyway.
    const created = await scopedA.patient.create({ data: { name: "No practiceId" } as never });
    expect(created.practiceId).toBe(a.practiceId);
  });

  it("rejects data that names another practice", async () => {
    await expect(
      scopedA.patient.create({ data: { name: "X", practiceId: b.practiceId } }),
    ).rejects.toThrow(PracticeScopeError);
    await expect(
      scopedA.patient.createMany({ data: [{ name: "X", practiceId: b.practiceId }] }),
    ).rejects.toThrow(PracticeScopeError);
    await expect(
      scopedA.patient.update({ where: { id: a.patient.id }, data: { practiceId: b.practiceId } }),
    ).rejects.toThrow(PracticeScopeError);
  });

  it("rejects relation links, which could point outside the practice", async () => {
    await expect(
      scopedA.appointmentFlag.create({
        data: { type: "NO_CONFIRMATION", appointment: { connect: { id: b.appointment.id } } },
      } as never),
    ).rejects.toThrow(PracticeScopeError);
  });

  it("lets the database reject a reference to another practice's row", async () => {
    await expect(
      scopedA.appointment.create({
        data: {
          practiceId: a.practiceId,
          locationId: a.location.id,
          professionalId: a.professional.id,
          patientId: b.patient.id,
          appointmentTypeId: a.type.id,
          startsAt: new Date("2026-11-04T13:00:00Z"),
          endsAt: new Date("2026-11-04T13:30:00Z"),
          durationMinutes: 30,
          priceCents: 45000,
        },
      }),
    ).rejects.toThrow(/foreign key/i);
  });

  it("lets the database reject moving a row to another practice, even through the base client", async () => {
    await expect(
      base.location.update({ where: { id: a.location.id }, data: { practiceId: b.practiceId } }),
    ).rejects.toThrow(/immutable|foreign key/i);
    await expect(
      base.cadence.create({ data: { practiceId: a.practiceId, name: "Moving" } }).then((cadence) =>
        base.cadence.update({ where: { id: cadence.id }, data: { practiceId: b.practiceId } }),
      ),
    ).rejects.toThrow(/immutable/i);
  });
});

describe("practice-scoped client: other models", () => {
  it("limits Practice to the scoped practice", async () => {
    expect((await scopedA.practice.findMany()).map((practice) => practice.id)).toEqual([a.practiceId]);
    expect(await scopedA.practice.findUnique({ where: { id: b.practiceId } })).toBeNull();
    await expect(scopedA.practice.update({ where: { id: b.practiceId }, data: { name: "X" } })).rejects.toThrow();
    await expect(
      scopedA.practice.create({ data: { name: "X", organizationId: a.organization.id } }),
    ).rejects.toThrow(PracticeScopeError);
    await expect(
      scopedA.practice.update({ where: { id: a.practiceId }, data: { organizationId: b.organization.id } }),
    ).rejects.toThrow(PracticeScopeError);
  });

  it("limits User to members of the practice and hides their other memberships", async () => {
    expect((await scopedA.user.findMany()).map((user) => user.id)).toEqual([a.user.id]);
    expect(await scopedA.user.findUnique({ where: { id: b.user.id } })).toBeNull();
    await expect(scopedA.user.findMany({ include: { memberships: true } })).rejects.toThrow(PracticeScopeError);
    await expect(scopedA.user.findMany({ select: { id: true, memberships: true } })).rejects.toThrow(
      PracticeScopeError,
    );
    await expect(
      scopedA.user.update({ where: { id: a.user.id }, data: { name: "X" } }),
    ).rejects.toThrow(PracticeScopeError);
  });

  it("hides the sign-in relations of User (D-35)", async () => {
    await expect(scopedA.user.findMany({ select: { id: true, sessions: true } })).rejects.toThrow(PracticeScopeError);
    await expect(scopedA.user.findMany({ select: { id: true, accounts: true } })).rejects.toThrow(PracticeScopeError);
  });

  it("blocks cross-practice models and raw SQL", async () => {
    await expect(scopedA.organization.findMany()).rejects.toThrow(PracticeScopeError);
    await expect(scopedA.googleConnection.findMany()).rejects.toThrow(PracticeScopeError);
    await expect(scopedA.session.findMany()).rejects.toThrow(PracticeScopeError);
    await expect(scopedA.account.findMany()).rejects.toThrow(PracticeScopeError);
    await expect(scopedA.twoFactor.findMany()).rejects.toThrow(PracticeScopeError);
    await expect(scopedA.$queryRaw`SELECT 1`).rejects.toThrow(PracticeScopeError);
    await expect(scopedA.$executeRawUnsafe("DELETE FROM \"Patient\"")).rejects.toThrow(PracticeScopeError);
  });

  it("rejects an invalid practice id", () => {
    expect(() => scopeToPractice(base, "not-a-uuid")).toThrow(PracticeScopeError);
  });
});

describe("audit trail", () => {
  it("is append-only in the scoped client", async () => {
    await expect(
      scopedA.auditEvent.update({ where: { id: a.auditEvent.id }, data: { action: "x" } }),
    ).rejects.toThrow(PracticeScopeError);
    await expect(scopedA.auditEvent.deleteMany()).rejects.toThrow(PracticeScopeError);
    const created = await scopedA.auditEvent.create({
      data: {
        practiceId: a.practiceId,
        actorType: "SYSTEM",
        action: "test.event",
        entityType: "Patient",
        changedFields: ["name"],
      },
    });
    expect(created.practiceId).toBe(a.practiceId);
  });

  it("is append-only in the database, even through the base client", async () => {
    await expect(
      base.auditEvent.update({ where: { id: a.auditEvent.id }, data: { action: "x" } }),
    ).rejects.toThrow(/append-only/);
    await expect(base.auditEvent.delete({ where: { id: a.auditEvent.id } })).rejects.toThrow(/append-only/);
    await expect(base.$executeRawUnsafe('TRUNCATE "AuditEvent" CASCADE')).rejects.toThrow(/append-only/);
  });
});

describe("contact consent log (D-47)", () => {
  it("is append-only in the scoped client and in the database", async () => {
    const patient = await scopedA.patient.create({ data: { practiceId: a.practiceId, name: "Consent A", phone: "+5585900000099" } });
    const consent = await scopedA.contactConsent.create({
      data: { practiceId: a.practiceId, patientId: patient.id, granted: true, channel: "IN_PERSON" },
    });
    await expect(scopedA.contactConsent.update({ where: { id: consent.id }, data: { granted: false } })).rejects.toThrow(PracticeScopeError);
    await expect(scopedA.contactConsent.deleteMany()).rejects.toThrow(PracticeScopeError);
    await expect(base.contactConsent.update({ where: { id: consent.id }, data: { granted: false } })).rejects.toThrow(/append-only/);
    await expect(base.contactConsent.delete({ where: { id: consent.id } })).rejects.toThrow(/append-only/);
    await expect(base.$executeRawUnsafe('TRUNCATE "ContactConsent" CASCADE')).rejects.toThrow(/append-only/);
    // The patient is pseudonymized, never deleted, so the log outlives the erasure (D-28).
    await expect(base.patient.delete({ where: { id: patient.id } })).rejects.toThrow();
  });
});

describe("database triggers", () => {
  it("protects practiceId on every practice-scoped table", async () => {
    const rows = await base.$queryRaw<{ table: string }[]>`
      SELECT c.relname AS "table"
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal AND t.tgname LIKE '%\_practice\_immutable'
    `;
    expect(rows.map((row) => row.table).sort()).toEqual([...PRACTICE_SCOPED_MODELS].sort());
  });
});
