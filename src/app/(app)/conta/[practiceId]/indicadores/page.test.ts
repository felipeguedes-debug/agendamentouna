import { isValidElement, type ReactNode } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { addMember, addOrganizationAdmin, createPractice, createUser, interruption, setRequestCookie, signIn } from "../../../../../../tests/helpers/auth";
import IndicatorsPage from "./page";

vi.mock("next/headers");

// The panel of PRD 8 is for whoever has reports:practice: manager and admin. The
// secretary's day and week and the professional's own numbers are on the agenda's
// panel (D-74). The consolidated view of the organization is the admin's alone.

let organizationId: string;
let practiceId: string;

beforeAll(async () => {
  ({ organizationId, practiceId } = await createPractice("Consultório Painel"));
  await createPractice("Clínica Irmã Painel", { organizationId });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const open = () => IndicatorsPage({ params: Promise.resolve({ practiceId }), searchParams: Promise.resolve({}) });

async function openAs(role: Role, target = practiceId) {
  const user = await createUser("indicators-screen");
  await addMember(user.id, target, role);
  await setRequestCookie(await signIn(user.email));
  return interruption(open());
}

/** The text of a server-rendered tree, for what the page itself puts on screen. */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (!isValidElement(node)) return "";
  const props = node.props as { children?: ReactNode; label?: unknown; title?: unknown; description?: unknown; value?: unknown; detail?: ReactNode };
  if (typeof node.type === "function") {
    // Only this page's own components, which are plain functions; the rest is its markup.
    const name = (node.type as { name?: string }).name ?? "";
    if (["Tile", "Section", "StatusTag"].includes(name)) return textOf((node.type as (props: unknown) => ReactNode)(node.props));
  }
  return textOf(props.children);
}

describe("indicators screen", () => {
  it("opens for the manager and the organization admin", async () => {
    expect(await openAs("PRACTICE_MANAGER")).toBe("rendered");
    const admin = await createUser("indicators-admin");
    await addOrganizationAdmin(admin.id, organizationId);
    await setRequestCookie(await signIn(admin.email));
    expect(await interruption(open())).toBe("rendered");
  });

  it("is forbidden to the secretary and the professional", async () => {
    expect(await openAs("SECRETARY")).toBe("forbidden");
    expect(await openAs("PROFESSIONAL")).toBe("forbidden");
  });

  it("does not exist for a member of another practice", async () => {
    const other = (await createPractice("Outra conta painel")).practiceId;
    expect(await openAs("PRACTICE_MANAGER", other)).toBe("not-found");
  });

  it("shows no number for what was never measured", async () => {
    const manager = await createUser("indicators-empty");
    await addMember(manager.id, practiceId, "PRACTICE_MANAGER");
    await setRequestCookie(await signIn(manager.email));
    const text = textOf(await open());
    expect(text).toContain("Taxa de falta");
    expect(text).toContain("Sem dados");
    expect(text).not.toContain("NaN");
    // A measured zero would read " 0%"; the targets ("abaixo de 10%") do not.
    expect(text).not.toContain(" 0%");
  });

  it("shows the organization's practices to the admin and never to a manager", async () => {
    const manager = await createUser("indicators-manager-org");
    await addMember(manager.id, practiceId, "PRACTICE_MANAGER");
    await setRequestCookie(await signIn(manager.email));
    expect(textOf(await open())).not.toContain("Clínica Irmã Painel");

    const admin = await createUser("indicators-admin-org");
    await addOrganizationAdmin(admin.id, organizationId);
    await setRequestCookie(await signIn(admin.email));
    expect(textOf(await open())).toContain("Clínica Irmã Painel");
  });
});
