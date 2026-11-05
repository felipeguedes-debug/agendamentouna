import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { parseAppointmentTab } from "@/lib/agenda/params";
import { requirePracticePermission } from "@/lib/auth/guard";
import { toZoned } from "@/lib/dates/zoned";
import { AppointmentHeading, AppointmentTabContent, loadAppointmentView } from "../../_agenda/appointment-detail";

export const metadata: Metadata = { title: "Agendamento" };

/**
 * One appointment as a page, for what links from outside the agenda: Pendências, the
 * patient's record, Google's event and the push notice. The agenda opens the same
 * content in a panel (D-83).
 */
export default async function AppointmentPage({ params, searchParams }: PageProps<"/conta/[practiceId]/agendamentos/[appointmentId]">) {
  const { practiceId, appointmentId } = await params;
  const context = await requirePracticePermission(practiceId, ["agenda:view", "agenda:view-own"]);
  const view = await loadAppointmentView(context, appointmentId);
  if (!view) notFound();
  const tab = parseAppointmentTab((await searchParams).aba);
  const base = `/conta/${practiceId}/agendamentos/${appointmentId}`;
  const date = toZoned(view.appointment.startsAt, view.appointment.location.timeZone).date;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href={`/conta/${practiceId}?data=${date}`} className="text-sm font-medium text-primary hover:underline">
        ← Agenda
      </Link>
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <AppointmentHeading
          practiceId={practiceId}
          view={view}
          role={context.access.role}
          tab={tab}
          tabHref={(option) => (option === "resumo" ? base : `${base}?aba=${option}`)}
          inPanel={false}
        />
        <div className="flex flex-col gap-4 px-5 py-4">
          <AppointmentTabContent practiceId={practiceId} view={view} role={context.access.role} tab={tab} />
        </div>
      </div>
    </div>
  );
}
