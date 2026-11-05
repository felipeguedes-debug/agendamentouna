import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { requirePracticeAccess } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { ROLE_LABELS } from "@/lib/domain/labels";
import { mainSections, practicePath, settingsGroups, visibleSections } from "../../sections";

export const metadata: Metadata = { title: "Mais" };

function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li className="border-t border-[#EEF1F0]">
      <Link href={href} className="flex min-h-12 items-center px-3.5">
        {children}
        <ChevronRight aria-hidden className="ml-auto size-4 text-muted-foreground" />
      </Link>
    </li>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="overflow-hidden rounded-xl border border-border bg-white">
      <h2 className="px-3.5 py-2.5 text-xs font-semibold text-muted-foreground">{title}</h2>
      <ul>{children}</ul>
    </section>
  );
}

/** The phone's "Mais": what does not fit in the bottom menu (D-81). */
export default async function MorePage({ params }: PageProps<"/conta/[practiceId]/mais">) {
  const { practiceId } = await params;
  const { user, access } = await requirePracticeAccess(practiceId);
  const { role } = access;
  const reports = mainSections(role).filter((section) => section.segment === "indicadores");
  const profile = visibleSections(role).some((section) => section.segment === "perfil");

  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">Mais</h1>
      <p className="flex flex-col px-0.5 py-1">
        <span className="font-semibold">{user.name}</span>
        <span className="text-[13px] text-muted-foreground">{ROLE_LABELS[role]}</span>
      </p>
      {reports.length > 0 ? (
        <Group title="Acompanhamento">
          {reports.map((section) => (
            <MoreLink key={section.segment} href={practicePath(practiceId, section.segment)}>
              {section.label}
            </MoreLink>
          ))}
        </Group>
      ) : null}
      {settingsGroups(role).map(({ group, sections }) => (
        <Group key={group} title={group}>
          {sections.map((section) => (
            <MoreLink key={section.segment} href={practicePath(practiceId, section.segment)}>
              {section.label}
            </MoreLink>
          ))}
        </Group>
      ))}
      <Group title="Sua conta">
        {profile ? <MoreLink href={practicePath(practiceId, "perfil")}>Meu perfil</MoreLink> : null}
        {can(role, "agenda:view-own") ? <MoreLink href={`/pwa/${practiceId}`}>App do celular</MoreLink> : null}
        <MoreLink href="/seguranca">Minha segurança</MoreLink>
        <li className="border-t border-[#EEF1F0]">
          <SignOutButton className="flex min-h-12 w-full items-center px-3.5 text-left" failureClassName="block px-3.5 pb-3 text-xs text-destructive" />
        </li>
      </Group>
    </div>
  );
}
