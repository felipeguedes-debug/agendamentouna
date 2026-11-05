import type { Metadata } from "next";
import Link from "next/link";
import { isTwoFactorRequired } from "@/lib/auth/access";
import { listRememberedDevices } from "@/lib/auth/devices";
import { getCurrentSession, requireUser } from "@/lib/auth/guard";
import { DEFAULT_TIME_ZONE } from "@/lib/dates/zoned";
import { SignOutButton } from "@/components/sign-out-button";
import { Alert, linkClass, PageHeader } from "@/components/app-ui";
import { RememberedDevices } from "./remembered-devices";
import { TwoFactorSettings } from "./two-factor-settings";

export const metadata: Metadata = { title: "Segurança" };

/** Two-factor setup. Optional for anyone; mandatory when a practice of the user requires it (D-16). */
export default async function SecurityPage() {
  const user = await requireUser({ allowMissingTwoFactor: true });
  const required = await isTwoFactorRequired(user.id);
  const blocked = required && !user.twoFactorEnabled;
  const devices = await listRememberedDevices(user.id, (await getCurrentSession())?.session.id);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <div className="mb-6 flex items-center justify-between text-sm">
        {blocked ? <span /> : (
          <Link href="/" className={linkClass}>
            ← Voltar para a agenda
          </Link>
        )}
        <SignOutButton />
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <PageHeader
          title="Verificação em duas etapas"
          description="Além da senha, o login pede um código de 6 dígitos gerado por um aplicativo autenticador no seu celular (Google Authenticator, Microsoft Authenticator, 1Password e outros)."
        />
        {blocked ? (
          <div className="mb-6">
            <Alert tone="info">
              Uma das contas em que você trabalha exige verificação em duas etapas. Ative para continuar usando a agenda.
            </Alert>
          </div>
        ) : null}
        <TwoFactorSettings enabled={user.twoFactorEnabled} required={required} />
      </div>
      {devices.length > 0 ? (
        <RememberedDevices devices={devices.map(({ lastUsedAt, ...device }) => ({ ...device, lastUsed: lastUsedAt.toLocaleDateString("pt-BR", { timeZone: DEFAULT_TIME_ZONE }) }))} />
      ) : null}
    </main>
  );
}
