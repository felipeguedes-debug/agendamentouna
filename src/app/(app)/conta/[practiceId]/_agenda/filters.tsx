"use client";

import { ListFilter } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { agendaHref, type AgendaQuery, type AgendaView } from "@/lib/agenda/params";

type Option = { value: string; label: string };

/** The professional in sight; category and status, rarer, inside Filtros (D-82). All in the URL (D-41). */
export function AgendaFilters({
  practiceId,
  query,
  today,
  defaultView,
  professionals,
  categories,
  statuses,
}: {
  practiceId: string;
  query: AgendaQuery;
  today: string;
  defaultView: AgendaView;
  /** Empty when the user sees only their own agenda. */
  professionals: Option[];
  categories: Option[];
  statuses: Option[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const go = (change: Partial<AgendaQuery>) => startTransition(() => router.push(agendaHref(practiceId, { ...query, ...change }, today, defaultView)));
  const active = (query.category ? 1 : 0) + (query.status ? 1 : 0);

  return (
    <div className="flex min-w-0 flex-1 gap-2 md:flex-none" aria-busy={pending}>
      {professionals.length > 0 ? (
        <NativeSelect aria-label="Profissional" className="min-w-0 flex-1 md:w-[200px] md:flex-none" value={query.professionalId ?? ""} onChange={(event) => go({ professionalId: event.target.value || null })}>
          <option value="">Todos os profissionais</option>
          {professionals.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      ) : null}
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="lg">
            <ListFilter aria-hidden />
            Filtros
            {active > 0 ? <span className="inline-flex size-[18px] items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{active}</span> : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="flex flex-col gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="agenda-category">Categoria</Label>
            <NativeSelect id="agenda-category" value={query.category ?? ""} onChange={(event) => go({ category: (event.target.value || null) as AgendaQuery["category"] })}>
              <option value="">Todas as categorias</option>
              {categories.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agenda-status">Status</Label>
            <NativeSelect id="agenda-status" value={query.status ?? ""} onChange={(event) => go({ status: (event.target.value || null) as AgendaQuery["status"] })}>
              <option value="">Todos os status</option>
              {statuses.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          {active > 0 ? (
            <Button type="button" variant="ghost" size="sm" className="self-end" onClick={() => go({ category: null, status: null })}>
              Limpar filtros
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
