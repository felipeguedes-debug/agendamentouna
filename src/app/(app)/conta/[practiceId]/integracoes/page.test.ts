import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { addMember, addOrganizationAdmin, createPractice, createUser, enableTwoFactor, interruption, setRequestCookie, signIn } from "../../../../../../tests/helpers/auth";
import SettingsPage from "./page";

vi.mock("next/headers");

// The FlwChat token is for the manager (PRD 11, D-23). Renders the real page with each
// user's session cookie.

let organizationId: string;
let practiceId: string;

beforeAll(async () => {
  ({ organizationId, practiceId } = await createPractice("Consultório Configurações"));
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function openAs(setup: (userId: string) => Promise<unknown>) {
  const user = await createUser("settings-screen");
  await setup(user.id);
  await setRequestCookie(await signIn(user.email));
  return interruption(SettingsPage({ params: Promise.resolve({ practiceId }), searchParams: Promise.resolve({}) }));
}

const asMember = (role: Role) => (userId: string) => addMember(userId, practiceId, role);

describe("settings screen", () => {
  it("is forbidden to the secretary and the professional", async () => {
    expect(await openAs(asMember("SECRETARY"))).toBe("forbidden");
    expect(await openAs(asMember("PROFESSIONAL"))).toBe("forbidden");
  });

  it("opens for the manager and the organization admin", async () => {
    expect(await openAs(asMember("PRACTICE_MANAGER"))).toBe("rendered");
    expect(await openAs((userId) => addOrganizationAdmin(userId, organizationId))).toBe("rendered");
  });

  it("does not exist for a manager of another practice", async () => {
    const other = await createPractice("Outro consultório");
    expect(await openAs((userId) => addMember(userId, other.practiceId, "PRACTICE_MANAGER"))).toBe("not-found");
  });
});

// The warning has to be on the screen before the manager switches it on (D-36, D-71).
describe("two-factor requirement on the settings screen", () => {
  async function pageAs(practice: string, options: { twoFactor?: boolean } = {}) {
    const user = await createUser("settings-2fa");
    await addMember(user.id, practice, "PRACTICE_MANAGER");
    const cookie = await signIn(user.email);
    await setRequestCookie(options.twoFactor ? (await enableTwoFactor(cookie)).cookie : cookie);
    return renderToStaticMarkup(await SettingsPage({ params: Promise.resolve({ practiceId: practice }), searchParams: Promise.resolve({}) }));
  }

  it("warns the manager who has not set it up that they go to the security page too", async () => {
    const practice = (await createPractice("Gestor sem verificação")).practiceId;

    const html = await pageAs(practice);

    expect(html).toContain(">Não exigida<");
    expect(html).toContain("Você ainda não ativou");
    expect(html).toContain('href="/seguranca"');
    expect(html).toContain("Exigir verificação em duas etapas");
    expect(html).not.toContain("Deixar de exigir");
  });

  it("warns what happens to the others, and names who has not set it up", async () => {
    const practice = (await createPractice("Secretária sem verificação")).practiceId;
    const secretary = await createUser("settings-2fa-secretary");
    await addMember(secretary.id, practice, "SECRETARY");

    const html = await pageAs(practice, { twoFactor: true });

    expect(html).not.toContain("Você ainda não ativou");
    expect(html).toContain("em toda página");
    expect(html).toContain("qualquer conta");
    expect(html).toContain(secretary.name);
  });

  it("says so when everyone has set it up", async () => {
    const practice = (await createPractice("Todos com verificação")).practiceId;

    const html = await pageAs(practice, { twoFactor: true });

    expect(html).toContain("Todos nesta conta já ativaram");
  });

  it("offers to switch it off where it is required, and still names who is missing", async () => {
    const practice = (await createPractice("Já exigida", { requireTwoFactor: true })).practiceId;
    const secretary = await createUser("settings-2fa-blocked");
    await addMember(secretary.id, practice, "SECRETARY");

    const html = await pageAs(practice, { twoFactor: true });

    expect(html).toContain(">Exigida<");
    expect(html).toContain("Deixar de exigir");
    expect(html).not.toContain("Exigir verificação em duas etapas");
    expect(html).toContain(secretary.name);
  });

  it("sends the manager who has not set it up to the security page once it is required", async () => {
    const practice = (await createPractice("Exigida sem verificação", { requireTwoFactor: true })).practiceId;
    const manager = await createUser("settings-2fa-locked");
    await addMember(manager.id, practice, "PRACTICE_MANAGER");
    await setRequestCookie(await signIn(manager.email));

    expect(await interruption(SettingsPage({ params: Promise.resolve({ practiceId: practice }), searchParams: Promise.resolve({}) }))).toBe("redirect:/seguranca");
  });
});
