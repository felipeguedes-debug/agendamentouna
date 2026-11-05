import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import { createPatientQuick, getPatientDetail, listPatients, searchPatients, updatePatientPhone } from "./patients";

// Patient search and quick registration in the booking form (D-22, D-45).

let fixture: AgendaFixture;

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Pacientes");
  const { db, practiceId } = fixture;
  await db.patient.createMany({
    data: [
      { practiceId, name: "Sérgio Tavares", phone: "+5585988887777" },
      { practiceId, name: "Marcos Vinícius", phone: "+5585977776666" },
      { practiceId, name: "Paciente excluído", anonymizedAt: new Date() },
    ],
  });
  const sergio = await db.patient.findFirstOrThrow({ where: { name: "Sérgio Tavares" } });
  await db.contactConsent.create({ data: { practiceId, patientId: sergio.id, granted: true, channel: "FORM" } });
  await db.appointment.create({
    data: {
      practiceId,
      locationId: fixture.locations.aldeota.id,
      professionalId: fixture.professionals.ana.id,
      patientId: sergio.id,
      appointmentTypeId: fixture.types.consultation.id,
      startsAt: new Date("2026-08-14T12:00:00Z"),
      endsAt: new Date("2026-08-14T12:30:00Z"),
      durationMinutes: 30,
      priceCents: 45000,
      status: "COMPLETED",
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("searchPatients", () => {
  it("finds by name ignoring accents and case", async () => {
    const secretary = await contextAs(fixture, "SECRETARY");
    const results = await searchPatients(secretary, "sergio");
    expect(results.map((patient) => patient.name)).toEqual(["Sérgio Tavares"]);
    expect(results[0]).toMatchObject({ phone: "(85) 98888-7777", acceptsWhatsapp: true, lastVisitAt: new Date("2026-08-14T12:00:00Z") });
    expect((await searchPatients(secretary, "VINÍ")).map((patient) => patient.name)).toEqual(["Marcos Vinícius"]);
  });

  it("finds by phone digits however they are typed", async () => {
    const secretary = await contextAs(fixture, "SECRETARY");
    expect((await searchPatients(secretary, "(85) 97777-6666")).map((patient) => patient.name)).toEqual(["Marcos Vinícius"]);
    expect((await searchPatients(secretary, "6666")).map((patient) => patient.name)).toEqual(["Marcos Vinícius"]);
  });

  it("leaves out anonymized patients and needs two characters", async () => {
    const secretary = await contextAs(fixture, "SECRETARY");
    expect(await searchPatients(secretary, "excluído")).toEqual([]);
    expect(await searchPatients(secretary, "m")).toEqual([]);
  });

  it("never returns a patient of another practice", async () => {
    const other = await createAgendaFixture("Consultório Pacientes Outro");
    await other.db.patient.create({ data: { practiceId: other.practiceId, name: "Zuleica Isolada", phone: "+5585911112222" } });
    const secretary = await contextAs(fixture, "SECRETARY");
    expect(await searchPatients(secretary, "Zuleica")).toEqual([]);
    expect(await searchPatients(secretary, "11112222")).toEqual([]);
  });

  it("is for those who book: the professional cannot search", async () => {
    const professional = await contextAs(fixture, "PROFESSIONAL", { professionalId: fixture.professionals.ana.id });
    await expect(searchPatients(professional, "Maria")).rejects.toMatchObject({ code: "not_allowed" });
  });
});

describe("createPatientQuick", () => {
  it("creates a patient with a normalized phone, Particular by default, and an audit event", async () => {
    const secretary = await contextAs(fixture, "SECRETARY");
    const patient = await createPatientQuick(secretary, { name: "  Joana Teste ", phone: "(85) 99123-4567", insurance: "" });
    expect(patient).toMatchObject({ name: "Joana Teste", phone: "(85) 99123-4567", insurance: "Particular", acceptsWhatsapp: false });
    const stored = await fixture.db.patient.findUniqueOrThrow({ where: { id: patient.id } });
    expect(stored).toMatchObject({ phone: "+5585991234567", searchName: "joana teste" });
    expect(await fixture.db.auditEvent.findFirst({ where: { entityId: patient.id } })).toMatchObject({
      action: "patient.created",
      changedFields: [],
    });
  });

  it("refuses a phone already registered in the practice and points at that patient", async () => {
    const secretary = await contextAs(fixture, "SECRETARY");
    const error = await createPatientQuick(secretary, { name: "Outra Maria", phone: "85 99812-4455" }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "phone_taken", patient: { id: fixture.patient.id, name: "Maria Souza" } });
  });

  it("validates name and phone", async () => {
    const secretary = await contextAs(fixture, "SECRETARY");
    await expect(createPatientQuick(secretary, { name: " ", phone: "85991234568" })).rejects.toMatchObject({ code: "name_required" });
    await expect(createPatientQuick(secretary, { name: "Sem DDD", phone: "91234568" })).rejects.toMatchObject({ code: "invalid_phone" });
  });

  it("keeps the search name current when the name changes", async () => {
    const patient = await fixture.db.patient.create({ data: { practiceId: fixture.practiceId, name: "Íris Antiga" } });
    await fixture.db.patient.update({ where: { id: patient.id }, data: { name: "Íris Nova" } });
    expect((await fixture.db.patient.findUniqueOrThrow({ where: { id: patient.id } })).searchName).toBe("iris nova");
  });
});

describe("createPatientQuick with consent (D-47)", () => {
  it("records the consent collected at registration, with its channel", async () => {
    const secretary = await contextAs(fixture, "SECRETARY");
    const patient = await createPatientQuick(secretary, { name: "Lia Aceita", phone: "(85) 99123-0001", consentChannel: "WHATSAPP" });
    expect(patient.acceptsWhatsapp).toBe(true);
    expect(await fixture.db.contactConsent.findMany({ where: { patientId: patient.id } })).toMatchObject([
      { granted: true, channel: "WHATSAPP", recordedByUserId: secretary.user.id },
    ]);
  });

  it("records nothing when the consent was not collected, and refuses the import channel", async () => {
    const secretary = await contextAs(fixture, "SECRETARY");
    const patient = await createPatientQuick(secretary, { name: "Leo Sem Registro", phone: "(85) 99123-0002", consentChannel: null });
    expect(await fixture.db.contactConsent.count({ where: { patientId: patient.id } })).toBe(0);
    await expect(
      createPatientQuick(secretary, { name: "Lu Importada", phone: "(85) 99123-0003", consentChannel: "IMPORT" as "PHONE" }),
    ).rejects.toMatchObject({ code: "invalid_channel" });
  });
});

describe("listPatients (Pacientes screen, D-50)", () => {
  let list: AgendaFixture;

  beforeAll(async () => {
    list = await createAgendaFixture("Consultório Lista");
    const { db, practiceId } = list;
    await db.patient.createMany({
      data: Array.from({ length: 60 }, (_, index) => ({
        practiceId,
        name: `Lista ${String(index + 1).padStart(2, "0")}`,
        phone: `+55859700000${String(index + 1).padStart(2, "0")}`,
      })),
    });
    await db.patient.create({ data: { practiceId, name: "Paciente excluído", anonymizedAt: new Date() } });
    const first = await db.patient.findFirstOrThrow({ where: { name: "Lista 01" } });
    await db.contactConsent.create({ data: { practiceId, patientId: first.id, granted: true, channel: "PHONE" } });
    const second = await db.patient.findFirstOrThrow({ where: { name: "Lista 02" } });
    await db.contactConsent.createMany({
      data: [
        { practiceId, patientId: second.id, granted: true, channel: "PHONE", recordedAt: new Date("2026-01-01T12:00:00Z") },
        { practiceId, patientId: second.id, granted: false, channel: "WHATSAPP", recordedAt: new Date("2026-02-01T12:00:00Z") },
      ],
    });
    const appointment = (startsAt: string, status: "COMPLETED" | "SCHEDULED" | "CANCELED_BY_PATIENT") => ({
      practiceId,
      locationId: list.locations.aldeota.id,
      professionalId: list.professionals.bruno.id,
      patientId: first.id,
      appointmentTypeId: list.types.consultation.id,
      startsAt: new Date(startsAt),
      endsAt: new Date(new Date(startsAt).getTime() + 30 * 60_000),
      durationMinutes: 30,
      priceCents: 45000,
      status,
    });
    await db.appointment.createMany({
      data: [
        appointment("2026-03-10T12:00:00Z", "COMPLETED"),
        appointment("2026-11-03T12:00:00Z", "CANCELED_BY_PATIENT"),
        appointment("2026-12-10T12:00:00Z", "SCHEDULED"),
      ],
    });
  });

  it("pages through the practice's patients by name, without the anonymized ones", async () => {
    const secretary = await contextAs(list, "SECRETARY");
    const firstPage = await listPatients(secretary, {});
    expect(firstPage).toMatchObject({ total: 61, page: 1, pages: 2, pageSize: 50 });
    expect(firstPage.items).toHaveLength(50);
    expect(firstPage.items[0].name).toBe("Lista 01");
    const secondPage = await listPatients(secretary, { page: 2 });
    expect(secondPage.items.map((item) => item.name)).toEqual([...Array.from({ length: 10 }, (_, index) => `Lista ${index + 51}`), "Maria Souza"]);
    expect((await listPatients(secretary, { page: 99 })).page).toBe(2);
  });

  it("filters with the same search as the booking form", async () => {
    const secretary = await contextAs(list, "SECRETARY");
    expect((await listPatients(secretary, { term: "lista 0" })).total).toBe(9);
    expect((await listPatients(secretary, { term: "(85) 97000-0060" })).items.map((item) => item.name)).toEqual(["Lista 60"]);
    expect((await listPatients(secretary, { term: "excluido" })).total).toBe(0);
    expect((await listPatients(secretary, { term: "l" })).total).toBe(61);
  });

  it("shows the current consent, the last visit and the next appointment that still holds", async () => {
    const secretary = await contextAs(list, "SECRETARY");
    const { items } = await listPatients(secretary, { term: "lista 0" }, new Date("2026-10-28T12:00:00Z"));
    expect(items[0]).toMatchObject({
      name: "Lista 01",
      phone: "(85) 97000-0001",
      consent: "granted",
      lastVisitAt: new Date("2026-03-10T12:00:00Z"),
      nextAppointmentAt: new Date("2026-12-10T12:00:00Z"),
    });
    expect(items[1]).toMatchObject({ name: "Lista 02", consent: "refused", lastVisitAt: null, nextAppointmentAt: null });
    expect(items[2]).toMatchObject({ consent: "unknown" });
  });

  it("is for the office: the professional sees only their own agenda", async () => {
    const professional = await contextAs(list, "PROFESSIONAL", { professionalId: list.professionals.ana.id });
    await expect(listPatients(professional, {})).rejects.toMatchObject({ code: "not_allowed" });
  });
});

describe("getPatientDetail (PRD 4, rule 7)", () => {
  it("lists every appointment of the patient in the practice, latest first, with the consent log", async () => {
    const detailFixture = await createAgendaFixture("Consultório Detalhe");
    const { db, practiceId, patient } = detailFixture;
    const book = (professionalId: string, locationId: string, startsAt: string) => ({
      practiceId,
      locationId,
      professionalId,
      patientId: patient.id,
      appointmentTypeId: detailFixture.types.consultation.id,
      startsAt: new Date(startsAt),
      endsAt: new Date(new Date(startsAt).getTime() + 30 * 60_000),
      durationMinutes: 30,
      priceCents: 45000,
    });
    await db.appointment.createMany({
      data: [
        book(detailFixture.professionals.ana.id, detailFixture.locations.manaus.id, "2026-05-10T14:00:00Z"),
        book(detailFixture.professionals.bruno.id, detailFixture.locations.aldeota.id, "2026-06-10T12:00:00Z"),
      ],
    });
    await db.contactConsent.create({ data: { practiceId, patientId: patient.id, granted: true, channel: "FORM" } });

    const secretary = await contextAs(detailFixture, "SECRETARY");
    const detail = await getPatientDetail(secretary, patient.id);
    expect(detail).toMatchObject({ id: patient.id, name: "Maria Souza", phone: "(85) 99812-4455", insurance: "Particular", consent: "granted", anonymizedAt: null });
    expect(detail!.appointments.map((row) => [row.professionalName, row.location.timeZone, row.status])).toEqual([
      ["Dr. Bruno Teste", "America/Fortaleza", "SCHEDULED"],
      ["Dra. Ana Teste", "America/Manaus", "SCHEDULED"],
    ]);
    expect(detail!.appointments[0]).toMatchObject({ typeName: "Primeira consulta", priceCents: 45000, cadenceEnabled: true });
    expect(detail!.consentHistory).toHaveLength(1);

    expect(await getPatientDetail(secretary, fixture.patient.id)).toBeNull();
    expect(await getPatientDetail(secretary, "not-a-uuid")).toBeNull();
    const professional = await contextAs(detailFixture, "PROFESSIONAL", { professionalId: detailFixture.professionals.ana.id });
    await expect(getPatientDetail(professional, patient.id)).rejects.toMatchObject({ code: "not_allowed" });
  });
});

describe("updatePatientPhone", () => {
  it("changes the phone, audits only the field name and refuses what is wrong", async () => {
    const fixture = await createAgendaFixture("Consultório Celular");
    const secretary = await contextAs(fixture, "SECRETARY");
    const { patient, db } = fixture;

    await updatePatientPhone(secretary, { patientId: patient.id, phone: "(85) 98888-7777" });
    expect((await db.patient.findUniqueOrThrow({ where: { id: patient.id } })).phone).toBe("+5585988887777");
    const event = await db.auditEvent.findFirstOrThrow({ where: { entityId: patient.id, action: "patient.updated" } });
    expect(event.changedFields).toEqual(["phone"]);
    expect(JSON.stringify(event)).not.toContain("88887777");

    await expect(updatePatientPhone(secretary, { patientId: patient.id, phone: "123" })).rejects.toMatchObject({ code: "invalid_phone" });
    const other = await db.patient.create({ data: { practiceId: fixture.practiceId, name: "Outra", phone: "+5585977776666" } });
    await expect(updatePatientPhone(secretary, { patientId: patient.id, phone: "85 97777-6666" })).rejects.toMatchObject({ code: "phone_taken" });
    await expect(updatePatientPhone(secretary, { patientId: "not-a-uuid", phone: "85 96666-5555" })).rejects.toMatchObject({ code: "patient_unavailable" });

    await db.patient.update({ where: { id: other.id }, data: { anonymizedAt: new Date() } });
    await expect(updatePatientPhone(secretary, { patientId: other.id, phone: "85 96666-5555" })).rejects.toMatchObject({ code: "patient_unavailable" });
  });

  it("is for who books, inside the practice", async () => {
    const fixture = await createAgendaFixture("Consultório Celular Papéis");
    const professional = await contextAs(fixture, "PROFESSIONAL");
    await expect(updatePatientPhone(professional, { patientId: fixture.patient.id, phone: "85 96666-5555" })).rejects.toMatchObject({ code: "not_allowed" });
    const stranger = await createAgendaFixture("Outro Consultório Celular");
    const secretary = await contextAs(stranger, "SECRETARY");
    await expect(updatePatientPhone(secretary, { patientId: fixture.patient.id, phone: "85 96666-5555" })).rejects.toMatchObject({ code: "patient_unavailable" });
  });
});
