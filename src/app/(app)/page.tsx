import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listPracticeAccess } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/guard";
import { lastPractice } from "@/lib/auth/last-practice";
import { ROLE_LABELS } from "@/lib/domain/labels";
import { SignOutButton } from "@/components/sign-out-button";
import { AuthCard } from "@/components/app-ui";
import { switchPractice } from "./actions";

export const metadata: Metadata = { title: "Contas" };

/** Opens the last practice used, or the only one; otherwise lets the user choose (D-39). */
export default async function HomePage() {
  const user = await requireUser();
  const practices = await listPracticeAccess(user.id);
  const last = await lastPractice();
  const target = practices.find((access) => access.practiceId === last) ?? (practices.length === 1 ? practices[0] : undefined);
  if (target) redirect(`/conta/${target.practiceId}`);

  return (
    <AuthCard title="Escolha a conta" subtitle={`Olá, ${user.name.split(" ")[0]}.`}>
      {practices.length === 0 ? (
        <p className="text-sm text-zinc-700">
          Você ainda não tem acesso a nenhuma conta. Peça um convite a quem administra o consultório.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200">
          {practices.map((access) => (
            <li key={access.practiceId}>
              <form action={switchPractice}>
                <input type="hidden" name="practiceId" value={access.practiceId} />
                <button type="submit" className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-zinc-50">
                  <span className="font-medium text-zinc-900">{access.practiceName}</span>
                  <span className="text-xs text-zinc-500">{ROLE_LABELS[access.role]}</span>
                </button>
              </form>
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
