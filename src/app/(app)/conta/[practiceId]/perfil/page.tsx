import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { agendaTimeZone } from "@/lib/agenda/agenda";
import { requirePracticePermission } from "@/lib/auth/guard";
import { getGoogleProfile } from "@/lib/google/profile";
import { GoogleProfileSection } from "../profissionais/_profissionais/google-profile";

export const metadata: Metadata = { title: "Meu perfil" };

/** "Meu perfil" (D-23): the professional links their own Google Agenda (PRD 3) and chooses what counts as busy (PRD 5). */
export default async function OwnProfilePage({ params, searchParams }: PageProps<"/conta/[practiceId]/perfil">) {
  const { practiceId } = await params;
  const { google } = await searchParams;
  const context = await requirePracticePermission(practiceId, "google:link-own");
  const own = await context.db.professional.findFirst({ where: { userId: context.user.id }, select: { id: true } });
  if (!own) notFound();
  const profile = await getGoogleProfile(context, own.id);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Meu perfil</h1>
        <p className="text-sm text-muted-foreground">{profile.professional.name}</p>
      </div>
      <GoogleProfileSection
        practiceId={practiceId}
        profile={profile}
        timeZone={await agendaTimeZone(context.db)}
        notice={google === "vinculado" ? "Google Agenda vinculado. O calendário do consultório e os seus compromissos aparecem em instantes." : undefined}
      />
    </div>
  );
}
