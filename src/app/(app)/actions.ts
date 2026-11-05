"use server";

import { redirect } from "next/navigation";
import { getPracticeAccess } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/guard";
import { rememberPractice } from "@/lib/auth/last-practice";
import { samePlaceIn } from "./conta/sections";

/** Practice selector (PRD 3, req. 2): another practice, same session, no logout. */
export async function switchPractice(formData: FormData) {
  const practiceId = String(formData.get("practiceId") ?? "");
  const segment = String(formData.get("section") ?? "") || null;
  const user = await requireUser();
  const access = await getPracticeAccess(user.id, practiceId);
  if (!access) redirect("/");
  await rememberPractice(practiceId);
  redirect(samePlaceIn(practiceId, access.role, segment));
}
