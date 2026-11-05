import "dotenv/config";
import { parseArgs } from "node:util";
import { isIsoDate, isTime, zonedToUtc } from "../src/lib/dates/zoned";
import { prisma } from "../src/lib/db/client";
import { runConnectionSync } from "../src/lib/google/jobs";
import { exportAppointments } from "../src/lib/google/outbound";
import { deleteSandboxEvent, ensureSandboxAccount, moveSandboxEvent, putSandboxEvent, sandboxCalendarsOf, sandboxSubject } from "../src/lib/google/sandbox";

/**
 * Plays the professional's side of the sandbox Google (Block 6, D-58), for
 * development and the end-to-end flows. Times are Fortaleza wall clock.
 *
 *   npm run google:sandbox -- evento --email otavio.lemos@example.com --inicio "2026-11-03 10:00" --fim "2026-11-03 11:00"
 *   npm run google:sandbox -- evento --email ... --dia 2026-11-05 [--ate 2026-11-07] [--livre]
 *   npm run google:sandbox -- mover --agendamento <id> --inicio "..." --fim "..."
 *   npm run google:sandbox -- apagar --agendamento <id>
 *
 * "mover" and "apagar" take the event of an appointment (--agendamento) or any
 * event (--calendario and --evento).
 *   npm run google:sandbox -- listar --email ...
 *   npm run google:sandbox -- sincronizar [--email conta@exemplo.com]
 *
 * "evento" goes to the primary calendar unless --calendario names another one.
 * "sincronizar" does at once what Inngest does on its own: exports the marked
 * appointments and reads every active connection's calendars.
 */

const TIME_ZONE = "America/Fortaleza";

/** The calendar and event of --agendamento (the appointment's event in its secondary calendar), or of --calendario and --evento. */
async function target(values: { agendamento?: string; calendario?: string; evento?: string }) {
  if (values.agendamento) {
    // Base client: a development script, the appointment's practice is not known yet.
    const appointment = await prisma.appointment.findUniqueOrThrow({
      where: { id: values.agendamento },
      select: { googleEventId: true, professional: { select: { secondaryCalendar: { select: { googleCalendarId: true } } } } },
    });
    const calendarId = appointment.professional.secondaryCalendar?.googleCalendarId;
    if (!calendarId || !appointment.googleEventId) throw new Error("O agendamento ainda não está no Google: rode sincronizar");
    return { calendarId, eventId: appointment.googleEventId };
  }
  if (!values.calendario || !values.evento) throw new Error("--agendamento, ou --calendario e --evento");
  return { calendarId: values.calendario, eventId: values.evento };
}

function instant(value: string | undefined, name: string) {
  const [date, time] = (value ?? "").trim().split(/\s+/);
  if (!date || !time || !isIsoDate(date) || !isTime(time)) throw new Error(`--${name} "AAAA-MM-DD HH:MM"`);
  return zonedToUtc(date, time, TIME_ZONE);
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      email: { type: "string" },
      calendario: { type: "string" },
      evento: { type: "string" },
      agendamento: { type: "string" },
      inicio: { type: "string" },
      fim: { type: "string" },
      dia: { type: "string" },
      ate: { type: "string" },
      livre: { type: "boolean" },
      titulo: { type: "string" },
    },
  });
  const [command] = positionals;

  if (command === "evento") {
    if (!values.email) throw new Error("--email da conta Google de teste");
    const { primaryCalendarId } = await ensureSandboxAccount(values.email);
    const calendarId = values.calendario ?? primaryCalendarId;
    const common = { eventId: values.evento, summary: values.titulo, transparency: values.livre ? ("transparent" as const) : ("opaque" as const) };
    const eventId = values.dia
      ? await putSandboxEvent(calendarId, { ...common, date: values.dia, endDate: values.ate ?? undefined })
      : await putSandboxEvent(calendarId, { ...common, start: instant(values.inicio, "inicio"), end: instant(values.fim, "fim") });
    console.info(eventId);
    return;
  }
  if (command === "mover") {
    const { calendarId, eventId } = await target(values);
    await moveSandboxEvent(calendarId, eventId, { start: instant(values.inicio, "inicio"), end: instant(values.fim, "fim") });
    return;
  }
  if (command === "apagar") {
    const { calendarId, eventId } = await target(values);
    await deleteSandboxEvent(calendarId, eventId);
    return;
  }
  if (command === "listar") {
    if (!values.email) throw new Error("--email da conta Google de teste");
    for (const calendar of await sandboxCalendarsOf(sandboxSubject(values.email))) {
      console.info(`${calendar.calendarId} · ${calendar.summary} (${calendar.accessRole})`);
      // Base client: a development script over the sandbox tables.
      const events = await prisma.sandboxGoogleEvent.findMany({ where: { calendarId: calendar.calendarId }, orderBy: [{ startsAt: "asc" }, { startDate: "asc" }] });
      for (const event of events) {
        const when = event.startDate ? `${event.startDate} (dia inteiro)` : `${event.startsAt?.toISOString()} → ${event.endsAt?.toISOString()}`;
        console.info(`  ${event.eventId} · ${when} · ${event.summary ?? ""} · ${event.status}${event.transparency === "transparent" ? " · livre" : ""}`);
      }
    }
    return;
  }
  if (command === "sincronizar") {
    // Base client: like the Inngest functions, the script runs for every practice.
    const practices = await prisma.appointment.groupBy({ by: ["practiceId"], where: { googleSyncRequestedAt: { not: null } } });
    for (const { practiceId } of practices) console.info(`exportação ${practiceId}:`, await exportAppointments(practiceId));
    const connections = await prisma.googleConnection.findMany({
      where: { status: "ACTIVE", ...(values.email ? { email: values.email.trim().toLowerCase() } : {}) },
      select: { id: true, email: true },
    });
    for (const connection of connections) console.info(`leitura ${connection.email}:`, await runConnectionSync(connection.id, { full: true }));
    return;
  }
  throw new Error("Comandos: evento, mover, apagar, listar, sincronizar");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
