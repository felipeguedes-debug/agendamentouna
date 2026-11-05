import type { Metadata } from "next";
import { agendaTimeZone } from "@/lib/agenda/agenda";
import { requirePracticePermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { isIsoDate, isTime, todayIn } from "@/lib/dates/zoned";
import { describeCadenceStep } from "@/lib/domain/cadence";
import { appointmentTypeDisplayName } from "@/lib/domain/labels";
import { patientOption } from "@/lib/patients/patients";
import { NewAppointmentForm } from "./new-appointment-form";

export const metadata: Metadata = { title: "Novo agendamento" };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** "Novo agendamento" (PRD 4, mockup NovoAgendamento). Only those who book open it. */
export default async function NewAppointmentPage({ params, searchParams }: PageProps<"/conta/[practiceId]/agendamentos/novo">) {
  const { practiceId } = await params;
  const context = await requirePracticePermission(practiceId, "appointments:manage");
  const { access, db } = context;
  const query = await searchParams;
  const [timeZone, professionals, types] = await Promise.all([
    agendaTimeZone(db),
    db.professional.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        locations: { where: { location: { active: true } }, select: { location: { select: { id: true, name: true } } }, orderBy: { location: { name: "asc" } } },
        secondaryCalendar: { select: { id: true } },
      },
    }),
    db.appointmentType.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      include: {
        prices: { select: { professionalId: true, priceCents: true } },
        cadence: { select: { name: true, steps: { orderBy: { position: "asc" } } } },
      },
    }),
  ]);

  const date = first(query.data);
  const time = first(query.hora);
  const professionalId = first(query.profissional);
  const patientId = first(query.paciente);
  const patient = patientId ? await patientOption(context, patientId) : null;

  return (
    <NewAppointmentForm
      practiceId={practiceId}
      practiceName={access.practiceName}
      canEditPrice={can(access.role, "appointments:edit-price")}
      canOverbook={can(access.role, "appointments:overbook")}
      defaults={{
        date: date && isIsoDate(date) ? date : todayIn(timeZone),
        time: time && isTime(time) ? time : "",
        professionalId: professionals.some((professional) => professional.id === professionalId) ? professionalId! : (professionals[0]?.id ?? ""),
        patient,
      }}
      professionals={professionals.map((professional) => ({
        id: professional.id,
        name: professional.name,
        locations: professional.locations.map((row) => row.location),
        googleCalendar: Boolean(professional.secondaryCalendar),
      }))}
      types={types.map((type) => ({
        id: type.id,
        name: type.name,
        category: type.category,
        displayLabel: appointmentTypeDisplayName(type),
        color: type.color,
        durationMinutes: type.durationMinutes,
        defaultPriceCents: type.defaultPriceCents,
        prices: Object.fromEntries(type.prices.map((price) => [price.professionalId, price.priceCents])),
        cadenceName: type.cadence?.name ?? null,
        cadenceSteps: type.cadence?.steps.map(describeCadenceStep) ?? [],
      }))}
    />
  );
}
