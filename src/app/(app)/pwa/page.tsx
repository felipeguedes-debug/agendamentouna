import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard, linkClass } from "@/components/app-ui";
import { SignOutButton } from "@/components/sign-out-button";
import { listProfessionalAccess } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Agenda do dia" };

/** Where the installed app opens (start_url): the day of the only practice, or the choice among them (D-76). */
export default async function PwaEntryPage() {
  const user = await requireUser();
  const practices = await listProfessionalAccess(user.id);
  if (practices.length === 1) redirect(`/pwa/${practices[0].practiceId}`);

  return (
    <AuthCard title={practices.length === 0 ? "Este app é do profissional" : "Escolha a conta"} subtitle={`Olá, ${user.name.split(" ")[0]}.`}>
      {practices.length === 0 ? (
        <p className="text-sm text-zinc-700">
          Seu usuário não está ligado a um profissional. A agenda da conta continua no{" "}
          <Link href="/" className={linkClass}>
            site
          </Link>
          .
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200">
          {practices.map((access) => (
            <li key={access.practiceId}>
              <Link href={`/pwa/${access.practiceId}`} className="flex min-h-11 items-center px-4 py-3 font-medium text-zinc-900 hover:bg-zinc-50">
                {access.practiceName}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6 text-right">
        <SignOutButton />
      </div>
    </AuthCard>
  );
}
