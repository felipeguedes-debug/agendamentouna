import "dotenv/config";
import { performance } from "node:perf_hooks";
import { resetTestDatabase } from "../tests/reset-test-database";

/**
 * Patient search with 50,000 patients per practice (PRD 7, Desempenho: under
 * 500 ms; D-50). Rebuilds the test database, fills two practices, so the index
 * has to tell them apart, and times the booking form's search and the Pacientes
 * list through the practice-scoped client, as the screens call them.
 *
 * Run with `npm run bench:search`. It uses agenda_test: never together with
 * `npm test` or `npm run test:e2e`.
 */

const PATIENTS_PER_PRACTICE = 50_000;
const APPOINTMENTS_PER_PRACTICE = 20_000;
const CONSENTS_PER_PRACTICE = 30_000;
const RUNS = 30;
const CHUNK = 5_000;

const FIRST = ["Maria", "José", "Ana", "João", "Antônio", "Francisca", "Carlos", "Paulo", "Lúcia", "Pedro", "Sérgio", "Luíza", "Márcia", "Raimundo", "Débora", "Fábio", "Cícero", "Inês", "Otávio", "Bárbara", "Rebeca", "Camila", "Thiago", "Letícia", "Vinícius", "Cláudia", "Rogério", "Patrícia", "Júlio", "Helena"];
const LAST = ["Silva", "Souza", "Oliveira", "Santos", "Pereira", "Lima", "Carvalho", "Ferreira", "Rodrigues", "Almeida", "Araújo", "Gonçalves", "Conceição", "Simões", "Magalhães", "Brandão", "Assunção", "Façanha", "Holanda", "Gurgel", "Barreto", "Pinheiro", "Monteiro", "Teixeira", "Sampaio", "Bezerra", "Queiroz", "Mendonça", "Leitão", "Damasceno"];

function nameOf(index: number) {
  const first = FIRST[index % FIRST.length];
  const middle = LAST[Math.floor(index / FIRST.length) % LAST.length];
  const last = LAST[Math.floor(index / (FIRST.length * LAST.length)) % LAST.length];
  return `${first} ${middle} ${last}`;
}

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { p50: at(0.5), p95: at(0.95), max: sorted.at(-1)! };
}

async function main() {
  process.env.DATABASE_URL = await resetTestDatabase();
  // Imported only now, so the client connects to the test database.
  const { prisma, forPractice } = await import("../src/lib/db");
  const { practiceContext } = await import("../src/lib/auth/access");
  const { listPatients, searchPatients } = await import("../src/lib/patients/patients");

  try {
    const contexts = [];
    for (const [practiceIndex, label] of ["Bench A", "Bench B"].entries()) {
      const organization = await prisma.organization.create({ data: { name: `Org ${label}` } });
      const practice = await prisma.practice.create({ data: { organizationId: organization.id, name: label } });
      const practiceId = practice.id;
      const db = forPractice(practiceId);
      const location = await db.location.create({ data: { practiceId, name: "Unidade", address: "Rua Bench, 1" } });
      const professional = await db.professional.create({ data: { practiceId, name: "Dra. Bench" } });
      const type = await db.appointmentType.create({
        data: { practiceId, name: "Consulta", category: "CONSULTATION", durationMinutes: 30, defaultPriceCents: 45000, color: "#0F766E" },
      });

      // Bulk rows through the base client, like the seed: the bench owns this database.
      const started = performance.now();
      for (let start = 0; start < PATIENTS_PER_PRACTICE; start += CHUNK) {
        await prisma.patient.createMany({
          data: Array.from({ length: Math.min(CHUNK, PATIENTS_PER_PRACTICE - start) }, (_, offset) => {
            const index = start + offset;
            return { practiceId, name: nameOf(index), phone: `+55${practiceIndex === 0 ? "85" : "88"}9${String(index).padStart(8, "0")}` };
          }),
        });
      }
      const ids = (await prisma.patient.findMany({ where: { practiceId }, select: { id: true }, orderBy: { id: "asc" } })).map((row) => row.id);
      for (let start = 0; start < APPOINTMENTS_PER_PRACTICE; start += CHUNK) {
        await prisma.appointment.createMany({
          data: Array.from({ length: Math.min(CHUNK, APPOINTMENTS_PER_PRACTICE - start) }, (_, offset) => {
            const index = start + offset;
            const startsAt = new Date(Date.UTC(2025, 0, 1, 11) + index * 30 * 60_000);
            return {
              practiceId,
              locationId: location.id,
              professionalId: professional.id,
              patientId: ids[(index * 7) % ids.length],
              appointmentTypeId: type.id,
              startsAt,
              endsAt: new Date(startsAt.getTime() + 30 * 60_000),
              durationMinutes: 30,
              priceCents: 45000,
              status: index % 5 === 0 ? ("SCHEDULED" as const) : ("COMPLETED" as const),
            };
          }),
        });
      }
      for (let start = 0; start < CONSENTS_PER_PRACTICE; start += CHUNK) {
        await prisma.contactConsent.createMany({
          data: Array.from({ length: Math.min(CHUNK, CONSENTS_PER_PRACTICE - start) }, (_, offset) => ({
            practiceId,
            patientId: ids[start + offset],
            granted: (start + offset) % 4 !== 0,
            channel: "IMPORT" as const,
          })),
        });
      }
      console.log(`${label}: ${PATIENTS_PER_PRACTICE} patients, ${APPOINTMENTS_PER_PRACTICE} appointments and ${CONSENTS_PER_PRACTICE} consents in ${Math.round(performance.now() - started)} ms`);

      const user = await prisma.user.create({ data: { name: `Secretária ${label}`, email: `bench-${practiceIndex}@example.com` } });
      await prisma.membership.create({ data: { practiceId, userId: user.id, role: "SECRETARY" } });
      contexts.push(
        practiceContext(
          { id: user.id, name: user.name, email: user.email },
          { practiceId, practiceName: label, organizationId: organization.id, role: "SECRETARY", requireTwoFactor: false },
        ),
      );
    }
    await prisma.$executeRawUnsafe("ANALYZE");

    const context = contexts[0];
    const cases: [string, () => Promise<unknown>][] = [
      ['search "maria" (common name)', () => searchPatients(context, "maria")],
      ['search "sergio" (accent-insensitive)', () => searchPatients(context, "sergio")],
      ['search "facanha holanda" (rare pair)', () => searchPatients(context, "facanha holanda")],
      ['search "zzq" (no match: full scan)', () => searchPatients(context, "zzq")],
      ['search "an" (2 letters)', () => searchPatients(context, "an")],
      ['search "4455" (phone digits)', () => searchPatients(context, "4455")],
      ["list page 1, no term", () => listPatients(context, {})],
      ["list last page (1000), no term", () => listPatients(context, { page: 1000 })],
      ['list "silva", page 1', () => listPatients(context, { term: "silva" })],
      ['list "zzq" (no match)', () => listPatients(context, { term: "zzq" })],
    ];

    console.log(`\n${RUNS} runs each (after 3 warm-up runs), in ms:`);
    for (const [label, run] of cases) {
      for (let warm = 0; warm < 3; warm += 1) await run();
      const samples: number[] = [];
      for (let attempt = 0; attempt < RUNS; attempt += 1) {
        const started = performance.now();
        await run();
        samples.push(performance.now() - started);
      }
      const { p50, p95, max } = stats(samples);
      console.log(`${label.padEnd(40)} p50 ${p50.toFixed(1).padStart(6)}  p95 ${p95.toFixed(1).padStart(6)}  max ${max.toFixed(1).padStart(6)}`);
    }

    // The plan of the search query, for the record in D-50. With two practices the
    // table is small enough for a sequential scan; with many practices the planner
    // takes the (practiceId, ...) index, and the second plan shows that path.
    const explain = `EXPLAIN ANALYZE SELECT id, name, phone, insurance FROM "Patient"
       WHERE "practiceId" = $1::uuid AND "anonymizedAt" IS NULL AND ("searchName" LIKE '%' || $2 || '%' OR phone LIKE '%' || $3 || '%')
       ORDER BY name ASC LIMIT 8`;
    const practiceId = context.access.practiceId;
    const print = (title: string, rows: { "QUERY PLAN": string }[]) => console.log(`\n${title}:\n${rows.map((row) => row["QUERY PLAN"]).join("\n")}`);
    print("EXPLAIN ANALYZE (no match, the worst case)", await prisma.$queryRawUnsafe(explain, practiceId, "zzq", "zzq"));
    const [, indexed] = await prisma.$transaction([
      prisma.$executeRawUnsafe("SET LOCAL enable_seqscan = off"),
      prisma.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(explain, practiceId, "zzq", "zzq"),
    ]);
    print("EXPLAIN ANALYZE through the practice index (sequential scan off)", indexed);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
