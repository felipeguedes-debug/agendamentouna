import Link from "next/link";
import { Button } from "@/components/ui/button";
import { acceptEntryNotice } from "./actions";

/**
 * The notice over the login (D-106), until the device agrees to the current terms and policy.
 * "Concordo", not "autorizo": the agenda rests on the contract (D-19), and a consent asked as
 * the price of entry may not be valid under the LGPD. The texts are still provisional (D-38,
 * D-99), and the notice says so.
 *
 * Rendered by the server, with a form and a link: no script of its own, nothing for the
 * security policy to refuse (D-102), and no flash of the login before it. "Não concordo" is
 * in the URL, as the other panels (D-83). The page keeps the login inert behind it.
 */
export function EntryNotice({ next, declined }: { next: string | undefined; declined: boolean }) {
  const declineHref = `/login?${new URLSearchParams({ aviso: "recusado", ...(next ? { next } : {}) })}`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-zinc-950/40 px-4 py-10">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="aviso-titulo"
        aria-describedby="aviso-texto"
        className="flex w-full max-w-[400px] flex-col gap-5 rounded-[18px] bg-white p-6 shadow-[0_16px_48px_rgba(15,23,42,0.18)] sm:p-7"
      >
        <div className="flex flex-col gap-2">
          <h2 id="aviso-titulo" className="text-lg font-semibold">
            Antes de entrar
          </h2>
          <p id="aviso-texto" className="text-sm leading-6 text-[#3A4542]">
            Para usar a Agenda, leia e concorde com os{" "}
            <Link href="/termos" className="font-medium text-primary hover:underline">
              Termos de uso
            </Link>{" "}
            e a{" "}
            <Link href="/privacidade" className="font-medium text-primary hover:underline">
              Política de privacidade
            </Link>
            .
          </p>
          <p className="text-xs leading-5 text-muted-foreground">Os dois textos ainda são provisórios. Quando mudarem, este aviso aparece de novo.</p>
        </div>

        {declined ? (
          <p role="status" className="rounded-lg border bg-muted px-3 py-2 text-sm leading-6">
            Sem o aceite, não é possível entrar. Se tiver dúvidas, fale com o consultório que enviou o seu convite.
          </p>
        ) : null}

        <form action={acceptEntryNotice} className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          {declined ? null : (
            <Button asChild variant="outline" size="lg" className="px-4">
              <Link href={declineHref}>Não concordo</Link>
            </Button>
          )}
          <Button type="submit" size="lg" className="px-4" autoFocus>
            Li e concordo
          </Button>
        </form>
      </div>
    </div>
  );
}
