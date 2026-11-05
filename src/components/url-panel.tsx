"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";

/**
 * A side panel over the screen it came from, with its state in the URL (D-41, D-83):
 * the page renders it on the server, after its checks, when the parameter is there
 * (D-72), and closing goes to the same screen without the parameter.
 */
export function UrlPanel({
  title,
  description,
  closeHref,
  header,
  footer,
  children,
}: {
  title: string;
  description?: ReactNode;
  closeHref: string;
  /** Replaces the title block when the panel has its own heading (the appointment). */
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <Dialog.Root open onOpenChange={(open) => !open && startTransition(() => router.push(closeHref, { scroll: false }))}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-900/35" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[500px] flex-col bg-white shadow-2xl outline-none"
        >
          {header ? (
            <>
              <Dialog.Title className="sr-only">{title}</Dialog.Title>
              {header}
            </>
          ) : (
            <div className="flex items-start gap-3 border-b border-[#EEF1F0] px-5 py-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
                {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
              </div>
              <PanelClose href={closeHref} />
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="flex flex-wrap items-center gap-2.5 border-t border-[#EEF1F0] px-5 py-3.5">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function PanelClose({ href }: { href: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-label="Fechar"
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-input text-[#3A4542] hover:bg-muted"
    >
      <X aria-hidden className="size-4" />
    </Link>
  );
}
