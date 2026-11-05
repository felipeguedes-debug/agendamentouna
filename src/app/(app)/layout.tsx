import type { ReactNode } from "react";
import { SessionKeepAlive } from "@/components/session-keep-alive";

// Every page below checks the session before rendering (src/lib/auth/guard.ts), and
// nothing streams before that check, so redirect(), notFound() and forbidden() answer
// with their real HTTP status. A <Suspense> or loading.tsx above a check would fix the
// status at 200 (D-72, e2e/status.spec.ts).
export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SessionKeepAlive />
      {children}
    </>
  );
}
