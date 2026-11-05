"use client";

import { Bell, BellRing } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { browserSubscription, pushSupport, subscribeBrowser, unsubscribeBrowser, useStandalone } from "@/components/pwa/device";
import { rememberThisDevice } from "@/lib/auth/client";
import { disablePushAction, enablePushAction, syncPushAction } from "../../actions";

/**
 * What belongs to this device: staying signed in for 30 days (D-17, D-77) and the
 * confirmation notices (D-78). Neither happens without the person asking. It opens by
 * itself the first time in the installed app, until the device is remembered.
 */
export function DevicePanel({ remembered, vapidPublicKey }: { remembered: boolean; vapidPublicKey: string | null }) {
  const standalone = useStandalone();
  const [choice, setChoice] = useState<boolean | null>(null);
  const [notices, setNotices] = useState(false);
  const open = choice ?? (standalone && !remembered);

  useEffect(() => {
    if (!remembered || pushSupport() !== "supported") return;
    browserSubscription()
      .then((subscription) => syncPushAction(subscription?.toJSON() ?? null))
      .then(setNotices)
      .catch(() => undefined);
  }, [remembered]);

  const Icon = notices ? BellRing : Bell;
  return (
    <>
      <button
        type="button"
        aria-label="Notificações e este aparelho"
        aria-expanded={open}
        onClick={() => setChoice(!open)}
        className="ml-auto flex size-11 items-center justify-center rounded-full bg-white/15 text-white"
      >
        <Icon aria-hidden className="size-5" />
      </button>
      {open ? (
        <section aria-label="Este aparelho" data-testid="device-panel" className="absolute inset-x-4 top-[calc(100%-1rem)] z-20 flex flex-col gap-4 rounded-xl border border-[#E3E8E6] bg-white p-4 text-[#1A1F1E] shadow-lg">
          <RememberRow remembered={remembered} standalone={standalone} onRemembered={() => setChoice(true)} />
          <NoticesRow remembered={remembered} vapidPublicKey={vapidPublicKey} enabled={notices} onChange={setNotices} />
          <Button type="button" variant="outline" className="h-11" onClick={() => setChoice(false)}>
            Fechar
          </Button>
        </section>
      ) : null}
    </>
  );
}

function RememberRow({ remembered, standalone, onRemembered }: { remembered: boolean; standalone: boolean; onRemembered: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  if (remembered) {
    return (
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">Aparelho conectado</h2>
        <p className="text-xs text-[#3A4542]">Fica conectado por 30 dias desde o último uso. Saindo da conta, isso acaba na hora.</p>
      </div>
    );
  }
  if (!standalone) {
    return (
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">Instale o app</h2>
        <p className="text-xs text-[#3A4542]">No site, a sessão termina depois de 12 h sem uso. Instalado, o aparelho pode ficar conectado por 30 dias.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">Manter este aparelho conectado?</h2>
        <p className="text-xs text-[#3A4542]">Sem isso, a sessão termina depois de 12 h sem uso. Só use em um aparelho que é seu.</p>
      </div>
      <Button
        type="button"
        className="h-11"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const { error: failed } = await rememberThisDevice();
            if (failed) {
              setError("Não foi possível manter o aparelho conectado. Tente de novo.");
              return;
            }
            // Stays open: the notices come next.
            onRemembered();
            router.refresh();
          })
        }
      >
        Manter conectado por 30 dias
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function NoticesRow({
  remembered,
  vapidPublicKey,
  enabled,
  onChange,
}: {
  remembered: boolean;
  vapidPublicKey: string | null;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const support = pushSupport();

  const message = (() => {
    if (!vapidPublicKey) return "Os avisos não estão disponíveis neste ambiente.";
    if (support === "needs-install") return "No iPhone, os avisos só funcionam com o app instalado na Tela de Início.";
    if (support === "unsupported") return "Este navegador não recebe avisos.";
    if (!remembered) return "Com o aparelho conectado, você pode receber um aviso quando um paciente confirmar.";
    if (Notification.permission === "denied" && !enabled) return "As notificações deste app estão bloqueadas nas configurações do aparelho.";
    return null;
  })();

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      setError(undefined);
      try {
        await action();
      } catch {
        setError("Não foi possível mudar os avisos. Confira a conexão e tente de novo.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">Avisos de confirmação</h2>
        <p className="text-xs text-[#3A4542]">
          {message ?? "O aviso diz só o horário, sem o nome do paciente, porque aparece na tela bloqueada. Passa criptografado pelo serviço de notificações do Google ou da Apple."}
        </p>
      </div>
      {message ? null : enabled ? (
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={pending}
          onClick={() =>
            run(async () => {
              await disablePushAction();
              await unsubscribeBrowser();
              onChange(false);
            })
          }
        >
          Desligar avisos
        </Button>
      ) : (
        <Button
          type="button"
          className="h-11"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const subscription = await subscribeBrowser(vapidPublicKey!);
              if (!subscription) {
                setError("Sem a permissão do aparelho, os avisos não chegam.");
                return;
              }
              const { error: refused } = await enablePushAction(subscription.toJSON());
              if (refused) setError(refused);
              else onChange(true);
            })
          }
        >
          Avisar quando um paciente confirmar
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
