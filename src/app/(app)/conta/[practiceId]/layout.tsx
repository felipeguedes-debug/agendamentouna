import { listPracticeAccess } from "@/lib/auth/access";
import { requirePracticeAccess } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { ROLE_LABELS } from "@/lib/domain/labels";
import { countPending } from "@/lib/pending/pending";
import { mainSections, settingsGroups, visibleSections } from "../sections";
import { BottomNav, SideMenu, TopBar, type MenuEntry } from "./practice-shell";

// The shell needs the practice and the role. Each page still runs its own check:
// a layout does not re-render on navigation and does not stop its pages from running.
export default async function PracticeLayout({ children, params }: LayoutProps<"/conta/[practiceId]">) {
  const { practiceId } = await params;
  const context = await requirePracticeAccess(practiceId);
  const { user, access } = context;
  const { role } = access;
  const [practices, pending] = await Promise.all([listPracticeAccess(user.id), countPending(context)]);

  const main: MenuEntry[] = mainSections(role).map(({ segment, label }) => ({ segment, label, count: segment === "pendencias" ? pending : undefined }));
  const settings = settingsGroups(role).map(({ group, sections }) => ({ group, sections: sections.map(({ segment, label }) => ({ segment, label })) }));
  const ownProfile = visibleSections(role).some((section) => section.segment === "perfil");
  const attends = can(role, "agenda:view-own");

  return (
    <div className="flex min-h-svh flex-col">
      <TopBar
        practiceId={practiceId}
        practices={practices.map((practice) => ({ practiceId: practice.practiceId, practiceName: practice.practiceName }))}
        userName={user.name}
        roleLabel={ROLE_LABELS[role]}
        canBook={can(role, "appointments:manage")}
        canSearch={can(role, "patients:view")}
        ownProfile={ownProfile}
        phoneApp={attends}
      />
      <div className="flex min-w-0 flex-1">
        <SideMenu practiceId={practiceId} main={main} settings={settings} />
        <main className="relative z-0 mx-auto w-full max-w-[1500px] min-w-0 flex-1 p-4 pb-24 md:p-5">{children}</main>
      </div>
      <BottomNav practiceId={practiceId} main={main} />
    </div>
  );
}
