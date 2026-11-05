import type { ReactNode } from "react";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker";

/**
 * The professional's PWA (PRD 11, D-76), apart from the practice's web header. Every page
 * below checks the session before rendering; nothing here streams before that (D-72).
 */
export default function PwaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-[#F4F6F5]">
      <ServiceWorkerRegistration />
      {children}
    </div>
  );
}
