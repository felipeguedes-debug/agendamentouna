"use client";

import { BarChart3, CalendarCheck, ChevronDown, Inbox, Menu, Plus, Search, Settings, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { useRef, useState } from "react";
import { SIGN_OUT_FAILED_TEXT, signOutAndLeave } from "@/components/sign-out-button";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { switchPractice } from "../../actions";
import { activeSegment, isSettingsSegment, practicePath } from "../sections";
import { PatientSearch } from "./patient-search";

export type MenuEntry = { segment: string | null; label: string; count?: number };
type SettingsGroupEntry = { group: string; sections: { segment: string | null; label: string }[] };

const ICONS: Record<string, LucideIcon> = {
  agenda: CalendarCheck,
  pendencias: Inbox,
  pacientes: Users,
  indicadores: BarChart3,
};

function iconOf(segment: string | null) {
  return ICONS[segment ?? "agenda"] ?? CalendarCheck;
}

function Count({ value, className }: { value: number | undefined; className?: string }) {
  if (!value) return null;
  return (
    <span
      data-testid="pending-count"
      className={cn("absolute inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FBBF24] px-1 text-[11px] font-bold text-[#422006]", className)}
    >
      {value}
    </span>
  );
}

function initials(name: string) {
  const parts = name.replace(/^Dra?\.\s+/, "").split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts.at(-1)![0] : ""}`.toUpperCase();
}

function PracticeSwitcher({ practiceId, practices, className }: { practiceId: string; practices: { practiceId: string; practiceName: string }[]; className?: string }) {
  const segment = activeSegment(useSelectedLayoutSegment());
  const form = useRef<HTMLFormElement>(null);
  if (practices.length <= 1) {
    return <span className={cn("truncate text-sm font-medium", className)}>{practices[0]?.practiceName}</span>;
  }
  return (
    <form key={practiceId} ref={form} action={switchPractice} className={cn("min-w-0", className)}>
      <input type="hidden" name="section" value={segment ?? ""} />
      <select
        aria-label="Conta"
        name="practiceId"
        defaultValue={practiceId}
        onChange={() => form.current?.requestSubmit()}
        className="h-9 w-full rounded-lg border border-input bg-white px-2.5 text-sm font-medium outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {practices.map((practice) => (
          <option key={practice.practiceId} value={practice.practiceId}>
            {practice.practiceName}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="text-sm">
          Trocar
        </button>
      </noscript>
    </form>
  );
}

/** The menu stays open while leaving: if the server does not answer, this is where the person reads it (D-79). */
function SignOutMenuItem() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <>
      <DropdownMenuItem
        disabled={pending}
        onSelect={async (event) => {
          event.preventDefault();
          setPending(true);
          setFailed(false);
          if (!(await signOutAndLeave())) {
            setFailed(true);
            setPending(false);
          }
        }}
      >
        Sair
      </DropdownMenuItem>
      {failed ? (
        <p role="alert" className="max-w-56 px-2.5 pt-1 pb-1.5 text-xs text-destructive">
          {SIGN_OUT_FAILED_TEXT}
        </p>
      ) : null}
    </>
  );
}

/** Search, practice, booking and the user's menu, on every screen (D-81). */
export function TopBar({
  practiceId,
  practices,
  userName,
  roleLabel,
  canBook,
  canSearch,
  ownProfile,
  phoneApp,
}: {
  practiceId: string;
  practices: { practiceId: string; practiceName: string }[];
  userName: string;
  roleLabel: string;
  canBook: boolean;
  canSearch: boolean;
  ownProfile: boolean;
  phoneApp: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-border bg-white py-2 pr-3 pl-3 md:gap-4 md:pr-5 md:pl-0">
      <div className="hidden w-[88px] shrink-0 justify-center md:flex">
        <Link
          href={practicePath(practiceId)}
          aria-label="Agenda, início"
          className="inline-flex size-8 items-center justify-center rounded-[9px] bg-primary text-[15px] font-bold text-primary-foreground"
        >
          A
        </Link>
      </div>
      {canSearch ? (
        <div className="hidden w-full max-w-[340px] md:block">
          <PatientSearch practiceId={practiceId} />
        </div>
      ) : null}
      <PracticeSwitcher practiceId={practiceId} practices={practices} className="min-w-0 flex-1 md:ml-auto md:max-w-[240px]" />
      {canSearch ? (
        <Link
          href={practicePath(practiceId, "pacientes")}
          aria-label="Buscar paciente"
          className={cn(buttonVariants({ variant: "outline", size: "icon-lg" }), "size-11 md:hidden")}
        >
          <Search aria-hidden className="size-5" />
        </Link>
      ) : null}
      {canBook ? (
        <Link href={`${practicePath(practiceId)}/agendamentos/novo`} className={cn(buttonVariants({ size: "lg" }), "hidden md:inline-flex")}>
          <Plus aria-hidden />
          Agendar
        </Link>
      ) : null}
      <div className="hidden md:block">
        <DropdownMenu>
          <DropdownMenuTrigger aria-label={`Menu de ${userName}`} className="inline-flex items-center gap-1 rounded-lg p-0.5 text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
            <span aria-hidden className="inline-flex size-9 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-accent-foreground">
              {initials(userName)}
            </span>
            <ChevronDown aria-hidden className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="normal-case">
              <span className="block text-sm font-semibold tracking-normal text-foreground">{userName}</span>
              <span className="block font-normal tracking-normal">{roleLabel}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ownProfile ? (
              <DropdownMenuItem asChild>
                <Link href={practicePath(practiceId, "perfil")}>Meu perfil</Link>
              </DropdownMenuItem>
            ) : null}
            {phoneApp ? (
              <DropdownMenuItem asChild>
                <Link href={`/pwa/${practiceId}`}>App do celular</Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem asChild>
              <Link href="/seguranca">Segurança</Link>
            </DropdownMenuItem>
            <SignOutMenuItem />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function RailLink({ href, label, Icon, active, count }: { href: string; label: string; Icon: LucideIcon; active: boolean; count?: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex flex-col items-center gap-1 rounded-[10px] px-0.5 pt-2.5 pb-2 text-[11px] font-medium text-[#3A4542] hover:bg-muted",
        active && "bg-accent font-semibold text-accent-foreground hover:bg-accent",
      )}
    >
      <Icon aria-hidden className="size-5" strokeWidth={1.8} />
      {label}
      <Count value={count} className="top-1 right-3" />
    </Link>
  );
}

/** Daily work above, settings below with their groups (D-81). */
export function SideMenu({ practiceId, main, settings }: { practiceId: string; main: MenuEntry[]; settings: SettingsGroupEntry[] }) {
  const segment = activeSegment(useSelectedLayoutSegment());
  const onSettings = isSettingsSegment(segment);

  return (
    <nav aria-label="Menu principal" className="sticky top-14 hidden h-[calc(100svh-3.5rem)] w-[88px] shrink-0 flex-col gap-1 border-r border-border bg-white px-1.5 py-2.5 md:flex">
      {main.map((entry) => (
        <RailLink
          key={entry.segment ?? "agenda"}
          href={practicePath(practiceId, entry.segment)}
          label={entry.label}
          Icon={iconOf(entry.segment)}
          active={entry.segment === segment}
          count={entry.count}
        />
      ))}
      <div className="mt-auto">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-current={onSettings ? "page" : undefined}
            className={cn(
              "flex w-full flex-col items-center gap-1 rounded-[10px] px-0.5 pt-2.5 pb-2 text-[11px] font-medium text-[#3A4542] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
              onSettings && "bg-accent font-semibold text-accent-foreground hover:bg-accent",
            )}
          >
            <Settings aria-hidden className="size-5" strokeWidth={1.8} />
            Configurações
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" sideOffset={8} className="w-64">
            {settings.map(({ group, sections }) => (
              <div key={group}>
                <DropdownMenuLabel>{group}</DropdownMenuLabel>
                {sections.map((section) => (
                  <DropdownMenuItem key={section.segment} asChild>
                    <Link href={practicePath(practiceId, section.segment)}>{section.label}</Link>
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={practicePath(practiceId, "configuracoes")}>Ver todas</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}

/** The phone's menu: the daily work plus "Mais", in place of the links stacked on top (D-81). */
export function BottomNav({ practiceId, main }: { practiceId: string; main: MenuEntry[] }) {
  const segment = activeSegment(useSelectedLayoutSegment());
  const phoneEntries = main.filter((entry) => entry.segment !== "indicadores");
  const item = "relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-[10px] text-[11.5px] font-medium text-[#3A4542]";
  const on = "bg-accent font-semibold text-accent-foreground";

  return (
    <nav
      aria-label="Menu do celular"
      className="fixed inset-x-0 bottom-0 z-30 grid auto-cols-fr grid-flow-col gap-0.5 border-t border-border bg-white px-1.5 pt-1.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] md:hidden"
    >
      {phoneEntries.map((entry) => {
        const Icon = iconOf(entry.segment);
        const active = entry.segment === segment;
        return (
          <Link key={entry.segment ?? "agenda"} href={practicePath(practiceId, entry.segment)} aria-current={active ? "page" : undefined} className={cn(item, active && on)}>
            <Icon aria-hidden className="size-[22px]" strokeWidth={1.8} />
            {entry.label}
            <Count value={entry.count} className="top-0.5 right-[18%]" />
          </Link>
        );
      })}
      <Link href={practicePath(practiceId, "mais")} aria-current={segment === "mais" ? "page" : undefined} className={cn(item, segment === "mais" && on)}>
        <Menu aria-hidden className="size-[22px]" strokeWidth={1.8} />
        Mais
      </Link>
    </nav>
  );
}
