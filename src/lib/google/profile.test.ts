import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createAppointment } from "@/lib/appointments/appointments";
import { inngest } from "@/lib/inngest/client";
import { dayAhead } from "../../../tests/helpers/cadence";
import { googleBlocksOf, googleStateOf, linkGoogle } from "../../../tests/helpers/google";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import type { PracticeContext } from "@/lib/auth/access";
import { refreshCalendarList, unlinkGoogle } from "./connection";
import { syncConnectionCalendars } from "./inbound";
import { exportAppointments } from "./outbound";
import { getGoogleProfile, listProfessionalsGoogle, saveBusyCalendars, setAllDayEventsBlock } from "./profile";
import { addSandboxCalendar, deleteSandboxEvent, putSandboxEvent, SandboxGoogleProvider } from "./sandbox";
import { eventIdFor } from "./rules";

// The professional's profile (PRD 11, D-23; PRD 5, rules 1, 2 and 6): the
// professional links their Google, chooses the calendars that count as busy and the
// all-day rule; the manager sees the link and its warnings, never the names of the
// professional's personal calendars; either can unlink.

vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] } as never);

let fixture: AgendaFixture;
let ana: PracticeContext;
let bruno: PracticeContext;
let manager: PracticeContext;
let secretary: PracticeContext;
let holidays: string;
let linkedEmail: string;

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Perfil Google");
  ana = await contextAs(fixture, "PROFESSIONAL", { professionalId: fixture.professionals.ana.id });
  bruno = await contextAs(fixture, "PROFESSIONAL", { professionalId: fixture.professionals.bruno.id });
  manager = await contextAs(fixture, "PRACTICE_MANAGER");
  secretary = await contextAs(fixture, "SECRETARY");
  const linked = await linkGoogle(fixture.practiceId, fixture.professionals.ana.id);
  linkedEmail = linked.email;
  holidays = await addSandboxCalendar(linked.subject, { summary: "Feriados no Brasil", accessRole: "reader" });
  await addSandboxCalendar(linked.subject, { summary: "Família", accessRole: "writer" });
  await refreshCalendarList(linked.connectionId);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("profile", () => {
  it("shows the professional their link and calendars, busy by default when they can write to them", async () => {
    const profile = await getGoogleProfile(ana, fixture.professionals.ana.id);
    expect(profile.link).toMatchObject({ status: "active", email: linkedEmail, secondaryCalendarName: "Consultório Perfil Google" });
    expect(profile.canChooseCalendars).toBe(true);
    const calendars = Object.fromEntries((profile.calendars ?? []).map((calendar) => [calendar.summary, calendar]));
    expect(calendars[linkedEmail]).toMatchObject({ busy: true, ownSecondary: false });
    expect(calendars["Família"]).toMatchObject({ busy: true });
    expect(calendars["Feriados no Brasil"]).toMatchObject({ busy: false });
    expect(calendars["Consultório Perfil Google"]).toMatchObject({ busy: false, ownSecondary: true });
    expect(profile.allDayEventsBlock).toBe(true);
  });

  it("shows the manager the link without the professional's calendars", async () => {
    const profile = await getGoogleProfile(manager, fixture.professionals.ana.id);
    expect(profile.link.status).toBe("active");
    expect(profile.calendars).toBeNull();
    expect(profile.canSendLink).toBe(true);
    expect(profile.canChooseCalendars).toBe(false);
    const rows = await listProfessionalsGoogle(manager);
    expect(rows.find((row) => row.id === fixture.professionals.ana.id)).toMatchObject({ status: "active", email: linkedEmail });
    expect(rows.find((row) => row.id === fixture.professionals.bruno.id)).toMatchObject({ status: "none", email: null });
  });

  it("is closed to the secretary and to another professional", async () => {
    await expect(getGoogleProfile(secretary, fixture.professionals.ana.id)).rejects.toThrow(expect.objectContaining({ code: "not_allowed" }));
    await expect(getGoogleProfile(bruno, fixture.professionals.ana.id)).rejects.toThrow(expect.objectContaining({ code: "not_allowed" }));
    await expect(listProfessionalsGoogle(secretary)).rejects.toThrow(expect.objectContaining({ code: "not_allowed" }));
  });

  it("warns when Google revoked the link (rule 6)", async () => {
    const own = await createAgendaFixture("Consultório Perfil Revogado");
    const linked = await linkGoogle(own.practiceId, own.professionals.ana.id);
    await prisma.googleConnection.update({ where: { id: linked.connectionId }, data: { status: "REVOKED", lastError: "invalid_grant" } });
    const ownManager = await contextAs(own, "PRACTICE_MANAGER");
    expect((await getGoogleProfile(ownManager, own.professionals.ana.id)).link.status).toBe("revoked");
    expect((await listProfessionalsGoogle(ownManager)).find((row) => row.id === own.professionals.ana.id)?.status).toBe("revoked");
  });
});

describe("busy calendars and the all-day rule", () => {
  it("lets the professional choose the calendars that count, read-only ones included", async () => {
    await saveBusyCalendars(ana, { calendarIds: [holidays, "nao-existe@group"] });
    const calendars = (await getGoogleProfile(ana, fixture.professionals.ana.id)).calendars!;
    expect(calendars.filter((calendar) => calendar.busy).map((calendar) => calendar.summary)).toEqual(["Feriados no Brasil"]);
    const professional = await fixture.db.professional.findUniqueOrThrow({ where: { id: fixture.professionals.ana.id } });
    expect(professional).toMatchObject({ googleBusyCalendarsChosen: true, googleBusyCalendarIds: [holidays] });

    await saveBusyCalendars(ana, { useDefault: true });
    expect(await fixture.db.professional.findUniqueOrThrow({ where: { id: fixture.professionals.ana.id } })).toMatchObject({
      googleBusyCalendarsChosen: false,
      googleBusyCalendarIds: [],
    });
  });

  it("lets the professional turn off the all-day rule", async () => {
    await setAllDayEventsBlock(ana, false);
    expect((await getGoogleProfile(ana, fixture.professionals.ana.id)).allDayEventsBlock).toBe(false);
    await setAllDayEventsBlock(ana, true);
  });

  it("is the professional's own choice", async () => {
    await expect(saveBusyCalendars(manager, { calendarIds: [] })).rejects.toThrow(expect.objectContaining({ code: "not_allowed" }));
    await expect(setAllDayEventsBlock(secretary, false)).rejects.toThrow(expect.objectContaining({ code: "not_allowed" }));
  });
});

describe("unlinking", () => {
  it("removes Google's blocks, the secondary calendar and the pending changes, and revokes a connection nobody else uses", async () => {
    const own = await createAgendaFixture("Consultório Desvincular");
    const linked = await linkGoogle(own.practiceId, own.professionals.ana.id);
    const ownSecretary = await contextAs(own, "SECRETARY");
    const professional = await contextAs(own, "PROFESSIONAL", { professionalId: own.professionals.ana.id });
    const { id } = await createAppointment(ownSecretary, {
      patientId: own.patient.id,
      professionalId: own.professionals.ana.id,
      locationId: own.locations.aldeota.id,
      appointmentTypeId: own.types.consultation.id,
      date: dayAhead(3),
      time: "10:00",
    });
    await exportAppointments(own.practiceId);
    await putSandboxEvent(linked.primaryCalendarId, { start: new Date(Date.now() + 2 * 86_400_000), end: new Date(Date.now() + 2 * 86_400_000 + 3_600_000) });
    await deleteSandboxEvent(linked.secondaryCalendarId!, eventIdFor(id));
    await syncConnectionCalendars(linked.connectionId);
    expect(await googleBlocksOf(own.practiceId, own.professionals.ana.id)).toHaveLength(1);
    expect(await own.db.pendingGoogleChange.count({ where: { resolvedAt: null } })).toBe(1);

    const revoked: string[] = [];
    class Revoking extends SandboxGoogleProvider {
      override async revoke(token: string) {
        revoked.push(token);
      }
    }
    await unlinkGoogle(professional, own.professionals.ana.id, { provider: new Revoking() });

    expect((await own.db.professional.findUniqueOrThrow({ where: { id: own.professionals.ana.id } })).googleConnectionId).toBeNull();
    expect(await googleBlocksOf(own.practiceId, own.professionals.ana.id)).toEqual([]);
    expect(await own.db.googleSecondaryCalendar.count()).toBe(0);
    expect(await own.db.pendingGoogleChange.findFirst()).toMatchObject({ resolution: "SUPERSEDED" });
    expect(await googleStateOf(own.practiceId, id)).toMatchObject({ googleEventId: null, googleSyncRequestedAt: null });
    expect(await prisma.googleConnection.findUnique({ where: { id: linked.connectionId } })).toBeNull();
    expect(revoked).toHaveLength(1);
    // The calendar the app created goes with the link.
    expect(await prisma.sandboxGoogleCalendar.findUnique({ where: { calendarId: linked.secondaryCalendarId! } })).toBeNull();
    const audit = await own.db.auditEvent.findFirst({ where: { action: "professional.google_unlinked", entityId: own.professionals.ana.id } });
    expect(audit?.changedFields).toEqual(["googleConnectionId"]);
  });

  it("keeps the connection while the same person's professional in another practice uses it", async () => {
    const first = await createAgendaFixture("Consultório Desvincular Um");
    const second = await createAgendaFixture("Consultório Desvincular Dois");
    const linked = await linkGoogle(first.practiceId, first.professionals.ana.id);
    await linkGoogle(second.practiceId, second.professionals.ana.id, { email: linked.email });
    await unlinkGoogle(await contextAs(first, "PRACTICE_MANAGER"), first.professionals.ana.id);
    expect(await prisma.googleConnection.findUnique({ where: { id: linked.connectionId } })).not.toBeNull();
    expect((await second.db.professional.findUniqueOrThrow({ where: { id: second.professionals.ana.id } })).googleConnectionId).toBe(linked.connectionId);
  });

  it("is refused to the secretary and to another professional", async () => {
    await expect(unlinkGoogle(secretary, fixture.professionals.ana.id)).rejects.toThrow(expect.objectContaining({ code: "not_allowed" }));
    await expect(unlinkGoogle(bruno, fixture.professionals.ana.id)).rejects.toThrow(expect.objectContaining({ code: "not_allowed" }));
  });
});
