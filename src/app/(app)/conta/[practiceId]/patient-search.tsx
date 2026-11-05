"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { practicePath } from "../sections";
import { findPatientsAction } from "./pacientes/actions";

type Found = Awaited<ReturnType<typeof findPatientsAction>>[number];

const DEBOUNCE_MS = 250;
const MIN_TERM = 2;

/** The patient search on every screen (D-81): results as you type, Enter opens the full list. */
export function PatientSearch({ practiceId }: { practiceId: string }) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const latest = useRef(0);

  useEffect(() => {
    const text = term.trim();
    const request = ++latest.current;
    if (text.length < MIN_TERM) return;
    const timer = window.setTimeout(async () => {
      const found = await findPatientsAction(practiceId, text).catch(() => []);
      if (request === latest.current) setResults(found);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [term, practiceId]);

  useEffect(() => {
    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, []);

  const showing = open && term.trim().length >= MIN_TERM;
  const clear = () => {
    setOpen(false);
    setTerm("");
    setResults([]);
  };

  return (
    <div ref={box} role="search" className="relative">
      <Search aria-hidden className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const text = term.trim();
          clear();
          router.push(`${practicePath(practiceId, "pacientes")}${text ? `?busca=${encodeURIComponent(text)}` : ""}`);
        }}
      >
        <Input
          type="search"
          aria-label="Buscar paciente"
          placeholder="Buscar paciente por nome ou celular"
          autoComplete="off"
          className="h-9 pl-9"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        />
      </form>
      {showing ? (
        <div className="absolute top-full right-0 left-0 z-50 mt-1.5 rounded-xl border border-border bg-white p-1.5 shadow-lg">
          {results.length === 0 ? (
            <p className="px-2.5 py-2 text-sm text-muted-foreground">Nenhum paciente encontrado.</p>
          ) : (
            <ul>
              {results.map((patient) => (
                <li key={patient.id}>
                  <Link href={`${practicePath(practiceId, "pacientes")}/${patient.id}`} onClick={clear} className="flex flex-col rounded-lg px-2.5 py-1.5 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
                    <span className="text-sm font-medium">{patient.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {patient.phone ?? "Sem celular"} · {patient.insurance}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
