import { describe, expect, it } from "vitest";
import type { AppointmentStatus } from "@/generated/prisma/enums";
import { ACCESS_ROLES, type AccessRole } from "@/lib/auth/permissions";
import { checkTransition, IMPORTABLE_STATUSES, nextStatuses, STATUSES, type StatusActor } from "./status";

// The "Transições de status" table of PRD section 4 (D-10, D-11), row by row.

const SCHEDULED = "SCHEDULED";
const CONFIRMED = "CONFIRMED";
const ARRIVED = "ARRIVED";
const IN_PROGRESS = "IN_PROGRESS";
const COMPLETED = "COMPLETED";
const NO_SHOW = "NO_SHOW";
const BY_PATIENT = "CANCELED_BY_PATIENT";
const BY_PRACTICE = "CANCELED_BY_PRACTICE";
const RESCHEDULED = "RESCHEDULED";
const FINAL = [COMPLETED, NO_SHOW, BY_PATIENT, BY_PRACTICE] as const;

const OFFICE: AccessRole[] = ["ORG_ADMIN", "PRACTICE_MANAGER", "SECRETARY"];
const MANAGERS: AccessRole[] = ["ORG_ADMIN", "PRACTICE_MANAGER"];
const EVERYONE: AccessRole[] = [...OFFICE, "PROFESSIONAL"];

type Row = { from: AppointmentStatus; to: AppointmentStatus; roles: AccessRole[]; cadence?: boolean; reason?: boolean };

const TABLE: Row[] = [
  // Agendado: secretária e gestor; Chegou também pelo profissional; Confirmado e
  // Cancelado pelo paciente também pela régua. Reagendado só pelo fluxo de remarcar.
  { from: SCHEDULED, to: CONFIRMED, roles: OFFICE, cadence: true },
  { from: SCHEDULED, to: ARRIVED, roles: EVERYONE },
  { from: SCHEDULED, to: NO_SHOW, roles: OFFICE },
  { from: SCHEDULED, to: BY_PATIENT, roles: OFFICE, cadence: true },
  { from: SCHEDULED, to: BY_PRACTICE, roles: OFFICE },
  // Confirmado: the same, without Confirmado.
  { from: CONFIRMED, to: ARRIVED, roles: EVERYONE },
  { from: CONFIRMED, to: NO_SHOW, roles: OFFICE },
  { from: CONFIRMED, to: BY_PATIENT, roles: OFFICE, cadence: true },
  { from: CONFIRMED, to: BY_PRACTICE, roles: OFFICE },
  // Chegou and Em atendimento: secretária, gestor e profissional.
  { from: ARRIVED, to: IN_PROGRESS, roles: EVERYONE },
  { from: ARRIVED, to: COMPLETED, roles: EVERYONE },
  { from: IN_PROGRESS, to: COMPLETED, roles: EVERYONE },
  // Final statuses: correction by the manager or the admin, with a reason.
  ...FINAL.flatMap((from) =>
    FINAL.filter((to) => to !== from).map((to) => ({ from, to, roles: MANAGERS, reason: true })),
  ),
];

function expected(from: AppointmentStatus, to: AppointmentStatus) {
  return TABLE.find((row) => row.from === from && row.to === to);
}

const own = (role: AccessRole): StatusActor => ({ kind: "user", role, ownsAppointment: true });

describe("status transitions (PRD section 4)", () => {
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      if (from === to) continue;
      const row = expected(from, to);
      for (const role of ACCESS_ROLES) {
        const allowed = row?.roles.includes(role) ?? false;
        it(`${from} → ${to} ${allowed ? "is allowed" : "is refused"} for ${role}`, () => {
          const result = checkTransition(from, to, own(role));
          expect(result.ok).toBe(allowed);
          if (result.ok) expect(result.reasonRequired).toBe(Boolean(row?.reason));
        });
      }
      it(`${from} → ${to} ${row?.cadence ? "is allowed" : "is refused"} for the cadence`, () => {
        expect(checkTransition(from, to, { kind: "cadence" }).ok).toBe(Boolean(row?.cadence));
      });
    }
  }

  it("never leaves Reagendado", () => {
    for (const role of ACCESS_ROLES) expect(nextStatuses(RESCHEDULED, own(role))).toEqual([]);
  });

  it("reaches Reagendado only through rescheduling", () => {
    expect(checkTransition(SCHEDULED, RESCHEDULED, own("SECRETARY"))).toEqual({ ok: false, code: "invalid_transition" });
    expect(checkTransition(SCHEDULED, RESCHEDULED, own("SECRETARY"), { via: "reschedule" }).ok).toBe(true);
    expect(checkTransition(CONFIRMED, RESCHEDULED, own("PRACTICE_MANAGER"), { via: "reschedule" }).ok).toBe(true);
    expect(checkTransition(ARRIVED, RESCHEDULED, own("PRACTICE_MANAGER"), { via: "reschedule" }).ok).toBe(false);
    expect(checkTransition(SCHEDULED, RESCHEDULED, own("PROFESSIONAL"), { via: "reschedule" }).ok).toBe(false);
  });

  it("tells apart a transition that does not exist from one the role lacks", () => {
    expect(checkTransition(SCHEDULED, COMPLETED, own("PRACTICE_MANAGER"))).toEqual({ ok: false, code: "invalid_transition" });
    expect(checkTransition(SCHEDULED, CONFIRMED, own("PROFESSIONAL"))).toEqual({ ok: false, code: "not_allowed" });
  });

  it("lets the professional act only on their own appointments", () => {
    const other: StatusActor = { kind: "user", role: "PROFESSIONAL", ownsAppointment: false };
    expect(checkTransition(SCHEDULED, ARRIVED, other)).toEqual({ ok: false, code: "not_allowed" });
    expect(checkTransition(SCHEDULED, ARRIVED, { kind: "user", role: "SECRETARY", ownsAppointment: false }).ok).toBe(true);
  });

  it("offers each role the next statuses of the table", () => {
    expect(nextStatuses(SCHEDULED, own("SECRETARY"))).toEqual([CONFIRMED, ARRIVED, NO_SHOW, BY_PATIENT, BY_PRACTICE]);
    expect(nextStatuses(SCHEDULED, own("PROFESSIONAL"))).toEqual([ARRIVED]);
    expect(nextStatuses(ARRIVED, own("PROFESSIONAL"))).toEqual([IN_PROGRESS, COMPLETED]);
    expect(nextStatuses(COMPLETED, own("SECRETARY"))).toEqual([]);
    expect(nextStatuses(COMPLETED, own("PRACTICE_MANAGER"))).toEqual([NO_SHOW, BY_PATIENT, BY_PRACTICE]);
  });
});

describe("status carried by an imported appointment (D-48)", () => {
  const importer: StatusActor = { kind: "import" };

  it("goes from Agendado straight to the statuses a spreadsheet can carry", () => {
    expect(IMPORTABLE_STATUSES).toEqual([SCHEDULED, CONFIRMED, ...FINAL]);
    for (const to of [CONFIRMED, ...FINAL] as AppointmentStatus[]) expect(checkTransition(SCHEDULED, to, importer), to).toEqual({ ok: true, reasonRequired: false });
  });

  it("never sets Chegou, Em atendimento or Reagendado, nor starts from another status", () => {
    for (const to of [ARRIVED, IN_PROGRESS, RESCHEDULED] as AppointmentStatus[]) expect(checkTransition(SCHEDULED, to, importer).ok, to).toBe(false);
    expect(checkTransition(SCHEDULED, RESCHEDULED, importer, { via: "reschedule" }).ok).toBe(false);
    for (const from of STATUSES.filter((status) => status !== SCHEDULED)) {
      for (const to of STATUSES) expect(checkTransition(from, to, importer).ok, `${from} → ${to}`).toBe(false);
    }
  });
});

describe("status set by accepting a change made in Google (D-63)", () => {
  const google: StatusActor = { kind: "google" };

  it("cancels by the practice an event deleted in Google, from Agendado or Confirmado", () => {
    expect(checkTransition(SCHEDULED, BY_PRACTICE, google)).toEqual({ ok: true, reasonRequired: false });
    expect(checkTransition(CONFIRMED, BY_PRACTICE, google)).toEqual({ ok: true, reasonRequired: false });
  });

  it("reschedules an event moved in Google, only through rescheduling", () => {
    expect(checkTransition(SCHEDULED, RESCHEDULED, google, { via: "reschedule" }).ok).toBe(true);
    expect(checkTransition(CONFIRMED, RESCHEDULED, google, { via: "reschedule" }).ok).toBe(true);
    expect(checkTransition(SCHEDULED, RESCHEDULED, google).ok).toBe(false);
  });

  it("sets nothing else", () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        if ((from === SCHEDULED || from === CONFIRMED) && to === BY_PRACTICE) continue;
        expect(checkTransition(from, to, google).ok, `${from} → ${to}`).toBe(false);
      }
    }
  });
});

describe("the CRM as the actor (D-66)", () => {
  it("only confirms an Agendado appointment", () => {
    expect(checkTransition("SCHEDULED", "CONFIRMED", { kind: "crm" })).toEqual({ ok: true, reasonRequired: false });
    for (const to of ["ARRIVED", "COMPLETED", "NO_SHOW", "CANCELED_BY_PATIENT", "CANCELED_BY_PRACTICE"] as const) {
      expect(checkTransition("SCHEDULED", to, { kind: "crm" }).ok).toBe(false);
    }
    expect(checkTransition("CONFIRMED", "CANCELED_BY_PRACTICE", { kind: "crm" }).ok).toBe(false);
    expect(checkTransition("CANCELED_BY_PATIENT", "CONFIRMED", { kind: "crm" }).ok).toBe(false);
  });
});
