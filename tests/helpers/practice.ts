import { practiceContext, type PracticeContext } from "@/lib/auth/access";
import type { AccessRole } from "@/lib/auth/permissions";
import { forPractice, prisma } from "@/lib/db";
import { addMember, addOrganizationAdmin, createPractice, createUser } from "./auth";

// Agenda test data (Block 3): a practice with two locations in different time
// zones, two professionals, a cadence, two types and a patient. Every call
// creates its own rows, so tests never depend on each other or on the seed.

export async function createAgendaFixture(name = "Consultório Agenda") {
  const { organizationId, practiceId } = await createPractice(name);
  const db = forPractice(practiceId);
  const aldeota = await db.location.create({ data: { practiceId, name: "Unidade Aldeota", address: "Av. Teste, 100" } });
  const manaus = await db.location.create({
    data: { practiceId, name: "Unidade Manaus", address: "Rua Teste, 200", timeZone: "America/Manaus" },
  });
  const ana = await db.professional.create({ data: { practiceId, name: "Dra. Ana Teste" } });
  const bruno = await db.professional.create({ data: { practiceId, name: "Dr. Bruno Teste" } });
  await db.professionalLocation.createMany({
    data: [
      { practiceId, professionalId: ana.id, locationId: aldeota.id },
      { practiceId, professionalId: ana.id, locationId: manaus.id },
      { practiceId, professionalId: bruno.id, locationId: aldeota.id },
    ],
  });
  const cadence = await db.cadence.create({
    data: {
      practiceId,
      name: "Consulta padrão",
      steps: {
        create: [
          { position: 1, anchor: "BOOKING", eligibleStatuses: ["SCHEDULED"], action: "REMINDER", template: "Olá" },
          { position: 2, anchor: "APPOINTMENT", offsetMinutes: -1440, fixedTime: "18:00", eligibleStatuses: ["SCHEDULED"], action: "REQUEST_CONFIRMATION", template: "Confirma?" },
        ],
      },
    },
  });
  const consultation = await db.appointmentType.create({
    data: { practiceId, name: "Primeira consulta", category: "CONSULTATION", durationMinutes: 30, defaultPriceCents: 45000, color: "#0F766E", cadenceId: cadence.id },
  });
  const procedure = await db.appointmentType.create({
    data: { practiceId, name: "Escleroterapia", category: "PROCEDURE", durationMinutes: 40, defaultPriceCents: 80000, color: "#D97706", preparation: "Trazer meias" },
  });
  const patient = await db.patient.create({ data: { practiceId, name: "Maria Souza", phone: "+5585998124455" } });
  return {
    organizationId,
    practiceId,
    db,
    locations: { aldeota, manaus },
    professionals: { ana, bruno },
    cadence,
    types: { consultation, procedure },
    patient,
  };
}

export type AgendaFixture = Awaited<ReturnType<typeof createAgendaFixture>>;

/**
 * What the guard hands a page after the access check, for a new user with `role`
 * in the practice. A professional can be linked to a Professional record.
 */
export async function contextAs(
  fixture: { practiceId: string; organizationId: string },
  role: AccessRole,
  options: { professionalId?: string } = {},
): Promise<PracticeContext> {
  const user = await createUser(`agenda-${role.toLowerCase()}`, { password: null });
  if (role === "ORG_ADMIN") await addOrganizationAdmin(user.id, fixture.organizationId);
  else await addMember(user.id, fixture.practiceId, role);
  if (options.professionalId) {
    await forPractice(fixture.practiceId).professional.update({ where: { id: options.professionalId }, data: { userId: user.id } });
  }
  const practice = await prisma.practice.findUniqueOrThrow({ where: { id: fixture.practiceId } });
  return practiceContext(
    { id: user.id, name: user.name, email: user.email },
    { practiceId: practice.id, practiceName: practice.name, organizationId: practice.organizationId, role, requireTwoFactor: false },
  );
}
