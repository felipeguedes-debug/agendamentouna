"use client";

import { useStandalone } from "@/components/pwa/device";

/**
 * How to install, while this is still a browser tab. Text and not a button: only Chromium
 * has an install prompt to trigger, and the Next.js guide advises against relying on it.
 */
export function InstallHint() {
  const standalone = useStandalone();
  if (standalone) return null;
  return (
    <aside data-testid="install-hint" className="rounded-xl border border-[#E3E8E6] bg-white p-4 text-xs text-[#3A4542]">
      <h2 className="mb-1 text-sm font-semibold text-[#1A1F1E]">Instale no celular</h2>
      <p>
        <strong>Android:</strong> no menu do Chrome, toque em Instalar app.
      </p>
      <p>
        <strong>iPhone:</strong> no Safari, toque em Compartilhar e depois em Adicionar à Tela de Início.
      </p>
    </aside>
  );
}
