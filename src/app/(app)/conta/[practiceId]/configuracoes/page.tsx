import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requirePracticeAccess } from "@/lib/auth/guard";
import { practicePath, settingsGroups } from "../../sections";

export const metadata: Metadata = { title: "Configurações" };

/** The settings of the practice in one place, grouped, as far as the role reaches (D-81). */
export default async function SettingsHubPage({ params }: PageProps<"/conta/[practiceId]/configuracoes">) {
  const { practiceId } = await params;
  const { access } = await requirePracticeAccess(practiceId);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Configurações</h1>
      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
        {settingsGroups(access.role).map(({ group, sections }) => (
          <section key={group} aria-label={group} className="overflow-hidden rounded-xl border border-border bg-white">
            <h2 className="px-4 py-3.5 text-[15px] font-semibold">{group}</h2>
            <ul>
              {sections.map((section) => (
                <li key={section.segment} className="border-t border-[#EEF1F0]">
                  <Link href={practicePath(practiceId, section.segment)} className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-semibold">{section.label}</span>
                      <span className="text-[13px] text-muted-foreground">{section.description}</span>
                    </span>
                    <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
