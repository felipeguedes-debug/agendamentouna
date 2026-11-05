import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { agendaTimeZone } from "@/lib/agenda/agenda";
import { ownProfessionalIds } from "@/lib/appointments/appointments";
import { requirePracticePermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { todayIn } from "@/lib/dates/zoned";
import { PhoneBlockForm } from "./phone-block-form";

export const metadata: Metadata = { title: "Bloquear horário" };

/** The PWA's Bloquear tab (PRD 11, D-85): a block in the own agenda, from the phone. */
export default async function PhoneBlockPage({ params }: PageProps<"/pwa/[practiceId]/bloquear">) {
  const { practiceId } = await params;
  const context = await requirePracticePermission(practiceId, ["time-blocks:manage", "time-blocks:manage-own"]);
  const { db, access } = context;
  const own = await ownProfessionalIds(context);
  const professionals = await db.professional.findMany({
    where: { active: true, ...(can(access.role, "time-blocks:manage") ? {} : { id: { in: own } }) },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const today = todayIn(await agendaTimeZone(db));
  const defaultProfessional = professionals.find((professional) => own.includes(professional.id))?.id ?? (professionals.length === 1 ? professionals[0].id : "");

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <Link href={`/pwa/${practiceId}`} aria-label="Voltar para a agenda" className="inline-flex size-11 items-center justify-center rounded-lg border border-input bg-white">
          <ChevronLeft aria-hidden className="size-5" />
        </Link>
        <h1 className="text-lg font-semibold">Bloquear horário</h1>
      </div>
      <PhoneBlockForm practiceId={practiceId} professionals={professionals} defaults={{ professionalId: defaultProfessional, date: today, startTime: "", endTime: "", allDay: false, reason: "" }} />
    </main>
  );
}
