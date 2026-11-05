"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { NativeSelect } from "@/components/native-select";
import { AUDIT_AREA_LABELS, AUDIT_AREAS, AUDIT_PERIOD_LABELS, AUDIT_PERIODS, type AuditArea, type AuditPeriod } from "@/lib/audit/labels";

/** Period, person and area, kept in the URL. */
export function AuditFilters({
  base,
  period,
  who,
  area,
  people,
}: {
  base: string;
  period: AuditPeriod;
  who: string | null;
  area: AuditArea | null;
  people: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const go = (change: { periodo?: string; quem?: string; area?: string }) => {
    const next = { periodo: period as string, quem: who ?? "", area: area ?? "", ...change };
    const search = new URLSearchParams(Object.entries(next).filter(([, value]) => value));
    startTransition(() => router.push(`${base}?${search}`));
  };

  return (
    <div role="group" aria-label="Filtros" aria-busy={pending} className="flex flex-wrap gap-2.5 border-b border-[#EEF1F0] px-4 py-3.5">
      <NativeSelect aria-label="Período" className="w-[200px]" value={period} onChange={(event) => go({ periodo: event.target.value })}>
        {AUDIT_PERIODS.map((option) => (
          <option key={option} value={option}>
            {AUDIT_PERIOD_LABELS[option]}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Quem" className="w-[200px]" value={who ?? ""} onChange={(event) => go({ quem: event.target.value })}>
        <option value="">Todas as pessoas</option>
        {people.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Área" className="w-[200px]" value={area ?? ""} onChange={(event) => go({ area: event.target.value })}>
        <option value="">Todas as áreas</option>
        {AUDIT_AREAS.map((option) => (
          <option key={option} value={option}>
            {AUDIT_AREA_LABELS[option]}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
