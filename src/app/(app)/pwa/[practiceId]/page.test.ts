import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { forPractice, prisma } from "@/lib/db";
import { addMember, createPractice, createUser, interruption, setRequestCookie, signIn } from "../../../../../tests/helpers/auth";
import PwaEntryPage from "../page";
import ProfessionalDayPage from "./page";

vi.mock("next/headers");

// The professional's PWA (D-76). Permission and scope are the agenda's (D-40). A
// secretary who opens it finds no agenda to show and no patient of the practice.

let practiceId: string;

beforeAll(async () => {
  ({ practiceId } = await createPractice("Consultório PWA"));
});

afterAll(async () => {
  await prisma.$disconnect();
});

const openDay = (target = practiceId) => ProfessionalDayPage({ params: Promise.resolve({ practiceId: target }), searchParams: Promise.resolve({}) });

async function professional(target = practiceId) {
  const user = await createUser("pwa-professional");
  await addMember(user.id, target, "PROFESSIONAL");
  await forPractice(target).professional.create({ data: { practiceId: target, name: `Dra. ${user.name}`, userId: user.id } });
  return user;
}

describe("day screen", () => {
  it("opens for the professional", async () => {
    const user = await professional();
    await setRequestCookie(await signIn(user.email));
    expect(await interruption(openDay())).toBe("rendered");
  });

  it("does not exist for someone of another practice", async () => {
    const other = (await createPractice("Outra PWA")).practiceId;
    const user = await professional(other);
    await setRequestCookie(await signIn(user.email));
    expect(await interruption(openDay())).toBe("not-found");
  });

  it("sends a visitor to the login", async () => {
    await setRequestCookie("");
    expect(await interruption(openDay())).toBe("redirect:/login");
  });

  it("has no agenda for a secretary", async () => {
    const user = await createUser("pwa-secretary");
    await addMember(user.id, practiceId, "SECRETARY");
    await setRequestCookie(await signIn(user.email));
    const page = await openDay();
    // The card that says this screen is the professional's, with no list inside.
    expect((page as { props: { title: string } }).props.title).toBe("Esta tela é do profissional");
  });
});

describe("entry of the installed app", () => {
  it("goes straight to the day of the only practice", async () => {
    const user = await professional();
    await setRequestCookie(await signIn(user.email));
    expect(await interruption(PwaEntryPage())).toBe(`redirect:/pwa/${practiceId}`);
  });

  it("lets someone who attends in two practices choose", async () => {
    const other = (await createPractice("Segunda PWA")).practiceId;
    const user = await professional();
    await addMember(user.id, other, "PROFESSIONAL");
    await forPractice(other).professional.create({ data: { practiceId: other, name: "Dra. Dois", userId: user.id } });
    await setRequestCookie(await signIn(user.email));
    expect(await interruption(PwaEntryPage())).toBe("rendered");
  });

  it("explains itself to someone who does not attend", async () => {
    const user = await createUser("pwa-no-professional");
    await addMember(user.id, practiceId, "SECRETARY");
    await setRequestCookie(await signIn(user.email));
    expect(await interruption(PwaEntryPage())).toBe("rendered");
  });
});
