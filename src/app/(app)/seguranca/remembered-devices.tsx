"use client";

import { useState, useTransition } from "react";
import { secondaryButtonClass } from "@/components/app-ui";
import { revokeDeviceAction } from "./actions";

export type DeviceRow = { id: string; label: string; lastUsed: string; current: boolean };

/** The devices that stay signed in for 30 days, each with its way out (D-77). */
export function RememberedDevices({ devices }: { devices: DeviceRow[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <section aria-labelledby="dispositivos" data-testid="remembered-devices" className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 id="dispositivos" className="text-base font-semibold text-zinc-900">
        Aparelhos conectados por 30 dias
      </h2>
      <p className="mt-1 text-sm text-zinc-600">Perdeu o celular? Encerre aqui. A sessão e os avisos daquele aparelho acabam na hora.</p>
      <ul className="mt-4 divide-y divide-zinc-200 rounded-md border border-zinc-200">
        {devices.map((device) => (
          <li key={device.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span>
              <span className="font-medium text-zinc-900">{device.label}</span>
              {device.current ? <span className="text-zinc-600"> · este aparelho</span> : null}
              <span className="block text-xs text-zinc-500">Último uso em {device.lastUsed}</span>
            </span>
            <button
              type="button"
              disabled={pending}
              className={secondaryButtonClass}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await revokeDeviceAction(device.id);
                  } catch {
                    setError("Não foi possível encerrar. Tente de novo.");
                    return;
                  }
                  if (device.current) window.location.replace("/login");
                })
              }
            >
              Encerrar
            </button>
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
