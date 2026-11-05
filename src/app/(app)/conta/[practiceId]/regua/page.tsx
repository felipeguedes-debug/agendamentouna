import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requirePracticePermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { cadencePreview, getCadenceEditor, listCadences, listChannels } from "@/lib/cadence/editor";
import { practiceSendWindow } from "@/lib/cadence/plan";
import { formatDateBr, formatDayLabel, formatTime, toZoned } from "@/lib/dates/zoned";
import { DISPATCH_REASON_LABELS, INSTANCE_STATUS_LABELS } from "@/lib/domain/labels";
import { formatPhone } from "@/lib/patients/phone";
import { cn } from "@/lib/utils";
import { createCadenceAction } from "./actions";
import { CadenceForm } from "./_regua/cadence-form";
import { SendWindowForm } from "./_regua/send-window-form";

export const metadata: Metadata = { title: "Régua de WhatsApp" };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** "há 3 h", for how long an instance has been in its status. */
function since(instant: Date, now: Date) {
  const minutes = Math.max(0, Math.round((now.getTime() - instant.getTime()) / 60_000));
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 48 * 60) return `há ${Math.round(minutes / 60)} h`;
  return `há ${Math.round(minutes / 1440)} dias`;
}

/**
 * "Régua de WhatsApp" (PRD 6 and 11, mockup ReguaWhatsApp): the practice's cadences,
 * the WhatsAPI channel of each professional, the editor of the chosen cadence, the
 * send window and the preview for next Tuesday at 10h. Manager and admin only (PRD 3).
 */
export default async function CadencePage({ params, searchParams }: PageProps<"/conta/[practiceId]/regua">) {
  const { practiceId } = await params;
  const context = await requirePracticePermission(practiceId, "cadence:edit");
  const query = await searchParams;
  const now = new Date();
  const [cadences, channels, { window, marginMinutes }] = await Promise.all([listCadences(context), listChannels(context), practiceSendWindow(context.db)]);
  const selectedId = cadences.find((cadence) => cadence.id === first(query.regua))?.id ?? cadences[0]?.id;
  const editor = selectedId ? await getCadenceEditor(context, selectedId) : null;
  const preview = selectedId ? await cadencePreview(context, selectedId, now) : null;
  const base = `/conta/${practiceId}/regua`;
  // "seg 02/11 18:00"
  const when = (instant: Date, timeZone: string) => {
    const date = toZoned(instant, timeZone).date;
    return `${formatDayLabel(date).split(" ")[0].toLowerCase()} ${formatDateBr(date).slice(0, 5)} ${formatTime(instant, timeZone)}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold">Régua de WhatsApp</h1>
          <p className="text-sm text-muted-foreground">Sequência de mensagens ancorada no horário do atendimento. A resposta do paciente muda o status sozinha.</p>
        </div>
        <form action={createCadenceAction.bind(null, practiceId)} className="ml-auto">
          <Button type="submit">+ Nova régua</Button>
        </form>
      </header>

      <div className="flex flex-wrap items-start gap-4">
        <aside className="flex min-w-0 flex-[0_1_260px] flex-col gap-3">
          <nav aria-label="Réguas" className="flex flex-col overflow-hidden rounded-xl border border-border bg-white">
            {cadences.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground">Nenhuma régua cadastrada nesta conta.</p> : null}
            {cadences.map((cadence) => (
              <Link
                key={cadence.id}
                href={`${base}?regua=${cadence.id}`}
                aria-current={cadence.id === selectedId ? "page" : undefined}
                className={cn("flex flex-col gap-0.5 border-b border-[#EEF1F0] px-4 py-3 last:border-0", cadence.id === selectedId && "bg-accent")}
              >
                <span className={cn("font-semibold", cadence.id === selectedId && "text-primary")}>{cadence.name}</span>
                <span className="text-xs text-muted-foreground">
                  {cadence.stepCount} {cadence.stepCount === 1 ? "passo" : "passos"} · {cadence.typeCount} {cadence.typeCount === 1 ? "tipo" : "tipos"} ·{" "}
                  {cadence.active ? "ativa" : "inativa"}
                </span>
              </Link>
            ))}
          </nav>

          <section aria-labelledby="canais" className="flex flex-col gap-2.5 rounded-xl border border-border bg-white p-4">
            <h2 id="canais" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Canais da conta
            </h2>
            {channels.map((channel) => (
              <div key={channel.professionalName} className="flex items-center gap-2.5">
                <span
                  className={cn("size-2 shrink-0 rounded-full", channel.status === "CONNECTED" ? "bg-[#16A34A]" : channel.status ? "bg-[#DC2626]" : "bg-[#9AA6A2]")}
                />
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">{channel.professionalName}</span>
                  <span className={cn("text-xs", channel.status && channel.status !== "CONNECTED" ? "text-[#B91C1C]" : "text-muted-foreground")}>
                    {channel.status
                      ? `WhatsAPI${channel.phoneNumber ? ` · ${formatPhone(channel.phoneNumber)}` : ""} · ${INSTANCE_STATUS_LABELS[channel.status]}${
                          channel.status !== "CONNECTED" && channel.statusChangedAt ? ` ${since(channel.statusChangedAt, now)}` : ""
                        }`
                      : "Sem instância WhatsAPI"}
                  </span>
                </span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              A instância de cada profissional é conectada pelo QR Code no painel da WhatsAPI. Conversas e respostas livres seguem para a SynkronosCRM.
            </p>
          </section>
        </aside>

        <section className="flex min-w-0 flex-[999_1_480px] flex-col gap-4">
          {can(context.access.role, "practice-settings:edit") ? (
            <SendWindowForm
              practiceId={practiceId}
              initial={{ start: window.start, end: window.end, days: [...window.days], marginHours: marginMinutes / 60 }}
            />
          ) : null}

          {editor ? (
            <CadenceForm
              key={editor.id}
              practiceId={practiceId}
              cadenceId={editor.id}
              version={editor.version}
              initial={{ name: editor.name, active: editor.active, typeIds: editor.typeIds, professionalIds: editor.professionalIds, steps: editor.steps }}
              types={editor.types}
              professionals={editor.professionals}
            />
          ) : null}

          {preview ? (
            <section aria-labelledby="previa" className="flex flex-col gap-1.5 rounded-xl border border-[#B6E0D6] bg-accent px-4 py-3.5">
              <h2 id="previa" className="text-xs font-semibold text-primary">
                Prévia para um atendimento na próxima terça, {formatDateBr(toZoned(preview.startsAt, preview.timeZone).date)}, às 10h, marcado agora
              </h2>
              <ul className="flex flex-col gap-0.5 text-sm" data-testid="cadence-preview">
                {preview.steps.map((step) => (
                  <li key={step.position}>
                    Passo {step.position} ·{" "}
                    {step.at ? (
                      <>
                        {when(step.at, preview.timeZone)}
                        {step.adjustment && step.adjustment !== "none" ? <span className="text-muted-foreground"> ({DISPATCH_REASON_LABELS[step.adjustment]})</span> : null}
                      </>
                    ) : (
                      <span className="text-muted-foreground">pulado: {DISPATCH_REASON_LABELS[step.skipped ?? ""]}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>
      </div>
    </div>
  );
}
