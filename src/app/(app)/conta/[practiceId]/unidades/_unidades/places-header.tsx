import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The way back to the settings, the title and the tabs of the two screens (D-86). */
export function PlacesHeader({ practiceId, active, children }: { practiceId: string; active: "unidades" | "horarios"; children?: ReactNode }) {
  const base = `/conta/${practiceId}/unidades`;
  const tabs = [
    { key: "unidades", label: "Unidades", href: base },
    { key: "horarios", label: "Horários e exceções", href: `${base}/horarios` },
  ];
  return (
    <>
      <Link href={`/conta/${practiceId}/configuracoes`} className="inline-flex items-center gap-1 self-start text-[13px] text-muted-foreground hover:underline">
        <ChevronLeft aria-hidden className="size-3.5" />
        Configurações
      </Link>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <h1 className="text-xl font-semibold">Unidades e horários</h1>
        <div className="ml-auto">{children}</div>
      </div>
      <nav aria-label="Seções de unidades e horários" className="flex gap-[18px] border-b border-border">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={tab.key === active ? "page" : undefined}
            className={cn("-mb-px border-b-2 border-transparent py-2.5 text-[13.5px] font-medium text-[#3A4542]", tab.key === active && "border-primary font-semibold text-primary")}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
