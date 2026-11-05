import { describe, expect, it } from "vitest";
import { commandsIn, commandFailureNote, CRM_COMMAND_TAGS, CRM_STATUS_TAGS, isCrmSyncedStatus, manualContactNote, parseWebhookEvent, sameTag, statusNote, statusTagOf, statusTagsIn } from "./rules";

// The pure rules of the CRM integration (D-66, D-68): which tag is a command, which
// status tag the contact shows, what a note says and how a webhook body is read.

const NOW = new Date("2026-11-10T12:00:00Z");

describe("commandsIn", () => {
  it("finds the secretary's commands, whatever the case or accents", () => {
    expect(commandsIn(["Lead", "Confirmar na agenda"])).toEqual(["confirm"]);
    expect(commandsIn(["contato manual NA AGENDA"])).toEqual(["manual_contact"]);
    expect(commandsIn(["  Confirmar   na Agenda  "])).toEqual(["confirm"]);
    expect(commandsIn(["Confirmar na agenda", "Contato manual na agenda"])).toEqual(["confirm", "manual_contact"]);
  });

  it("does not take a status tag for a command: the agenda writes those itself", () => {
    expect(commandsIn(Object.values(CRM_STATUS_TAGS))).toEqual([]);
    expect(commandsIn(["confirmar", "Confirmado", ""])).toEqual([]);
  });

  it("never names a command tag and a status tag alike", () => {
    const commands = new Set(Object.values(CRM_COMMAND_TAGS).map((tag) => tag.toLowerCase()));
    for (const tag of Object.values(CRM_STATUS_TAGS)) expect(commands.has(tag.toLowerCase())).toBe(false);
  });

  it("keeps commands from reading like status tags: in the real test, the one who designed them clicked the wrong one (D-70)", () => {
    for (const command of Object.values(CRM_COMMAND_TAGS)) expect(command.toLowerCase().startsWith("agenda:")).toBe(false);
    for (const status of Object.values(CRM_STATUS_TAGS)) expect(status.startsWith("Agenda: ")).toBe(true);
  });
});

describe("the names of tags (D-70)", () => {
  it("compares them as the API does: on a contact they come in capitals", () => {
    expect(commandsIn(["CONFIRMAR NA AGENDA", "CAMPANHA"])).toEqual(["confirm"]);
    expect(sameTag("AGENDA: CONFIRMADO", "Agenda: Confirmado")).toBe(true);
    expect(sameTag("AGENDA: CONFIRMADO", "Agenda: Agendado")).toBe(false);
    expect(statusTagsIn(["AGENDA: CONFIRMADO", "CAMPANHA", "CONFIRMAR NA AGENDA", "AGENDADO"])).toEqual(["AGENDA: CONFIRMADO"]);
  });
});

describe("statusTagOf", () => {
  const at = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);

  it("shows the next appointment still waiting for the visit", () => {
    expect(
      statusTagOf(
        [
          { status: "SCHEDULED", startsAt: at(240) },
          { status: "CONFIRMED", startsAt: at(24) },
          { status: "COMPLETED", startsAt: at(-24) },
        ],
        NOW,
      ),
    ).toBe("Agenda: Confirmado");
  });

  it("falls back to the latest appointment when nothing is ahead", () => {
    expect(
      statusTagOf(
        [
          { status: "COMPLETED", startsAt: at(-240) },
          { status: "NO_SHOW", startsAt: at(-24) },
        ],
        NOW,
      ),
    ).toBe("Agenda: Faltou");
    expect(statusTagOf([{ status: "CANCELED_BY_PATIENT", startsAt: at(24) }], NOW)).toBe("Agenda: Cancelado");
    expect(statusTagOf([{ status: "RESCHEDULED", startsAt: at(24) }], NOW)).toBe("Agenda: Reagendado");
  });

  it("has no tag for a patient without appointments", () => {
    expect(statusTagOf([], NOW)).toBeNull();
  });
});

describe("isCrmSyncedStatus", () => {
  it("is the list of PRD 6: created, confirmed, rescheduled, canceled, attended, no-show", () => {
    expect(["SCHEDULED", "CONFIRMED", "RESCHEDULED", "CANCELED_BY_PATIENT", "CANCELED_BY_PRACTICE", "COMPLETED", "NO_SHOW"].every((status) => isCrmSyncedStatus(status as never))).toBe(true);
    expect(isCrmSyncedStatus("ARRIVED")).toBe(false);
    expect(isCrmSyncedStatus("IN_PROGRESS")).toBe(false);
  });
});

describe("notes", () => {
  it("tells status, type, professional, location and time, in the location's zone", () => {
    const note = statusNote({
      status: "CONFIRMED",
      typeLabel: "Procedimento",
      professionalName: "Dra. Ana Teste",
      locationName: "Unidade Manaus",
      startsAt: new Date("2026-11-20T14:00:00Z"),
      timeZone: "America/Manaus",
    });
    expect(note).toBe("Agenda: Confirmado · Procedimento · Dra. Ana Teste · Unidade Manaus · 20/11/2026 às 10:00");
  });

  it("explains why a command did nothing, so the secretary is not left waiting", () => {
    expect(commandFailureNote("confirm", "no_cadence_message")).toContain("Confirmar na agenda");
    expect(commandFailureNote("confirm", "no_cadence_message")).toContain("nenhuma mensagem de régua");
    expect(commandFailureNote("manual_contact", "appointment_passed")).toContain("já passou");
    expect(commandFailureNote("confirm", "unknown_contact")).toContain("nenhum paciente");
    expect(commandFailureNote("confirm", "not_open")).toContain("agenda");
  });

  it("tells which appointment the manual contact went to", () => {
    expect(manualContactNote({ startsAt: new Date("2026-11-20T14:00:00Z"), timeZone: "America/Fortaleza" })).toBe("Agenda: contato manual registrado no agendamento de 20/11/2026 às 11:00.");
  });
});

describe("parseWebhookEvent", () => {
  it("reads the example of the documentation", () => {
    const event = parseWebhookEvent({
      eventType: "CONTACT_UPDATE",
      date: "2023-08-23T16:42:35.4359934Z",
      content: {
        id: "ed2b52f8-cf13-449b-b3d5-ae27051f4663",
        companyId: "626fb5de-0cc2-4209-b456-47b454ee6e14",
        phonenumber: "+55|85998124455",
        tagsId: [],
        tags: [],
      },
    });
    expect(event).toEqual({
      eventType: "CONTACT_UPDATE",
      date: "2023-08-23T16:42:35.4359934Z",
      contactId: "ed2b52f8-cf13-449b-b3d5-ae27051f4663",
      companyId: "626fb5de-0cc2-4209-b456-47b454ee6e14",
      phone: "+5585998124455",
      tags: [],
    });
  });

  it("reads the body measured in the real test (D-70)", () => {
    const event = parseWebhookEvent({
      eventType: "CONTACT_TAG_UPDATE",
      date: "2026-11-01T19:56:00Z",
      content: { id: "c1", companyId: "company", name: "x", phonenumber: "+55|11999990000", phonenumberFormatted: "(11) 99999-0000", tagsId: ["t1"], tags: ["CONFIRMAR NA AGENDA", "CAMPANHA"], status: "ACTIVE" },
    });
    expect(event).toMatchObject({ contactId: "c1", companyId: "company", phone: "+5511999990000", tags: ["CONFIRMAR NA AGENDA", "CAMPANHA"] });
    expect(commandsIn(event!.tags!)).toEqual(["confirm"]);
  });

  it("reads tags as names or as objects, and says when it could not read them", () => {
    const body = (tags: unknown) => ({ eventType: "CONTACT_TAG_UPDATE", date: "x", content: { id: "c1", tags } });
    expect(parseWebhookEvent(body(["Confirmar na agenda"]))?.tags).toEqual(["Confirmar na agenda"]);
    expect(parseWebhookEvent(body([{ id: "t1", name: "Confirmar na agenda" }]))?.tags).toEqual(["Confirmar na agenda"]);
    expect(parseWebhookEvent(body(undefined))?.tags).toBeNull();
    expect(parseWebhookEvent({ eventType: "CONTACT_TAG_UPDATE", content: { contact: { id: "c2" }, tagNames: ["a"] } })).toMatchObject({ contactId: "c2", tags: ["a"] });
    expect(parseWebhookEvent({ eventType: "CONTACT_TAG_UPDATE", content: { contactId: "c3" } })?.contactId).toBe("c3");
  });

  it("gives up on a body without an event type", () => {
    expect(parseWebhookEvent({ content: {} })).toBeNull();
    expect(parseWebhookEvent({ eventType: 1 })).toBeNull();
  });
});
