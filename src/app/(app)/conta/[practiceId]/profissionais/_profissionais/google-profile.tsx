import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatDateBr, formatTime, toZoned } from "@/lib/dates/zoned";
import type { GoogleProfile } from "@/lib/google/profile";
import { AllDayRuleForm, BusyCalendarsForm, LinkOwnButton, SendLinkForm, UnlinkButton } from "./google-forms";

function at(instant: Date, timeZone: string) {
  return `${formatDateBr(toZoned(instant, timeZone).date)} às ${formatTime(instant, timeZone)}`;
}

/**
 * The Google part of the professional's profile (PRD 11, D-23): the link and its
 * warning (PRD 5, rule 6), the link or the e-mailed link, unlinking, and for the
 * professional the calendars that count as busy and the all-day rule.
 */
export function GoogleProfileSection({ practiceId, profile, timeZone, notice }: { practiceId: string; profile: GoogleProfile; timeZone: string; notice?: string }) {
  const { link } = profile;
  return (
    <section aria-labelledby="google-agenda" className="flex flex-col gap-5 rounded-xl border border-border bg-white px-5 py-4">
      <div className="flex flex-col gap-1">
        <h2 id="google-agenda" className="text-base font-semibold">
          Google Agenda
        </h2>
        <p className="text-sm text-muted-foreground">
          Os atendimentos vão para um calendário próprio no Google, com o primeiro nome do paciente e o tipo; os compromissos do Google voltam como horário ocupado, sem o conteúdo.
        </p>
      </div>

      {notice ? <p className="text-sm font-medium text-primary">{notice}</p> : null}

      {link.status === "revoked" || link.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>O Google recusou o acesso{link.statusChangedAt ? ` em ${at(link.statusChangedAt, timeZone)}` : ""}</AlertTitle>
          <AlertDescription>O vínculo foi revogado ou venceu. A agenda continua funcionando sem o Google até o profissional vincular de novo.</AlertDescription>
        </Alert>
      ) : null}

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="text-muted-foreground">Situação</dt>
        <dd data-testid="google-status">
          {link.status === "none" ? "Não vinculado" : link.status === "active" ? `Vinculado a ${link.email}` : `Desconectado (${link.email})`}
        </dd>
        {link.status === "active" ? (
          <>
            <dt className="text-muted-foreground">Calendário do consultório</dt>
            <dd>{link.secondaryCalendarName ? `"${link.secondaryCalendarName}"` : "Sendo criado no Google…"}</dd>
            <dt className="text-muted-foreground">Última leitura do Google</dt>
            <dd>{link.lastSyncAt ? at(link.lastSyncAt, timeZone) : "Ainda não"}</dd>
          </>
        ) : null}
        {profile.exportErrors > 0 ? (
          <>
            <dt className="text-muted-foreground">Falhas de envio</dt>
            <dd className="text-destructive">{profile.exportErrors} atendimento(s) futuro(s) não chegaram ao Google.</dd>
          </>
        ) : null}
      </dl>

      {profile.canLink && link.status !== "active" ? <LinkOwnButton practiceId={practiceId} label={link.status === "none" ? "Vincular Google Agenda" : "Vincular de novo"} /> : null}
      {profile.canSendLink && link.status !== "active" ? (
        <SendLinkForm practiceId={practiceId} professionalId={profile.professional.id} hasLogin={profile.professional.hasLogin} />
      ) : null}

      {profile.canChooseCalendars && profile.calendars ? (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">Calendários que contam como ocupado</h3>
          <p className="text-xs text-muted-foreground">
            {profile.busyChosen
              ? "Vale a sua escolha."
              : "Padrão: todos em que você pode editar. Um calendário novo entra sozinho enquanto você não escolher."}
          </p>
          <BusyCalendarsForm practiceId={practiceId} calendars={profile.calendars} chosen={profile.busyChosen} />
        </div>
      ) : null}

      {profile.canChooseCalendars ? (
        <div className="border-t border-border pt-4">
          <AllDayRuleForm practiceId={practiceId} initial={profile.allDayEventsBlock} />
        </div>
      ) : null}

      {profile.canUnlink ? (
        <div className="border-t border-border pt-4">
          <UnlinkButton practiceId={practiceId} professionalId={profile.professional.id} />
        </div>
      ) : null}
    </section>
  );
}
