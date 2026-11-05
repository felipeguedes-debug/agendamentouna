import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPracticeAccess, practiceContext } from "@/lib/auth/access";
import { loadAgenda } from "@/lib/agenda/agenda";
import { prisma } from "@/lib/db";
import { seedDemo } from "../../../prisma/seed-demo";
import { loadIndicators, loadOrganizationIndicators } from "./indicators";

// Block 8's "indicadores batem com o seed". The demo is seeded on a known Sunday, so the
// whole week is past. Every expected number was counted by hand from OTAVIO_WEEK and
// CAMILA_WEEK in prisma/seed-demo.ts, as noted beside it; nothing here calls the rules.
//
// Consultório Dr. Otávio, 19 appointments, Monday 19/10 to Friday 23/10:
//   Faltou (3): Tatiane, Carlos, Paulo (the "unconfirmed" ones), all Escleroterapia.
//   Sem baixa (1): Maria, the first "confirmed", left open on purpose.
//   Cancelado (1): Luciana.
//   Atendido (14): the other 11 of Dr. Otávio and the 3 of Dra. Camila.

const NOW = new Date("2026-10-25T23:00:00-03:00");
const WEEK = { start: "2026-10-19", endExclusive: "2026-10-26" };
const THIRTY_DAYS = { start: "2026-09-26", endExclusive: "2026-10-26" };

async function contextOf(email: string, practiceName: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true, name: true, email: true } });
  const practice = await prisma.practice.findFirstOrThrow({ where: { name: practiceName }, select: { id: true } });
  const access = await getPracticeAccess(user.id, practice.id);
  if (!access) throw new Error(`${email} has no access to ${practiceName}`);
  return practiceContext(user, access);
}

beforeAll(async () => {
  await seedDemo(NOW);
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("indicators of the seeded demo, counted by hand", () => {
  it("taxa de falta: 3 ÷ (14 + 3), Sem baixa apart", async () => {
    const { noShow } = await loadIndicators(await contextOf("lucia.andrade@example.com", "Consultório Dr. Otávio"), WEEK, NOW);
    expect(noShow).toMatchObject({ completed: 14, noShow: 3, withoutClosing: 1 });
    expect(noShow.rate.value).toBeCloseTo(3 / 17);
  });

  it("taxa de falta por tipo", async () => {
    const { noShowByType } = await loadIndicators(await contextOf("lucia.andrade@example.com", "Consultório Dr. Otávio"), WEEK, NOW);
    expect(noShowByType.map((row) => [row.typeName, row.completed, row.noShow, row.withoutClosing])).toEqual([
      ["Escleroterapia", 1, 3, 0], // Camila Freitas atendida; Tatiane, Carlos e Paulo faltaram
      ["Consulta de avaliação cirúrgica", 1, 0, 0], // Bruno
      ["Doppler venoso", 2, 0, 0], // Helena, Roberto
      ["Primeira consulta", 6, 0, 1], // Fernanda, Diego, Ana, Beatriz, Marcos, Larissa; Maria sem baixa; Luciana cancelada
      ["Retorno", 3, 0, 0], // João, Sérgio, Eduardo
      ["Teleconsulta", 1, 0, 0], // Patrícia
    ]);
  });

  it("confirmação automática: 11 ÷ 18", async () => {
    const { autoConfirmation } = await loadIndicators(await contextOf("lucia.andrade@example.com", "Consultório Dr. Otávio"), WEEK, NOW);
    // 11 answered "1": Maria, Fernanda, Diego, Ana, Roberto, Beatriz, Camila Freitas, Sérgio,
    // Marcos, Larissa, Patrícia. Of the 19, only Eduardo (no consent) was never asked.
    expect(autoConfirmation).toMatchObject({ numerator: 11, denominator: 18 });
  });

  it("valor realizado ÷ previsto: R$ 5.200 ÷ R$ 8.050, the same as the agenda panel", async () => {
    const context = await contextOf("lucia.andrade@example.com", "Consultório Dr. Otávio");
    const { realization } = await loadIndicators(context, WEEK, NOW);
    // Previsto, without Luciana: 450 + 0 + 350 + 800 (Tatiane) + 800 (Carlos) + 450 + 800 (Paulo) +
    // 450 + 450 + 350 + 450 + 800 + 0 + 450 + 0 + 450 + 600 + 400 = 8.050.
    // Realizado, without the 3 who missed and Maria: 8.050 - 800 - 800 - 800 - 450 = 5.200.
    expect(realization).toMatchObject({ predictedCents: 805000, realizedCents: 520000, withoutClosingCents: 45000 });

    const agenda = await loadAgenda(context, { view: "semana", date: "2026-10-21", professionalId: null, category: null, status: null }, NOW);
    expect(agenda.totals).toMatchObject({ predictedCents: 805000, realizedCents: 520000 });
  });

  it("ocupação: 340 de 1.980 min e 105 de 480 min", async () => {
    const { occupancy } = await loadIndicators(await contextOf("lucia.andrade@example.com", "Consultório Dr. Otávio"), WEEK, NOW);
    // Dr. Otávio: 5 x 4 h (Aldeota) + 4 x 4 h + 3 h (Sul) = 39 h = 2.340 min, minus Thursday's
    // blocks (2 h Google + 4 h cirurgia) = 1.980 min. Occupied, without Luciana and the 3 who missed:
    // 30 + 20 + 30 + 30 + 30 + 30 + 30 + 30 + 40 + 20 + 30 + 20 = 340 min.
    // Dra. Camila: 2 x 4 h = 480 min; occupied 30 + 45 + 30 = 105 min.
    expect(occupancy.byProfessional.map((row) => [row.name, row.occupiedMinutes, row.availableMinutes])).toEqual([
      ["Dr. Otávio Lemos", 340, 1980],
      ["Dra. Camila Rocha", 105, 480],
    ]);
    expect(occupancy.total).toMatchObject({ occupiedMinutes: 445, availableMinutes: 2460 });
  });

  it("cobertura de Google: 1 ÷ 2", async () => {
    const { googleCoverage } = await loadIndicators(await contextOf("lucia.andrade@example.com", "Consultório Dr. Otávio"), WEEK, NOW);
    expect(googleCoverage).toMatchObject({ numerator: 1, denominator: 2, value: 0.5 });
  });

  it("entrega de WhatsApp: 42 ÷ 43", async () => {
    const { delivery } = await loadIndicators(await contextOf("lucia.andrade@example.com", "Consultório Dr. Otávio"), THIRTY_DAYS, NOW);
    // Messages sent, by appointment (the "unconfirmed" also got the 3 h request):
    // Maria 2, João 2, Luciana 2, Helena 2, Tatiane 4, Carlos 4, Fernanda 2, Paulo 4, Diego 2, Ana 2,
    // Roberto 2, Beatriz 2, Camila Freitas 3, Sérgio 2, Marcos 2, Eduardo 0 = 37; Larissa 2, Bruno 2,
    // Patrícia 2 = 6. Total 43, and Patrícia's booking message has no delivery receipt.
    expect(delivery.rate).toMatchObject({ numerator: 42, denominator: 43 });
    expect(delivery.neverSent).toBe(0);
  });

  it("what the seed never measured has no number", async () => {
    const indicators = await loadIndicators(await contextOf("lucia.andrade@example.com", "Consultório Dr. Otávio"), WEEK, NOW);
    // Everything is past, so nothing was exported to Google.
    expect(indicators.syncFailures.value).toBeNull();
    // Nobody worked the "Sem confirmação" list while being measured (D-75).
    expect(indicators.confirmationWork).toMatchObject({ minutesPerDay: null, measuredDays: 0 });
    expect(indicators.confirmationWork.manualContacts).toBe(0);
  });

  it("adoção da conta: 5 dias de uso na semana de 12 a 18/10", async () => {
    const { adoption } = await loadIndicators(await contextOf("lucia.andrade@example.com", "Consultório Dr. Otávio"), WEEK, NOW);
    // The secretary booked each appointment 7 days before it, Monday to Friday of that week.
    expect(adoption).toMatchObject({ week: { start: "2026-10-12", endExclusive: "2026-10-19" }, days: 5 });
  });

  it("consolidado da organização: 1 ÷ 3 contas adotaram, com a falta de cada uma", async () => {
    const result = await loadOrganizationIndicators(await contextOf("admin@example.com", "Consultório Dr. Otávio"), WEEK, NOW);
    // Clínica Dra. Marina: booked on Monday, Wednesday and Friday; Vanessa missed, Juliana and
    // Renata came. Clínica Vida: both booked on Saturday and both came.
    expect(result.practices.map((row) => [row.name, row.days, row.noShow.completed, row.noShow.noShow])).toEqual([
      ["Clínica Dra. Marina", 3, 2, 1],
      ["Clínica Vida", 1, 2, 0],
      ["Consultório Dr. Otávio", 5, 14, 3],
    ]);
    expect(result.adoption).toMatchObject({ numerator: 1, denominator: 3 });
  });
});
