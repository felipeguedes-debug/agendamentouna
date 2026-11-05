import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { agendaTimeZone } from "@/lib/agenda/agenda";
import { AgendaError } from "@/lib/agenda/errors";
import { requirePracticePermission } from "@/lib/auth/guard";
import { invitableRoles } from "@/lib/auth/permissions";
import { getWhatsappInstanceSetup } from "@/lib/cadence/instance-setup";
import { getGoogleProfile } from "@/lib/google/profile";
import { messagingMode } from "@/lib/messaging";
import { getProfessionalSetup } from "@/lib/professionals/professionals";
import { GoogleProfileSection } from "../_profissionais/google-profile";
import { ProfessionalSetup } from "../_profissionais/professional-setup";
import { WhatsappSection } from "../_profissionais/whatsapp-section";

export const metadata: Metadata = { title: "Profissional" };

/** A professional's profile for the manager (D-23, D-91): name, locations, WhatsApp (D-94) and the Google link, without the professional's calendar names. */
export default async function ProfessionalPage({ params }: PageProps<"/conta/[practiceId]/profissionais/[professionalId]">) {
  const { practiceId, professionalId } = await params;
  const context = await requirePracticePermission(practiceId, "google:send-link");
  const setup = await getProfessionalSetup(context, professionalId);
  if (!setup) notFound();
  const profile = await getGoogleProfile(context, professionalId).catch((error: unknown) => {
    if (error instanceof AgendaError && error.code === "professional_unavailable") notFound();
    throw error;
  });

  const timeZone = await agendaTimeZone(context.db);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={`/conta/${practiceId}/profissionais`} className="text-sm text-primary hover:underline">
          ← Profissionais
        </Link>
        <h1 className="text-xl font-semibold">
          {setup.name}
          {setup.active ? null : <span className="ml-2 text-sm font-medium text-muted-foreground">Inativo</span>}
        </h1>
      </div>
      <ProfessionalSetup
        practiceId={practiceId}
        professional={setup}
        hoursHref={`/conta/${practiceId}/unidades/horarios?profissional=${setup.id}`}
        inviteHref={invitableRoles(context.access.role).includes("PROFESSIONAL") ? `/conta/${practiceId}/usuarios` : null}
      />
      <WhatsappSection practiceId={practiceId} professionalId={setup.id} setup={await getWhatsappInstanceSetup(context, setup.id)} timeZone={timeZone} sandbox={messagingMode() === "sandbox"} />
      <GoogleProfileSection practiceId={practiceId} profile={profile} timeZone={timeZone} />
    </div>
  );
}
