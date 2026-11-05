import { agendaTimeZone, loadAgenda, type AppointmentItem, type BlockItem } from "@/lib/agenda/agenda";
import { ownProfessionalIds } from "@/lib/appointments/appointments";
import { nextStatuses } from "@/lib/appointments/status";
import type { PracticeContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { todayIn } from "@/lib/dates/zoned";
import { listGoogleChanges } from "@/lib/google/changes";
import { dayCounts, nextAppointment } from "./rules";

/**
 * The professional's day (PRD 11, D-76): always the signed-in person's own agenda, for
 * whatever role they have in the practice. A manager who attends sees their own day
 * here and the whole practice on the web. The rules of the agenda, of the status table
 * and of the pending Google changes stay in their modules.
 */
export async function loadProfessionalDay(context: PracticeContext, now = new Date()) {
  const [professionalId] = await ownProfessionalIds(context);
  if (!professionalId) return null;
  const timeZone = await agendaTimeZone(context.db);
  const today = todayIn(timeZone, now);
  const agenda = await loadAgenda(context, { view: "dia", date: today, professionalId, category: null, status: null }, now);
  const appointments = agenda.items.filter((item): item is AppointmentItem => item.kind === "appointment");
  const blocks = agenda.items.filter((item): item is BlockItem => item.kind === "block");

  const canResolveGoogle = can(context.access.role, "google-changes:resolve") || can(context.access.role, "google-changes:resolve-own");
  const allChanges = canResolveGoogle ? await listGoogleChanges(context, now) : [];

  const actor = { kind: "user", role: context.access.role, ownsAppointment: true } as const;
  return {
    timeZone,
    today,
    professionalName: agenda.professionals.find((row) => row.id === professionalId)?.name ?? context.user.name,
    appointments: appointments.map((item) => ({ ...item, next: nextStatuses(item.status, actor) })),
    blocks,
    next: nextAppointment(appointments, now)?.id ?? null,
    counts: dayCounts(appointments),
    predictedCents: agenda.totals.predictedCents,
    // A manager resolves everyone's changes on the web; here, only the ones of this agenda.
    googleChanges: allChanges.filter((change) => change.professionalId === professionalId),
    renderedAt: now,
  };
}

export type ProfessionalDay = NonNullable<Awaited<ReturnType<typeof loadProfessionalDay>>>;
