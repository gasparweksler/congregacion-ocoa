"use client";

import { useState, useTransition } from "react";
import { setMeetingConfirmadorAction } from "@/server/meeting-actions";

// Desplegable para asignar el Responsable de Confirmación de una reunión desde
// la lista. Al seleccionar, guarda automáticamente y sincroniza (revalidate).
export function ConfirmadorSelect({
  meetingId,
  current,
  options,
}: {
  meetingId: string;
  current: string;
  options: string[];
}) {
  const [value, setValue] = useState(current);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  // Si el valor actual no está en la lista (texto antiguo), lo incluimos para
  // no perderlo.
  const list = options.includes(current) || !current
    ? options
    : [current, ...options];

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span aria-hidden>🧑‍💼</span>
      Confirma:
      <select
        value={value}
        disabled={pending}
        onChange={(e) => {
          const name = e.target.value;
          setValue(name);
          setSaved(false);
          startTransition(async () => {
            await setMeetingConfirmadorAction(meetingId, name);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          });
        }}
        className="max-w-[12rem] rounded-lg border border-border bg-white px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-60"
      >
        <option value="">— Sin asignar —</option>
        {list.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      {pending ? <span className="text-muted">Guardando…</span> : null}
      {saved ? <span className="text-emerald-600">✓ Guardado</span> : null}
    </span>
  );
}
