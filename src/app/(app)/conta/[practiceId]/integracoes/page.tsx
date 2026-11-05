import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { agendaTimeZone } from "@/lib/agenda/agenda";
import { requirePracticePermission, SECURITY_PATH } from "@/lib/auth/guard";
import { getTwoFactorRequirement, type TwoFactorRequirement } from "@/lib/auth/two-factor-requirement";
import { CRM_COMMAND_TAGS } from "@/lib/crm/rules";
import { getCrmSettings, type CrmStatus } from "@/lib/crm/settings";
import { formatDateBr, formatTime, toZoned } from "@/lib/dates/zoned";
import { CRM_COMMAND_LABELS, CRM_OUTCOME_LABELS } from "@/lib/domain/labels";
import { CrmActions, CrmTokenForm } from "./_configuracoes/crm-forms";
import { TwoFactorRequirementForm } from "./_configuracoes/two-factor-form";

export const metadata: Metadata = { title: "Segurança e integrações" };

const STATUS_TEXT: Record<CrmStatus, string> = {
  none: "Não conectada",
  active: "Conectada",
  revoked: "Token recusado",
};

function missingText({ currentUserMissing, othersMissing }: TwoFactorRequirement) {
  if (othersMissing.length > 0) return `${currentUserMissing ? "Além de você, ainda" : "Ainda"} não ativaram: ${othersMissing.join(", ")}.`;
  return currentUserMissing ? "Só você falta ativar nesta conta." : "Todos nesta conta já ativaram.";
}

/**
 * The practice's settings (PRD 11, "Configurações da conta"; D-23, D-68, D-71), for the
 * manager: the two-factor requirement, the FlwChat token, the situation of the connection
 * and the latest commands from the secretaries. The send window stays on the cadence
 * screen (D-56).
 */
export default async function SettingsPage({ params }: PageProps<"/conta/[practiceId]/integracoes">) {
  const { practiceId } = await params;
  const context = await requirePracticePermission(practiceId, "practice-settings:edit");
  const [twoFactor, crm, timeZone] = await Promise.all([getTwoFactorRequirement(context), getCrmSettings(context), agendaTimeZone(context.db)]);
  const moment = (instant: Date) => `${formatDateBr(toZoned(instant, timeZone).date)} às ${formatTime(instant, timeZone)}`;
  const connected = crm.status !== "none";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Segurança e integrações</h1>
        <p className="text-sm text-muted-foreground">
          A janela de envio e a margem ficam em{" "}
          <Link href={`/conta/${practiceId}/regua`} className="font-medium text-primary hover:underline">
            Régua de WhatsApp
          </Link>
          .
        </p>
      </div>

      <section aria-labelledby="dois-fatores" className="flex flex-col gap-4 rounded-xl border border-border bg-white px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="dois-fatores" className="text-sm font-semibold">
            Verificação em duas etapas
          </h2>
          <span data-testid="two-factor-status" className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium">
            {twoFactor.required ? "Exigida" : "Não exigida"}
          </span>
        </div>

        {twoFactor.currentUserMissing ? (
          <Alert variant="destructive">
            <AlertDescription>
              Você ainda não ativou. Ao exigir, você também vai para a tela{" "}
              <Link href={SECURITY_PATH} className="font-medium underline">
                Segurança
              </Link>{" "}
              e só volta à agenda e a esta tela depois de ativar. Se preferir, ative antes.
            </AlertDescription>
          </Alert>
        ) : null}

        <p className="text-sm text-muted-foreground">
          {twoFactor.required
            ? "Quem ainda não ativou é levado à tela Segurança em toda página, em qualquer conta em que trabalhe, até ativar. Deixar de exigir não desativa a verificação de quem já ativou."
            : "Ao exigir, quem ainda não ativou é levado à tela Segurança em toda página, em qualquer conta em que trabalhe, e só volta a usar a agenda depois de ativar. Daí em diante, todo login pede o código do aplicativo autenticador, também o login com Google."}
        </p>
        <p className="text-sm">{missingText(twoFactor)}</p>

        <TwoFactorRequirementForm practiceId={practiceId} required={twoFactor.required} currentUserMissing={twoFactor.currentUserMissing} />
      </section>

      <section aria-labelledby="synkronos" className="flex flex-col gap-4 rounded-xl border border-border bg-white px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="synkronos" className="text-sm font-semibold">
            SynkronosCRM
          </h2>
          <span data-testid="crm-status" className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium">
            {STATUS_TEXT[crm.status]}
          </span>
        </div>

        {crm.status === "revoked" ? (
          <Alert variant="destructive">
            <AlertDescription>
              O FlwChat recusou o token{crm.since ? ` em ${moment(crm.since)}` : ""}. A agenda segue funcionando e o que mudou fica na fila até você informar um token válido.
            </AlertDescription>
          </Alert>
        ) : null}

        <p className="text-sm text-muted-foreground">
          A conversa do paciente na Synkronos mostra o status, o tipo, o profissional, a unidade e o horário de cada agendamento, numa nota interna e numa etiqueta de status. O nome do tipo é o
          nome exibido, e a observação interna não vai.
        </p>

        {crm.sharedWith > 0 ? (
          <p data-testid="crm-shared" className="text-sm text-muted-foreground">
            Esta conta da Synkronos também atende {crm.sharedWith === 1 ? "outro consultório" : `${crm.sharedWith} outros consultórios`}: o token vale para todos, e a etiqueta de status de um contato aparece para as equipes deles.
          </p>
        ) : null}

        <CrmTokenForm key={crm.status} practiceId={practiceId} connected={connected} />

        {connected ? (
          <>
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[12rem_1fr]">
              <dt className="text-muted-foreground">Ações da secretária</dt>
              <dd data-testid="crm-webhook">
                {crm.webhook === "registered" ? "Recebidas pelo webhook" : "Sem webhook: este ambiente não tem endereço público. A reconciliação diária lê as etiquetas."}
              </dd>
              <dt className="text-muted-foreground">Na fila para a Synkronos</dt>
              <dd>{crm.waiting}</dd>
              <dt className="text-muted-foreground">Não chegaram</dt>
              <dd>{crm.failed}</dd>
              <dt className="text-muted-foreground">Última reconciliação</dt>
              <dd>{crm.reconciledAt ? moment(crm.reconciledAt) : "Ainda não rodou"}</dd>
            </dl>
            <CrmActions practiceId={practiceId} failed={crm.failed} />
          </>
        ) : null}
      </section>

      <section aria-labelledby="etiquetas" className="flex flex-col gap-2 rounded-xl border border-border bg-white px-5 py-4 text-sm">
        <h2 id="etiquetas" className="font-semibold">
          O que a secretária faz na Synkronos
        </h2>
        <p className="text-muted-foreground">Sem sair da conversa, ela aplica uma etiqueta no contato. A agenda age sobre a última mensagem de régua enviada àquele paciente e tira a etiqueta.</p>
        <ul className="flex flex-col gap-1">
          <li>
            <strong>{CRM_COMMAND_TAGS.confirm}</strong>: o agendamento fica Confirmado e os pedidos de confirmação param.
          </li>
          <li>
            <strong>{CRM_COMMAND_TAGS.manual_contact}</strong>: os pedidos de confirmação param e o status não muda.
          </li>
        </ul>
        <p className="text-muted-foreground">Se não houver mensagem de régua, ou o atendimento já tiver passado, nada muda e uma nota na conversa explica o motivo. As etiquetas de status, como “Agenda: Confirmado”, são escritas pela agenda; mudá-las à mão não muda o agendamento.</p>
      </section>

      {crm.recent.length > 0 ? (
        <section aria-labelledby="recentes" className="flex flex-col gap-3">
          <h2 id="recentes" className="text-sm font-semibold">
            Últimas ações da secretária
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-white">
            <Table className="min-w-[540px]">
              <TableHeader>
                <TableRow className="text-xs tracking-wide text-muted-foreground uppercase">
                  <TableHead className="px-4">Quando</TableHead>
                  <TableHead>Etiqueta</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {crm.recent.map((event) => (
                  <TableRow key={event.id} data-testid="crm-event">
                    <TableCell className="px-4 py-3 tabular-nums">{moment(event.createdAt)}</TableCell>
                    <TableCell>{CRM_COMMAND_LABELS[event.command] ?? event.command}</TableCell>
                    <TableCell>
                      {event.appointmentId ? (
                        <Link href={`/conta/${practiceId}/agendamentos/${event.appointmentId}`} className="font-medium text-primary hover:underline">
                          {event.patientName ?? "Agendamento"}
                        </Link>
                      ) : (
                        (event.patientName ?? "—")
                      )}
                    </TableCell>
                    <TableCell>{CRM_OUTCOME_LABELS[event.outcome] ?? event.outcome}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
