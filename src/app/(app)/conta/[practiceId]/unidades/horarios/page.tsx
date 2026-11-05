import type { Metadata } from "next";
import { requirePracticePermission } from "@/lib/auth/guard";
import { exceptionPeriodLabel, listLocations, loadProfessionalHours } from "@/lib/locations/locations";
import { ExceptionsCard } from "../_unidades/exceptions-card";
import { HoursEditor, ProfessionalPicker } from "../_unidades/hours-editor";
import { PlacesHeader } from "../_unidades/places-header";

export const metadata: Metadata = { title: "Horários e exceções" };

/** One professional's week and days off (PRD 4, rule 1; D-86). The professional is in the URL. */
export default async function HoursPage({ params, searchParams }: PageProps<"/conta/[practiceId]/unidades/horarios">) {
  const { practiceId } = await params;
  const context = await requirePracticePermission(practiceId, "practice-settings:edit");
  const requested = (await searchParams).profissional;
  const [professionals, locations] = await Promise.all([
    context.db.professional.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    listLocations(context),
  ]);
  const selected = professionals.find((professional) => professional.id === requested) ?? professionals[0];
  const { hours, exceptions } = selected ? await loadProfessionalHours(context, selected.id) : { hours: [], exceptions: [] };
  const active = locations.filter((location) => location.active).map((location) => ({ id: location.id, name: location.name }));

  return (
    <div className="flex flex-col gap-4">
      <PlacesHeader practiceId={practiceId} active="horarios">
        {selected ? <ProfessionalPicker base={`/conta/${practiceId}/unidades/horarios`} selectedId={selected.id} professionals={professionals} /> : null}
      </PlacesHeader>
      {selected ? (
        <div className="flex flex-wrap items-start gap-4">
          <HoursEditor key={selected.id} practiceId={practiceId} professionalId={selected.id} hours={hours} locations={active} />
          <ExceptionsCard
            key={`exceptions-${selected.id}`}
            practiceId={practiceId}
            professionalId={selected.id}
            locations={active}
            exceptions={exceptions.map((row) => ({ id: row.id, period: exceptionPeriodLabel(row), reason: row.reason, locationName: row.locationName }))}
          />
        </div>
      ) : (
        <p className="rounded-xl border border-border bg-white px-4 py-8 text-center text-sm text-muted-foreground">Nenhum profissional ativo nesta conta.</p>
      )}
    </div>
  );
}
