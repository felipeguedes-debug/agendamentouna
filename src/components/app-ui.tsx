import Link from "next/link";
import type { ReactNode } from "react";

// Plain Tailwind building blocks of the Block 2 screens, styled like the shadcn/ui
// theme in globals.css. New screens use the shadcn components in ./ui (D-46).

export const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-xs focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 disabled:bg-zinc-100";

export const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60";

export const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-xs hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60";

export const linkClass = "font-medium text-teal-700 hover:underline";

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-zinc-800">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "info" | "success"; children: ReactNode }) {
  const tones = {
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-sky-200 bg-sky-50 text-sky-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

/** Centered card of the pages outside a practice: login, invitation, terms. */
/** The access screens (D-88): a floating card beside what the system does. */
export function AccessScreen({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  const points = ["Cada horário já nasce com tipo e valor", "O paciente confirma pelo WhatsApp e o status muda sozinho", "O profissional vê tudo no Google Agenda que já usa"];
  return (
    <div className="flex flex-1 flex-wrap items-center justify-center gap-x-[72px] gap-y-10 px-4 py-10 sm:px-6">
      <main className="flex w-full max-w-[420px] flex-col gap-[22px] rounded-[18px] bg-white p-6 shadow-[0_16px_48px_rgba(15,23,42,0.12)] sm:p-8">
        <div className="flex flex-col gap-3.5">
          <span aria-hidden className="inline-flex size-10 items-center justify-center rounded-[11px] bg-primary text-lg font-bold text-primary-foreground">
            A
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-[22px] font-semibold">{title}</h1>
            {subtitle ? <p className="text-sm leading-snug text-muted-foreground">{subtitle}</p> : null}
          </div>
        </div>
        {children}
        <p className="text-xs text-muted-foreground">
          <Link href="/privacidade" className="hover:underline">
            Privacidade
          </Link>
          {" · "}
          <Link href="/termos" className="hover:underline">
            Termos
          </Link>
        </p>
      </main>
      <aside className="hidden w-full max-w-[420px] flex-col gap-5 lg:flex">
        <h2 className="text-[30px] leading-tight font-semibold tracking-tight">A agenda do consultório, com WhatsApp e Google no mesmo lugar.</h2>
        <ul className="flex flex-col gap-3">
          {points.map((point) => (
            <li key={point} className="flex items-start gap-2.5 text-[15px] text-[#3A4542]">
              <span aria-hidden className="mt-0.5 font-bold text-primary">
                ✓
              </span>
              {point}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold tracking-wide text-teal-700">Agenda</p>
        <h1 className="mt-1 text-xl font-semibold text-zinc-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-zinc-600">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

export function PageHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-semibold text-zinc-900">{title}</h1>
      {description ? <p className="mt-1 text-sm text-zinc-600">{description}</p> : null}
    </div>
  );
}
