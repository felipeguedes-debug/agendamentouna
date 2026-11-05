import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthCard } from "@/components/app-ui";
import { googleMode } from "@/lib/google";
import { SandboxConsentForm } from "./sandbox-consent-form";

export const metadata: Metadata = { title: "Google de teste", robots: { index: false } };

/**
 * The consent screen of the sandbox Google (D-58), outside production only: the
 * developer types the fake Google account, and the browser goes back to the
 * callback with a code naming it, as Google would.
 */
export default async function SandboxConsentPage({ searchParams }: PageProps<"/google/sandbox">) {
  if (googleMode() !== "sandbox") notFound();
  const { state, redirect_uri: redirectUri, login_hint: loginHint } = await searchParams;
  if (typeof state !== "string" || typeof redirectUri !== "string") notFound();
  return (
    <AuthCard title="Google de teste (sandbox)" subtitle="Nenhum Google de verdade é usado neste ambiente.">
      <SandboxConsentForm state={state} redirectUri={redirectUri} loginHint={typeof loginHint === "string" ? loginHint : ""} />
    </AuthCard>
  );
}
