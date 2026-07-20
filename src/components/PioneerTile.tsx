"use client";

import { useState } from "react";
import { Card, Button } from "@/components/ui";
import { cn } from "@/lib/cn";

// Recuadro de precursores con título clicable que abre un modal con la lista
// de nombres. Mantiene el mismo estilo visual que el resto de los recuadros.
export function PioneerTile({
  label,
  count,
  hours,
  bibleStudies,
  names,
  tone = "violet",
}: {
  label: string;
  count: number;
  hours: number;
  bibleStudies: number;
  names: string[];
  tone?: "violet" | "amber";
}) {
  const [open, setOpen] = useState(false);
  const accent = tone === "amber" ? "text-amber-600" : "text-violet-600";

  return (
    <Card className="p-4">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex items-center gap-1.5 text-left text-sm text-muted underline-offset-2 hover:text-primary hover:underline focus:outline-none focus-visible:underline"
        title="Ver la lista de nombres"
      >
        {label}
        <span aria-hidden className="text-xs opacity-60 group-hover:opacity-100">
          👁️
        </span>
      </button>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", accent)}>
        {count}
      </p>
      <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Horas de predicación</dt>
          <dd className="font-semibold tabular-nums text-foreground">
            {hours}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Cursos bíblicos</dt>
          <dd className="font-semibold tabular-nums text-foreground">
            {bibleStudies}
          </dd>
        </div>
      </dl>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-md overflow-hidden rounded-2xl bg-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                {label}
              </h3>
              <p className="mt-0.5 text-sm text-muted">
                {count} publicador(es)
              </p>
            </div>
            <div className="max-h-[55vh] overflow-y-auto px-5 py-3">
              {names.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">
                  No hay publicadores en esta categoría.
                </p>
              ) : (
                <ol className="space-y-1">
                  {names.map((n, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm odd:bg-slate-50"
                    >
                      <span className="w-6 shrink-0 text-right tabular-nums text-muted">
                        {i + 1}.
                      </span>
                      <span className="font-medium text-foreground">{n}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="flex justify-end border-t border-border px-5 py-3">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
