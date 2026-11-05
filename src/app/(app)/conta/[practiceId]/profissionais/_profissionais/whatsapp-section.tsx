import { formatDateBr, formatTime, toZoned } from "@/lib/dates/zoned";
import { INSTANCE_STATUS_LABELS } from "@/lib/domain/labels";
import type { getWhatsappInstanceSetup } from "@/lib/cadence/instance-setup";
import { formatPhone } from "@/lib/patients/phone";
import { WhatsappInstanceForm } from "./whatsapp-form";

/**
 * The professional's WhatsApp, for the manager and the admin (PRD 3 req. 9, D-94): where
 * the instance's URL and token go. The phone is paired by QR Code on WhatsAPI's panel.
 */
export function WhatsappSection({
  practiceId,
  professionalId,
  setup,
  timeZone,
  sandbox,
}: {
  practiceId: string;
  professionalId: string;
  setup: Awaited<ReturnType<typeof getWhatsappInstanceSetup>>;
  timeZone: string;
  sandbox: boolean;
}) {
  return (
    <section aria-labelledby="whatsapp" className="flex flex-col gap-5 rounded-xl border border-border bg-white px-5 py-4">
      <div className="flex flex-col gap-1">
        <h2 id="whatsapp" className="text-base font-semibold">
          WhatsApp
        </h2>
        <p className="text-sm text-muted-foreground">
          A régua sai pela instância da WhatsAPI deste profissional. Crie a instância e conecte o número pelo QR Code no painel da WhatsAPI; a URL e o token ficam nesse mesmo painel.
        </p>
      </div>

      {sandbox ? <p className="text-sm text-muted-foreground">Ambiente de teste: as mensagens ficam registradas aqui e nenhuma sai de verdade.</p> : null}

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="text-muted-foreground">Situação</dt>
        <dd data-testid="whatsapp-status">
          {setup ? `${INSTANCE_STATUS_LABELS[setup.status]} desde ${formatDateBr(toZoned(setup.statusChangedAt, timeZone).date)} às ${formatTime(setup.statusChangedAt, timeZone)}` : "Sem instância"}
        </dd>
        {setup?.phoneNumber ? (
          <>
            <dt className="text-muted-foreground">Número</dt>
            <dd>{formatPhone(setup.phoneNumber)}</dd>
          </>
        ) : null}
      </dl>

      <WhatsappInstanceForm practiceId={practiceId} professionalId={professionalId} apiUrl={setup?.apiUrl ?? ""} phone={setup?.phoneNumber ? formatPhone(setup.phoneNumber) : ""} hasInstance={Boolean(setup)} />
    </section>
  );
}
