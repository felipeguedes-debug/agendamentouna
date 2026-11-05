import { MapPin, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { requirePracticePermission } from "@/lib/auth/guard";
import { listLocations, TIME_ZONES } from "@/lib/locations/locations";
import { cn } from "@/lib/utils";
import { LocationPanel } from "./_unidades/location-panel";
import { PlacesHeader } from "./_unidades/places-header";

export const metadata: Metadata = { title: "Unidades" };

function zoneLabel(value: string) {
  return TIME_ZONES.find((zone) => zone.value === value)?.label ?? value;
}

/** The practice's locations (PRD 11, D-86). The panel's state is in the URL. */
export default async function LocationsPage({ params, searchParams }: PageProps<"/conta/[practiceId]/unidades">) {
  const { practiceId } = await params;
  const context = await requirePracticePermission(practiceId, "practice-settings:edit");
  const locations = await listLocations(context);
  const opened = (await searchParams).unidade;
  const base = `/conta/${practiceId}/unidades`;
  const editing = typeof opened === "string" && opened !== "nova" ? (locations.find((location) => location.id === opened) ?? null) : null;
  if (typeof opened === "string" && opened !== "nova" && !editing) notFound();

  return (
    <div className="flex flex-col gap-4">
      <PlacesHeader practiceId={practiceId} active="unidades">
        <Link href={`${base}?unidade=nova`} scroll={false} className={cn(buttonVariants({ size: "lg" }), "bg-accent text-accent-foreground hover:bg-accent/70")}>
          <Plus aria-hidden />
          Adicionar unidade
        </Link>
      </PlacesHeader>
      <section aria-label="Unidades" className="overflow-hidden rounded-xl border border-border bg-white">
        <ul className="divide-y divide-[#EEF1F0]">
          {locations.map((location) => (
            <li key={location.id} data-testid="location-row" className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 p-4">
              <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent text-accent-foreground">
                <MapPin className="size-[18px]" />
              </span>
              <span className="flex min-w-0 flex-[1_1_360px] flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{location.name}</span>
                  <span className={cn("inline-flex h-[22px] items-center rounded-full px-2.5 text-xs font-semibold", location.active ? "bg-[#E6F4F1] text-[#0F766E]" : "bg-[#EEF1F0] text-[#5B6663]")}>
                    {location.active ? "Ativa" : "Inativa"}
                  </span>
                </span>
                <span className="text-[13px] text-[#3A4542]">{location.address}</span>
                <span className="text-[12.5px] text-muted-foreground">
                  Fuso de {zoneLabel(location.timeZone)}
                  {location.professionals.length > 0 ? ` · ${location.professionals.join(", ")}` : " · Nenhum profissional ainda"}
                </span>
              </span>
              <Link href={`${base}?unidade=${location.id}`} scroll={false} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Editar
              </Link>
            </li>
          ))}
        </ul>
      </section>
      {opened === "nova" ? <LocationPanel practiceId={practiceId} closeHref={base} location={null} timeZones={TIME_ZONES} /> : null}
      {editing ? <LocationPanel practiceId={practiceId} closeHref={base} location={editing} timeZones={TIME_ZONES} /> : null}
    </div>
  );
}
