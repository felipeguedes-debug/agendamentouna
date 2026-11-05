import { describe, expect, it } from "vitest";
import { ACCESS_ROLES, can, invitableRoles, PERMISSIONS, type AccessRole, type Permission } from "./permissions";

// The "Papéis por conta" table of PRD section 3, row by row. Permissions outside
// the table (practice settings, audit trail) follow D-40.
const A = "ORG_ADMIN";
const M = "PRACTICE_MANAGER";
const S = "SECRETARY";
const P = "PROFESSIONAL";

const EXPECTED: Record<Permission, AccessRole[]> = {
  // Agenda: admin in every practice, manager in the practice, secretary books,
  // professional sees and blocks their own agenda and marks arrival (D-10).
  "agenda:view": [A, M, S],
  "agenda:view-own": [P],
  "appointments:manage": [A, M, S],
  "appointments:mark-arrival": [A, M, S, P],
  // Section 4: Chegou → Em atendimento → Atendido by secretary, manager and
  // professional; the manager releases an overlapping booking (rule 3).
  "appointments:attend": [A, M, S, P],
  "appointments:overbook": [A, M],
  "appointments:correct-final-status": [A, M],
  "appointments:edit-price": [A, M],
  "time-blocks:manage": [A, M, S],
  "time-blocks:manage-own": [P],
  "google-changes:resolve": [A, M, S],
  "google-changes:resolve-own": [P],
  // Pacientes (Block 4, D-47 to D-50): whoever books sees patients and records
  // consent; the professional sees only their own agenda, so not this screen.
  // The import and the data subject's export and erasure stay with admin and manager.
  "patients:view": [A, M, S],
  "patients:consent": [A, M, S],
  "patients:import": [A, M],
  "patients:data-requests": [A, M],
  // Tipos e valores: admin and manager edit, secretary only views, professional sees their own.
  "appointment-types:view": [A, M, S],
  "appointment-types:view-own": [P],
  "appointment-types:edit": [A, M],
  // Régua de WhatsApp: admin and manager edit (admin also templates), secretary
  // dispatches manually and reads the log, professional reads their patients' log.
  "cadence:edit": [A, M],
  "cadence:templates": [A],
  "dispatch:manual": [A, M, S],
  "dispatch-log:view": [A, M, S],
  "dispatch-log:view-own": [P],
  // Usuários e Google Agenda.
  "users:invite": [A, M],
  "users:manage": [A],
  "google:send-link": [A, M],
  "google:link-own": [P],
  // Relatórios.
  "reports:consolidated": [A],
  "reports:practice": [A, M],
  "reports:day-week": [A, M, S],
  "reports:own": [P],
  // Outside the table (D-40).
  "practice-settings:edit": [A, M],
  "audit:view": [A, M],
};

describe("role permissions (PRD section 3)", () => {
  it("covers every permission", () => {
    expect([...PERMISSIONS].sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const permission of PERMISSIONS) {
    it(`grants ${permission} to ${EXPECTED[permission].join(", ")}`, () => {
      const granted = ACCESS_ROLES.filter((role) => can(role, permission));
      expect(granted.sort()).toEqual([...EXPECTED[permission]].sort());
    });
  }

  it("keeps the cadence screen from the secretary and opens it to the manager", () => {
    expect(can("SECRETARY", "cadence:edit")).toBe(false);
    expect(can("PROFESSIONAL", "cadence:edit")).toBe(false);
    expect(can("PRACTICE_MANAGER", "cadence:edit")).toBe(true);
    expect(can("ORG_ADMIN", "cadence:edit")).toBe(true);
  });
});

describe("who invites whom", () => {
  it("lets the organization admin invite any practice role", () => {
    expect(invitableRoles("ORG_ADMIN").sort()).toEqual(["PRACTICE_MANAGER", "PROFESSIONAL", "SECRETARY"]);
  });

  it("lets the manager invite secretaries only", () => {
    expect(invitableRoles("PRACTICE_MANAGER")).toEqual(["SECRETARY"]);
  });

  it("lets nobody else invite", () => {
    expect(invitableRoles("SECRETARY")).toEqual([]);
    expect(invitableRoles("PROFESSIONAL")).toEqual([]);
  });
});
