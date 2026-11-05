import { hashPassword } from "better-auth/crypto";
import type { AppointmentType } from "../src/generated/prisma/client";
import type {
  AppointmentCategory,
  AppointmentStatus,
  CadenceAnchor,
  CadenceStepAction,
} from "../src/generated/prisma/enums";
import { planCadences } from "../src/lib/cadence/plan";
import { encryptSecret } from "../src/lib/crypto/secrets";
import { prisma } from "../src/lib/db/client";
import { scopeToPractice, type PracticeScopedClient } from "../src/lib/db/practice-scope";
import { appointmentTypeDisplayName } from "../src/lib/domain/labels";
import { LINK_SCOPES } from "../src/lib/google/provider";
import { addSandboxCalendar, ensureSandboxAccount, sandboxRefreshToken } from "../src/lib/google/sandbox";
import { TERMS_VERSION } from "../src/lib/legal/terms";

// Demo data from the mockups (https://claude.ai/artifact/5NFzJMmuTRwhMB5VPeEfmT):
// the operation of remote secretaries with Rebeca Silva in three practices, and the
// Consultório Dr. Otávio with 7 types, 3 cadences and a week of agenda. The week
// is the current one; appointments already past get a final status, except one
// left "sem baixa" on purpose (D-13). All names, emails and phones are fictional.
// `now` decides the week and what already happened, so a test can seed a known one
// (src/lib/indicators/seed.test.ts recalculates its indicators by hand); prisma/seed.ts
// runs it with the current time.

const ORGANIZATION_NAME = "Operação de Secretárias (demo)";
// Token of the demo WhatsAPI instances: the sandbox provider sends nothing, and
// `npm run whatsapi:reply` signs the simulated webhook with it (Block 5).
const SEED_INSTANCE_TOKEN = process.env.TOKEN_ENCRYPTION_KEY ? encryptSecret("seed-dev-instance-token") : "seed:not-a-real-token";
// The "Compromisso Google" of the mockup: an event of Dr. Otávio's sandbox Google (Block 6).
const SEED_GOOGLE_EVENT = "seed-google-event-1";
// Password of every demo user (D-38), for local development only.
const DEMO_PASSWORD = "demo-agenda-2026";
const DEMO_EMAILS = [
  "admin@example.com",
  "rebeca.silva@example.com",
  "lucia.andrade@example.com",
  "otavio.lemos@example.com",
  "marina.castro@example.com",
];
// America/Fortaleza has had no daylight saving time since 2019.
const FORTALEZA_OFFSET = "-03:00";
const DAY_MS = 86_400_000;

type StepSeed = {
  anchor: CadenceAnchor;
  offsetMinutes: number;
  fixedTime?: string;
  eligibleStatuses: AppointmentStatus[];
  action: CadenceStepAction;
  template: string;
};

type TypeSeed = {
  name: string;
  category: AppointmentCategory;
  durationMinutes: number;
  priceCents: number;
  color: string;
  preparation?: string;
  cadence: string;
};

type Outcome = "confirmed" | "scheduled" | "unconfirmed" | "canceled";

/** The patient's answer to the confirmation request. */
const REPLIES: Partial<Record<Outcome, string>> = { confirmed: "1", canceled: "3" };

const MSG_BOOKED =
  "Olá, {primeiro_nome}! Seu horário de {tipo} com {profissional} foi marcado para {data_extenso} às {hora}, na unidade {endereco}. Qualquer dúvida, é só responder por aqui.";
const MSG_CONFIRM_D1 =
  "{primeiro_nome}, amanhã às {hora} é seu {tipo} com {profissional}. Pode confirmar? Responda 1 para confirmar, 2 para remarcar ou 3 para cancelar.";
const MSG_CONFIRM_H3 =
  "{primeiro_nome}, ainda não recebemos sua confirmação para hoje às {hora}. Responda 1 para confirmar ou 3 para liberar o horário.";

const CADENCES: Record<string, StepSeed[]> = {
  "Consulta padrão": [
    { anchor: "BOOKING", offsetMinutes: 0, eligibleStatuses: ["SCHEDULED"], action: "REMINDER", template: MSG_BOOKED },
    { anchor: "APPOINTMENT", offsetMinutes: -1440, fixedTime: "18:00", eligibleStatuses: ["SCHEDULED"], action: "REQUEST_CONFIRMATION", template: MSG_CONFIRM_D1 },
    { anchor: "APPOINTMENT", offsetMinutes: -180, eligibleStatuses: ["SCHEDULED"], action: "REQUEST_CONFIRMATION", template: MSG_CONFIRM_H3 },
  ],
  "Procedimento com preparo": [
    { anchor: "BOOKING", offsetMinutes: 0, eligibleStatuses: ["SCHEDULED"], action: "REMINDER", template: MSG_BOOKED },
    {
      anchor: "APPOINTMENT",
      offsetMinutes: -2880,
      fixedTime: "18:00",
      eligibleStatuses: ["SCHEDULED", "CONFIRMED"],
      action: "REMINDER",
      template: "{primeiro_nome}, seu {tipo} é {data_extenso}. Preparo: {preparo}. Nos vemos lá!",
    },
    { anchor: "APPOINTMENT", offsetMinutes: -1440, fixedTime: "18:00", eligibleStatuses: ["SCHEDULED"], action: "REQUEST_CONFIRMATION", template: MSG_CONFIRM_D1 },
    { anchor: "APPOINTMENT", offsetMinutes: -180, eligibleStatuses: ["SCHEDULED"], action: "REQUEST_CONFIRMATION", template: MSG_CONFIRM_H3 },
  ],
  Exame: [
    {
      anchor: "BOOKING",
      offsetMinutes: 0,
      eligibleStatuses: ["SCHEDULED"],
      action: "REMINDER",
      template:
        "Olá, {primeiro_nome}! Seu {tipo} com {profissional} está marcado para {data_extenso} às {hora}, na unidade {endereco}. Preparo: {preparo}.",
    },
    { anchor: "APPOINTMENT", offsetMinutes: -1440, fixedTime: "18:00", eligibleStatuses: ["SCHEDULED"], action: "REQUEST_CONFIRMATION", template: MSG_CONFIRM_D1 },
  ],
};

const OTAVIO_TYPES: TypeSeed[] = [
  { name: "Primeira consulta", category: "CONSULTATION", durationMinutes: 30, priceCents: 45000, color: "#0F766E", preparation: "Trazer exames anteriores", cadence: "Consulta padrão" },
  { name: "Consulta de avaliação cirúrgica", category: "CONSULTATION", durationMinutes: 45, priceCents: 60000, color: "#0F766E", preparation: "Trazer Doppler recente", cadence: "Consulta padrão" },
  { name: "Retorno", category: "FOLLOW_UP", durationMinutes: 20, priceCents: 0, color: "#3B5BDB", cadence: "Consulta padrão" },
  { name: "Escleroterapia", category: "PROCEDURE", durationMinutes: 40, priceCents: 80000, color: "#D97706", preparation: "Trazer meias de compressão", cadence: "Procedimento com preparo" },
  { name: "Laser transdérmico", category: "PROCEDURE", durationMinutes: 30, priceCents: 120000, color: "#D97706", preparation: "Não se expor ao sol 7 dias antes", cadence: "Procedimento com preparo" },
  { name: "Doppler venoso", category: "EXAM", durationMinutes: 30, priceCents: 35000, color: "#7C3AED", preparation: "Chegar 10 min antes", cadence: "Exame" },
  { name: "Teleconsulta", category: "TELECONSULTATION", durationMinutes: 30, priceCents: 40000, color: "#0F766E", preparation: "Link enviado 15 min antes", cadence: "Consulta padrão" },
];

// The mockup's week. Day 0 = Monday. Mornings at Aldeota, afternoons at Sul.
const OTAVIO_WEEK: [day: number, time: string, patient: string, type: string, outcome: Outcome][] = [
  [0, "08:00", "Maria Souza", "Primeira consulta", "confirmed"],
  [0, "09:00", "João Pedro Alves", "Retorno", "scheduled"],
  [0, "10:00", "Luciana Brito", "Primeira consulta", "canceled"],
  [0, "11:00", "Helena Dias", "Doppler venoso", "scheduled"],
  [0, "14:00", "Tatiane Gomes", "Escleroterapia", "unconfirmed"],
  [1, "08:00", "Carlos Lima", "Escleroterapia", "unconfirmed"],
  [1, "09:00", "Fernanda Castro", "Primeira consulta", "confirmed"],
  [1, "10:00", "Paulo Henrique", "Escleroterapia", "unconfirmed"],
  [1, "14:00", "Diego Martins", "Primeira consulta", "confirmed"],
  [2, "08:00", "Ana Paula Reis", "Primeira consulta", "confirmed"],
  [2, "09:00", "Roberto Nunes", "Doppler venoso", "confirmed"],
  [2, "10:00", "Beatriz Moura", "Primeira consulta", "confirmed"],
  [2, "14:00", "Camila Freitas", "Escleroterapia", "confirmed"],
  [3, "10:00", "Sérgio Tavares", "Retorno", "confirmed"],
  [3, "11:00", "Marcos Vinícius", "Primeira consulta", "confirmed"],
  [4, "14:00", "Eduardo Pires", "Retorno", "scheduled"],
];

const CAMILA_WEEK: typeof OTAVIO_WEEK = [
  [1, "08:30", "Larissa Monteiro", "Primeira consulta", "confirmed"],
  [1, "09:30", "Bruno Teixeira", "Consulta de avaliação cirúrgica", "scheduled"],
  [3, "08:30", "Patrícia Lopes", "Teleconsulta", "confirmed"],
];

// Patients without contact consent stay out of the cadence (PRD 6, rule 1).
const WITHOUT_CONSENT = new Set(["Eduardo Pires"]);

// The booking message that WhatsApp never confirmed delivering (PRD 8, "Entrega de WhatsApp").
const NO_DELIVERY_RECEIPT = "Patrícia Lopes";

export async function seedDemo(now = new Date()) {
  const existing = await prisma.organization.findFirst({ where: { name: ORGANIZATION_NAME } });
  if (existing) {
    // Databases seeded before Block 2 get the demo logins without a reset.
    await ensureDemoLogins();
    // Databases seeded before Block 6 get Dr. Otávio's Google in the sandbox.
    await ensureDemoGoogle(now);
    console.log(`Seed já aplicado ("${ORGANIZATION_NAME}"). Logins de demonstração e Google Agenda de teste conferidos.`);
    return;
  }

  const monday = mondayOfCurrentWeek(now);

  // Cross-practice setup: organization, users and memberships use the base client.
  const organization = await prisma.organization.create({ data: { name: ORGANIZATION_NAME } });
  const [admin, rebeca, lucia, otavio, marina] = await Promise.all(
    [
      ["Admin Demo", "admin@example.com"],
      ["Rebeca Silva", "rebeca.silva@example.com"],
      ["Lúcia Andrade", "lucia.andrade@example.com"],
      ["Otávio Lemos", "otavio.lemos@example.com"],
      ["Marina Castro", "marina.castro@example.com"],
    ].map(([name, email]) => prisma.user.create({ data: { name, email, emailVerified: true } })),
  );
  await ensureDemoLogins();
  await prisma.organizationMember.create({
    data: { organizationId: organization.id, userId: admin.id, role: "ADMIN" },
  });
  // Dr. Otávio's Google is a sandbox account (Block 6, D-58); ensureDemoGoogle fills its calendars.
  const otavioSandbox = await ensureSandboxAccount(otavio.email);
  const otavioGoogle = await prisma.googleConnection.create({
    data: {
      userId: otavio.id,
      googleSubject: otavioSandbox.subject,
      email: otavio.email,
      refreshTokenEncrypted: demoGoogleToken(otavioSandbox.subject),
      scopes: [...LINK_SCOPES],
    },
  });

  const practices = await Promise.all(
    ["Consultório Dr. Otávio", "Clínica Dra. Marina", "Clínica Vida"].map((name) =>
      prisma.practice.create({ data: { organizationId: organization.id, name } }),
    ),
  );
  const [otavioPractice, marinaPractice, vidaPractice] = practices;
  await prisma.membership.createMany({
    data: [
      ...practices.map((practice) => ({ practiceId: practice.id, userId: rebeca.id, role: "SECRETARY" as const })),
      { practiceId: otavioPractice.id, userId: lucia.id, role: "PRACTICE_MANAGER" },
      { practiceId: otavioPractice.id, userId: otavio.id, role: "PROFESSIONAL" },
      { practiceId: marinaPractice.id, userId: marina.id, role: "PROFESSIONAL" },
      { practiceId: vidaPractice.id, userId: otavio.id, role: "PROFESSIONAL" },
    ],
  });

  // ---- Consultório Dr. Otávio ---------------------------------------------
  {
    const practiceId = otavioPractice.id;
    const db = scopeToPractice(prisma, practiceId);
    const aldeota = await db.location.create({
      data: { practiceId, name: "Unidade Aldeota", address: "Av. Exemplo, 1000 – Aldeota, Fortaleza – CE" },
    });
    const sul = await db.location.create({
      data: { practiceId, name: "Unidade Sul", address: "Rua Exemplo, 200 – Messejana, Fortaleza – CE" },
    });
    const drOtavio = await db.professional.create({
      data: { practiceId, name: "Dr. Otávio Lemos", userId: otavio.id, googleConnectionId: otavioGoogle.id },
    });
    const draCamila = await db.professional.create({ data: { practiceId, name: "Dra. Camila Rocha" } });
    await db.professionalLocation.createMany({
      data: [
        { practiceId, professionalId: drOtavio.id, locationId: aldeota.id },
        { practiceId, professionalId: drOtavio.id, locationId: sul.id },
        { practiceId, professionalId: draCamila.id, locationId: aldeota.id },
      ],
    });
    await db.workingHours.createMany({
      data: [
        ...[1, 2, 3, 4, 5].map((weekday) => ({ practiceId, professionalId: drOtavio.id, locationId: aldeota.id, weekday, startTime: "08:00", endTime: "12:00" })),
        ...[1, 2, 3, 4].map((weekday) => ({ practiceId, professionalId: drOtavio.id, locationId: sul.id, weekday, startTime: "14:00", endTime: "18:00" })),
        { practiceId, professionalId: drOtavio.id, locationId: sul.id, weekday: 5, startTime: "14:00", endTime: "17:00" },
        ...[2, 4].map((weekday) => ({ practiceId, professionalId: draCamila.id, locationId: aldeota.id, weekday, startTime: "08:00", endTime: "12:00" })),
      ],
    });
    await db.scheduleException.createMany({
      data: [drOtavio, draCamila].flatMap((professional) => [
        { practiceId, professionalId: professional.id, startsOn: new Date("2026-11-02"), endsOn: new Date("2026-11-02"), reason: "Finados" },
        { practiceId, professionalId: professional.id, startsOn: new Date("2026-11-20"), endsOn: new Date("2026-11-20"), reason: "Dia da Consciência Negra" },
      ]),
    });
    await db.timeBlock.createMany({
      data: [
        { practiceId, professionalId: drOtavio.id, startsAt: at(monday, 3, "08:00"), endsAt: at(monday, 3, "10:00"), source: "GOOGLE", googleCalendarId: otavioSandbox.primaryCalendarId, googleEventId: SEED_GOOGLE_EVENT },
        { practiceId, professionalId: drOtavio.id, startsAt: at(monday, 3, "14:00"), endsAt: at(monday, 3, "18:00"), source: "MANUAL", reason: "Cirurgia", createdByUserId: lucia.id },
      ],
    });
    const otavioInstance = await db.whatsappInstance.create({
      data: { practiceId, professionalId: drOtavio.id, providerInstanceId: "seed-otavio", apiUrl: "https://whatsapi.example/instances/seed-otavio", tokenEncrypted: SEED_INSTANCE_TOKEN, phoneNumber: "+5585900000012", status: "CONNECTED" },
    });
    const camilaInstance = await db.whatsappInstance.create({
      data: { practiceId, professionalId: draCamila.id, providerInstanceId: "seed-camila", apiUrl: "https://whatsapi.example/instances/seed-camila", tokenEncrypted: SEED_INSTANCE_TOKEN, phoneNumber: "+5585900000013", status: "DISCONNECTED", statusChangedAt: new Date(now.getTime() - 3 * 3_600_000) },
    });

    const cadences = await createCadences(db, practiceId);
    const types = await createTypes(db, practiceId, OTAVIO_TYPES, cadences);
    await db.appointmentTypePrice.create({
      data: { practiceId, appointmentTypeId: types.get("Primeira consulta")!.id, professionalId: draCamila.id, priceCents: 40000 },
    });

    const patients = await createPatients(db, practiceId, [...OTAVIO_WEEK, ...CAMILA_WEEK].map(([, , name]) => name), 1000, lucia.id);
    const context = { db, practiceId, now, monday, actorUserId: rebeca.id, types, patients, cadences };
    let keptOneWithoutClosing = false;
    for (const [rows, professional, instance] of [
      [OTAVIO_WEEK, drOtavio, otavioInstance],
      [CAMILA_WEEK, draCamila, camilaInstance],
    ] as const) {
      for (const [day, time, patientName, typeName, outcome] of rows) {
        const location = time < "12:00" ? aldeota : sul;
        const leaveOpen = !keptOneWithoutClosing && outcome === "confirmed" && at(monday, day, time) < now;
        if (leaveOpen) keptOneWithoutClosing = true;
        await createAppointment(context, { day, time, patientName, typeName, outcome, professional, location, instance, leaveOpen });
      }
    }
  }

  // ---- Clínica Dra. Marina ---------------------------------------------------
  {
    const practiceId = marinaPractice.id;
    const db = scopeToPractice(prisma, practiceId);
    const meireles = await db.location.create({
      data: { practiceId, name: "Unidade Meireles", address: "Av. Exemplo, 500 – Meireles, Fortaleza – CE" },
    });
    const draMarina = await db.professional.create({ data: { practiceId, name: "Dra. Marina Castro", userId: marina.id } });
    await db.professionalLocation.create({ data: { practiceId, professionalId: draMarina.id, locationId: meireles.id } });
    await db.workingHours.createMany({
      data: [1, 3, 5].map((weekday) => ({ practiceId, professionalId: draMarina.id, locationId: meireles.id, weekday, startTime: "13:00", endTime: "18:00" })),
    });
    const instance = await db.whatsappInstance.create({
      data: { practiceId, professionalId: draMarina.id, providerInstanceId: "seed-marina", apiUrl: "https://whatsapi.example/instances/seed-marina", tokenEncrypted: SEED_INSTANCE_TOKEN, phoneNumber: "+5585900000021", status: "CONNECTED" },
    });
    const cadences = await createCadences(db, practiceId, ["Consulta padrão", "Procedimento com preparo"]);
    const types = await createTypes(
      db,
      practiceId,
      [
        { name: "Consulta dermatológica", category: "CONSULTATION", durationMinutes: 30, priceCents: 38000, color: "#0F766E", cadence: "Consulta padrão" },
        { name: "Aplicação de toxina botulínica", category: "PROCEDURE", durationMinutes: 45, priceCents: 150000, color: "#DB2777", preparation: "Evitar anti-inflamatórios 3 dias antes", cadence: "Procedimento com preparo" },
      ],
      cadences,
    );
    const week: typeof OTAVIO_WEEK = [
      [0, "13:00", "Juliana Ramos", "Consulta dermatológica", "confirmed"],
      [2, "14:00", "Renata Campos", "Aplicação de toxina botulínica", "scheduled"],
      [4, "15:00", "Vanessa Torres", "Consulta dermatológica", "unconfirmed"],
    ];
    const patients = await createPatients(db, practiceId, week.map(([, , name]) => name), 2000, rebeca.id);
    const context = { db, practiceId, now, monday, actorUserId: rebeca.id, types, patients, cadences };
    for (const [day, time, patientName, typeName, outcome] of week) {
      await createAppointment(context, { day, time, patientName, typeName, outcome, professional: draMarina, location: meireles, instance, leaveOpen: false });
    }
  }

  // ---- Clínica Vida: the same Dr. Otávio, sharing his Google connection (D-04)
  {
    const practiceId = vidaPractice.id;
    const db = scopeToPractice(prisma, practiceId);
    const location = await db.location.create({
      data: { practiceId, name: "Unidade Aldeota", address: "Rua Exemplo, 300 – Aldeota, Fortaleza – CE" },
    });
    const drOtavio = await db.professional.create({
      data: { practiceId, name: "Dr. Otávio Lemos", userId: otavio.id, googleConnectionId: otavioGoogle.id },
    });
    await db.professionalLocation.create({ data: { practiceId, professionalId: drOtavio.id, locationId: location.id } });
    await db.workingHours.create({
      data: { practiceId, professionalId: drOtavio.id, locationId: location.id, weekday: 6, startTime: "08:00", endTime: "12:00" },
    });
    const instance = await db.whatsappInstance.create({
      data: { practiceId, professionalId: drOtavio.id, providerInstanceId: "seed-uro-otavio", apiUrl: "https://whatsapi.example/instances/seed-uro-otavio", tokenEncrypted: SEED_INSTANCE_TOKEN, phoneNumber: "+5585900000031", status: "CONNECTED" },
    });
    const cadences = await createCadences(db, practiceId, ["Consulta padrão"]);
    const types = await createTypes(
      db,
      practiceId,
      [{ name: "Consulta urológica", category: "CONSULTATION", durationMinutes: 30, priceCents: 50000, color: "#0F766E", cadence: "Consulta padrão" }],
      cadences,
    );
    const week: typeof OTAVIO_WEEK = [
      [5, "08:00", "Ricardo Almeida", "Consulta urológica", "confirmed"],
      [5, "09:00", "Gustavo Ferreira", "Consulta urológica", "scheduled"],
    ];
    const patients = await createPatients(db, practiceId, week.map(([, , name]) => name), 3000, rebeca.id);
    const context = { db, practiceId, now, monday, actorUserId: rebeca.id, types, patients, cadences };
    for (const [day, time, patientName, typeName, outcome] of week) {
      await createAppointment(context, { day, time, patientName, typeName, outcome, professional: drOtavio, location, instance, leaveOpen: false });
    }
  }

  await ensureDemoGoogle(now);

  const counts = await Promise.all(
    practices.map(async (practice) => {
      const db = scopeToPractice(prisma, practice.id);
      return `${practice.name}: ${await db.appointmentType.count()} tipos, ${await db.cadence.count()} réguas, ${await db.appointment.count()} agendamentos`;
    }),
  );
  console.log(`Seed aplicado na semana de ${monday}.\n- ${counts.join("\n- ")}`);
}

// ---------------------------------------------------------------------------

type Cadences = Map<string, { id: string; version: number; steps: { id: string; position: number; action: CadenceStepAction; anchor: CadenceAnchor; offsetMinutes: number; fixedTime: string | null; template: string }[] }>;
type Types = Map<string, AppointmentType>;
type Patients = Map<string, { id: string; name: string; consent: boolean }>;
type Context = {
  db: PracticeScopedClient;
  practiceId: string;
  now: Date;
  monday: string;
  actorUserId: string;
  types: Types;
  patients: Patients;
  cadences: Cadences;
};

async function createCadences(db: PracticeScopedClient, practiceId: string, names = Object.keys(CADENCES)): Promise<Cadences> {
  const cadences: Cadences = new Map();
  for (const name of names) {
    const cadence = await db.cadence.create({
      data: {
        practiceId,
        name,
        steps: { create: CADENCES[name].map((step, index) => ({ ...step, position: index + 1 })) },
      },
      include: { steps: { orderBy: { position: "asc" } } },
    });
    cadences.set(name, cadence);
  }
  return cadences;
}

async function createTypes(db: PracticeScopedClient, practiceId: string, seeds: TypeSeed[], cadences: Cadences): Promise<Types> {
  const types: Types = new Map();
  for (const seed of seeds) {
    const type = await db.appointmentType.create({
      data: {
        practiceId,
        name: seed.name,
        category: seed.category,
        durationMinutes: seed.durationMinutes,
        defaultPriceCents: seed.priceCents,
        color: seed.color,
        preparation: seed.preparation,
        cadenceId: cadences.get(seed.cadence)!.id,
      },
    });
    types.set(seed.name, type);
  }
  return types;
}

async function createPatients(db: PracticeScopedClient, practiceId: string, names: string[], phoneBase: number, recordedByUserId: string): Promise<Patients> {
  const patients: Patients = new Map();
  for (const [index, name] of [...new Set(names)].entries()) {
    const consent = !WITHOUT_CONSENT.has(name);
    const patient = await db.patient.create({
      data: {
        practiceId,
        name,
        phone: `+5585900${String(phoneBase + index + 1).padStart(6, "0")}`,
        consents: consent ? { create: { granted: true, channel: "FORM", recordedByUserId } } : undefined,
      },
    });
    patients.set(name, { id: patient.id, name, consent });
  }
  return patients;
}

async function createAppointment(
  context: Context,
  input: {
    day: number;
    time: string;
    patientName: string;
    typeName: string;
    outcome: Outcome;
    professional: { id: string; name: string };
    location: { id: string; address: string };
    instance: { id: string };
    leaveOpen: boolean;
  },
) {
  const { db, practiceId, now, monday, actorUserId } = context;
  const type = context.types.get(input.typeName)!;
  const patient = context.patients.get(input.patientName)!;
  const cadence = [...context.cadences.values()].find((candidate) => candidate.id === type.cadenceId)!;
  const startsAt = at(monday, input.day, input.time);
  const endsAt = new Date(startsAt.getTime() + type.durationMinutes * 60_000);
  const bookedAt = new Date(startsAt.getTime() - 7 * DAY_MS);
  const isPast = startsAt < now;

  // Status path: booked, then the patient's answer, then the visit if it already happened.
  // Nothing is dated in the future: an answer whose request has not gone out yet was
  // given to the secretary instead (manual contact the day after booking).
  const path: { status: AppointmentStatus; source: "USER" | "CADENCE_REPLY"; at: Date }[] = [
    { status: "SCHEDULED", source: "USER", at: bookedAt },
  ];
  const confirmationSteps = cadence.steps.filter((step) => step.action === "REQUEST_CONFIRMATION");
  const confirmationStep = confirmationSteps[0];
  const askedAt = confirmationStep ? stepTime(confirmationStep, bookedAt, startsAt) : bookedAt;
  const answeredAt = new Date(askedAt.getTime() + 20 * 60_000);
  const answeredByReply = answeredAt <= now;
  const answer = answeredByReply
    ? { source: "CADENCE_REPLY" as const, at: answeredAt }
    : { source: "USER" as const, at: new Date(bookedAt.getTime() + DAY_MS) };
  if (input.outcome === "confirmed") path.push({ status: "CONFIRMED", ...answer });
  if (input.outcome === "canceled") path.push({ status: "CANCELED_BY_PATIENT", ...answer });
  if (isPast && !input.leaveOpen && input.outcome !== "canceled") {
    path.push({ status: input.outcome === "unconfirmed" ? "NO_SHOW" : "COMPLETED", source: "USER", at: endsAt });
  }
  // "Sem confirmação" only exists once the last confirmation request went unanswered.
  const lastRequest = confirmationSteps.at(-1);
  const unansweredSince = lastRequest ? stepTime(lastRequest, bookedAt, startsAt) : undefined;
  const flagNoConfirmation = input.outcome === "unconfirmed" && unansweredSince !== undefined && unansweredSince <= now;

  const appointment = await db.appointment.create({
    data: {
      practiceId,
      locationId: input.location.id,
      professionalId: input.professional.id,
      patientId: patient.id,
      appointmentTypeId: type.id,
      startsAt,
      endsAt,
      durationMinutes: type.durationMinutes,
      priceCents: type.defaultPriceCents,
      status: path.at(-1)!.status,
      insurance: "Particular",
      createdByUserId: actorUserId,
      createdAt: bookedAt,
      statusChanges: {
        create: path.map((change, index) => ({
          fromStatus: index === 0 ? null : path[index - 1].status,
          toStatus: change.status,
          source: change.source,
          changedByUserId: change.source === "USER" ? actorUserId : null,
          changedAt: change.at,
        })),
      },
      flags: flagNoConfirmation ? { create: { type: "NO_CONFIRMATION", createdAt: unansweredSince } } : undefined,
    },
  });

  await db.auditEvent.createMany({
    data: path.map((change, index) => ({
      practiceId,
      occurredAt: change.at,
      actorType: change.source === "USER" ? ("USER" as const) : ("PATIENT" as const),
      actorUserId: change.source === "USER" ? actorUserId : null,
      action: index === 0 ? "appointment.created" : "appointment.status_changed",
      entityType: "Appointment",
      entityId: appointment.id,
      changedFields: index === 0 ? [] : ["status"],
    })),
  });

  if (!patient.consent) return;

  // Messages the cadence has already sent, with the patient's answer on the confirmation request.
  const variables = {
    primeiro_nome: patient.name.split(" ")[0],
    profissional: input.professional.name,
    tipo: appointmentTypeDisplayName(type),
    data_extenso: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza", weekday: "long", day: "numeric", month: "long" }).format(startsAt),
    hora: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza", hour: "2-digit", minute: "2-digit" }).format(startsAt),
    endereco: input.location.address,
    preparo: type.preparation ?? "",
    valor: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(type.defaultPriceCents / 100),
  };
  const sentSteps = cadence.steps.filter((step) => {
    const sendAt = stepTime(step, bookedAt, startsAt);
    return sendAt <= now && (step.action === "REMINDER" || step === confirmationStep || input.outcome === "unconfirmed");
  });
  await db.dispatch.createMany({
    data: sentSteps.map((step) => {
      const sendAt = stepTime(step, bookedAt, startsAt);
      const reply = step === confirmationStep && answeredByReply ? REPLIES[input.outcome] : undefined;
      return {
        practiceId,
        appointmentId: appointment.id,
        cadenceStepId: step.id,
        cadenceVersion: cadence.version,
        whatsappInstanceId: input.instance.id,
        scheduledFor: sendAt,
        sentAt: sendAt,
        status: reply ? ("READ" as const) : input.patientName === NO_DELIVERY_RECEIPT && step.anchor === "BOOKING" ? ("SENT" as const) : ("DELIVERED" as const),
        messageText: step.template.replace(/\{(\w+)\}/g, (match, key: string) => variables[key as keyof typeof variables] ?? match),
        replyText: reply ?? null,
        repliedAt: reply ? answeredAt : null,
      };
    }),
  });
  // What the cadence still has to send, planned by the Block 5 engine (window, margin, 4 h).
  await planCadences(db, [appointment.id], { now, onlyAfter: now });
}

/** The sandbox refresh token, encrypted as a real one (D-59); without the key the link shows as revoked. */
function demoGoogleToken(subject: string) {
  return process.env.TOKEN_ENCRYPTION_KEY ? encryptSecret(sandboxRefreshToken(subject)) : "seed:not-a-real-token";
}

/**
 * Dr. Otávio's Google in the sandbox Google (Block 6, D-58): his account with the
 * "Compromisso Google" of the mockup in the primary calendar, a secondary calendar
 * per practice he works in (Consultório Dr. Otávio and Clínica Vida, D-04), and
 * his future appointments marked for export. With `npm run inngest:dev` the
 * export and the 5-minute polling run as in production. Also fixes databases
 * seeded before Block 6, whose Google rows were placeholders.
 */
async function ensureDemoGoogle(now: Date) {
  const email = "otavio.lemos@example.com";
  const { subject, primaryCalendarId } = await ensureSandboxAccount(email);
  const connection = await prisma.googleConnection.findFirst({ where: { email } });
  if (!connection) return;
  if (connection.googleSubject !== subject) {
    await prisma.googleConnection.update({
      where: { id: connection.id },
      data: { googleSubject: subject, refreshTokenEncrypted: demoGoogleToken(subject), scopes: [...LINK_SCOPES], status: "ACTIVE", accessTokenEncrypted: null, accessTokenExpiresAt: null },
    });
  }
  await prisma.googleCalendar.upsert({
    where: { googleConnectionId_googleCalendarId: { googleConnectionId: connection.id, googleCalendarId: primaryCalendarId } },
    create: { googleConnectionId: connection.id, googleCalendarId: primaryCalendarId, summary: email, accessRole: "owner", primary: true },
    update: {},
  });

  const professionals = await prisma.professional.findMany({
    where: { googleConnectionId: connection.id },
    include: { practice: { select: { name: true } }, secondaryCalendar: true },
  });
  for (const professional of professionals) {
    const db = scopeToPractice(prisma, professional.practiceId);
    let calendarId = professional.secondaryCalendar?.googleCalendarId;
    if (calendarId) {
      await prisma.sandboxGoogleCalendar.upsert({
        where: { calendarId },
        create: { accountSubject: subject, calendarId, summary: professional.practice.name },
        update: {},
      });
    } else {
      calendarId = await addSandboxCalendar(subject, { summary: professional.practice.name });
      await db.googleSecondaryCalendar.create({ data: { practiceId: professional.practiceId, professionalId: professional.id, googleConnectionId: connection.id, googleCalendarId: calendarId } });
    }
    await prisma.googleCalendar.upsert({
      where: { googleConnectionId_googleCalendarId: { googleConnectionId: connection.id, googleCalendarId: calendarId } },
      create: { googleConnectionId: connection.id, googleCalendarId: calendarId, summary: professional.practice.name, accessRole: "owner" },
      update: {},
    });
    await db.appointment.updateMany({
      where: { professionalId: professional.id, googleEventId: null, googleSyncRequestedAt: null, endsAt: { gt: now }, status: { in: ["SCHEDULED", "CONFIRMED"] } },
      data: { googleSyncRequestedAt: now },
    });
    // The mockup's Google commitment lives in his primary calendar.
    const block = await db.timeBlock.findFirst({ where: { professionalId: professional.id, source: "GOOGLE", googleEventId: SEED_GOOGLE_EVENT } });
    if (block) {
      await db.timeBlock.update({ where: { id: block.id }, data: { googleCalendarId: primaryCalendarId, reason: null } });
      await prisma.sandboxGoogleEvent.upsert({
        where: { calendarId_eventId: { calendarId: primaryCalendarId, eventId: SEED_GOOGLE_EVENT } },
        create: { calendarId: primaryCalendarId, eventId: SEED_GOOGLE_EVENT, summary: "Reunião no hospital", startsAt: block.startsAt, endsAt: block.endsAt },
        update: {},
      });
    }
  }
}

/** Password login and accepted terms for the demo users, as an accepted invitation leaves them. */
async function ensureDemoLogins() {
  const password = await hashPassword(DEMO_PASSWORD);
  await prisma.user.updateMany({
    where: { email: { in: DEMO_EMAILS }, termsAcceptedAt: null },
    data: { termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION },
  });
  const users = await prisma.user.findMany({ where: { email: { in: DEMO_EMAILS } }, select: { id: true } });
  for (const user of users) {
    await prisma.account.upsert({
      where: { providerId_accountId: { providerId: "credential", accountId: user.id } },
      create: { userId: user.id, providerId: "credential", accountId: user.id, password },
      update: {},
    });
  }
}

/** When a cadence step fires, ignoring the send window (the Block 5 engine applies it). */
function stepTime(step: { anchor: CadenceAnchor; offsetMinutes: number; fixedTime: string | null }, bookedAt: Date, startsAt: Date) {
  if (step.anchor === "BOOKING") return bookedAt;
  const moment = new Date(startsAt.getTime() + step.offsetMinutes * 60_000);
  if (!step.fixedTime) return moment;
  const localDate = new Date(moment.getTime() + offsetMs()).toISOString().slice(0, 10);
  return new Date(`${localDate}T${step.fixedTime}:00${FORTALEZA_OFFSET}`);
}

/** Monday of the current week in Fortaleza, as YYYY-MM-DD. */
function mondayOfCurrentWeek(now: Date) {
  const local = new Date(now.getTime() + offsetMs());
  const weekday = local.getUTCDay();
  const monday = new Date(local.getTime() - ((weekday + 6) % 7) * DAY_MS);
  return monday.toISOString().slice(0, 10);
}

/** A Fortaleza wall-clock time on day `dayIndex` (0 = Monday) of the week starting at `mondayIso`. */
function at(mondayIso: string, dayIndex: number, time: string) {
  const date = new Date(new Date(`${mondayIso}T00:00:00Z`).getTime() + dayIndex * DAY_MS).toISOString().slice(0, 10);
  return new Date(`${date}T${time}:00${FORTALEZA_OFFSET}`);
}

function offsetMs() {
  return -3 * 3_600_000;
}
