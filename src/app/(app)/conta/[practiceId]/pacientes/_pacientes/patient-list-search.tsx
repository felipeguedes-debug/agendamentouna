"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";

const DEBOUNCE_MS = 300;

/** Search as you type, kept in the URL (D-82). Without JavaScript the form still submits. */
export function PatientListSearch({ base, term }: { base: string; term: string }) {
  const router = useRouter();
  const [value, setValue] = useState(term);
  const [pending, startTransition] = useTransition();
  const applied = useRef(term);

  useEffect(() => {
    const text = value.trim();
    if (text === applied.current) return;
    const timer = window.setTimeout(() => {
      applied.current = text;
      startTransition(() => router.replace(text ? `${base}?${new URLSearchParams({ busca: text })}` : base, { scroll: false }));
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [value, base, router]);

  return (
    <form action={base} role="search" aria-busy={pending} className="relative max-w-[420px]">
      <Search aria-hidden className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
      <label htmlFor="patient-list-search" className="sr-only">
        Buscar na lista
      </label>
      <Input id="patient-list-search" name="busca" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Nome ou celular" className="pl-9" autoComplete="off" />
    </form>
  );
}
