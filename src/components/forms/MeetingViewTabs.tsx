"use client";

// Los tres botones que eligen qué reuniones se ven: entre semana, fin de
// semana o todas.
//
// Van por la URL (?dia=…) para que la elección sobreviva al refresco
// automático de la pantalla, pero navegan con el router en vez de con un
// enlace normal: así se puede avisar de que se están trayendo los datos y
// bloquear los tres botones mientras tanto, que es lo que evita los clics
// repetidos cuando la lista tarda.

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

export type VistaReuniones = {
  /** "JUEVES" | "SABADO" | "TODAS" */
  key: string;
  label: string;
  /** Cuántas reuniones hay de ese tipo. */
  n: number;
};

export function MeetingViewTabs({
  vistas,
  actual,
}: {
  vistas: VistaReuniones[];
  /** La vista elegida ahora, o null si no hay ninguna. */
  actual: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Cuál se pulsó: solo ese enseña el "Cargando…".
  const [pulsado, setPulsado] = useState<string | null>(null);

  const ir = (key: string, activo: boolean) => {
    setPulsado(key);
    startTransition(() => {
      router.push(activo ? "/reuniones" : `/reuniones?dia=${key}`);
    });
  };

  return (
    <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3 sm:px-5">
      {vistas.map((b) => {
        const activo = actual === b.key;
        const cargando = pending && pulsado === b.key;
        return (
          <button
            key={b.key}
            type="button"
            // Mientras se trae una lista no se admite otro clic: ni en el
            // mismo botón ni en los otros dos.
            disabled={pending}
            aria-busy={cargando}
            aria-pressed={activo}
            onClick={() => ir(b.key, activo)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-wait",
              activo
                ? "border-primary bg-primary text-white"
                : "border-border bg-surface text-foreground hover:bg-slate-50",
              pending && !cargando ? "opacity-60" : "",
            )}
          >
            {cargando ? (
              <>
                <span
                  aria-hidden
                  className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
                Cargando…
              </>
            ) : (
              <>
                {b.label}
                <span
                  className={cn(
                    "tabular-nums",
                    activo ? "text-white/80" : "text-muted",
                  )}
                >
                  {b.n}
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
