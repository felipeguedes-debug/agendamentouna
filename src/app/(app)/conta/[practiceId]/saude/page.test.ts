import { isValidElement, type ReactNode } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { forPractice, prisma } from "@/lib/db";
import { addMember, addOrganizationAdmin, createPractice, createUser, interruption, setRequestCookie, signIn } from "../../../../../../tests/helpers/auth";
import HealthPage from "./page";

vi.mock("next/headers");

// The operation's panel (D-101): manager and admin, like the indicators (D-74). The table by
// practice is the admin's alone.

let organizationId: string;
let practiceId: string;

beforeAll(async () => {
  ({ organizationId, practiceId } = await createPractice("Consultório Tela Saúde"));
  await createPractice("Clínica Irmã Tela Saúde", { organizationId });
  await forPractice(practiceId).serverError.create({ data: { practiceId, source: "render", route: "/conta/[practiceId]/regua", errorName: "TypeError" } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const open = () => HealthPage({ params: Promise.resolve({ practiceId }), searchParams: Promise.resolve({}) });

function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (isValidElement(node)) return text((node.props as { children?: ReactNode }).children);
  return "";
}

async function signInAs(role: Role) {
  const user = await createUser("health-screen");
  await addMember(user.id, practiceId, role);
  await setRequestCookie(await signIn(user.email));
}

describe("the operation's panel", () => {
  it("opens for the manager, with the errors of the practice and no table of the others", async () => {
    await signInAs("PRACTICE_MANAGER");
    const page = text(await open());
    expect(page).toContain("Saúde da operação");
    expect(page).not.toContain("Clínica Irmã Tela Saúde");
  });

  it("gives the organization's admin the table by practice", async () => {
    const user = await createUser("health-admin");
    await addOrganizationAdmin(user.id, organizationId);
    await setRequestCookie(await signIn(user.email));
    expect(text(await open())).toContain("Clínica Irmã Tela Saúde");
  });

  it.each(["SECRETARY", "PROFESSIONAL"] as const)("is forbidden to the %s", async (role) => {
    await signInAs(role);
    expect(await interruption(open())).toBe("forbidden");
  });
});
