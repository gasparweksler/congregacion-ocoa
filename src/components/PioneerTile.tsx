"use client";

import { useState } from "react";
import { Card, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { NameEntry } from "@/lib/stats";

// Agrupa las entradas por grupo, preservando el orden ya ordenado.
function groupByGroup(names: NameEntry[]): { group: string; items: string[] }[] {
  const out: { group: string; items: string[] }[] = [];
  for (const n of names) {
    const last = out[out.length - 1];
    if (last && last.group === n.group) last.items.push(n.name);
    else out.push({ group: n.group, items: [n.name] });
  }
  return out;
}

// Recuadro de precursores con título clicable que abre un modal con la lista
// de nombres agrupados por grupo. Mismo estilo que el resto de los recuadros.
export function PioneerTile({
  label,
  count,
  hours,
  bibleStudies,
  names,
  sections,
  tone = "violet",
}: {
  label: string;
  count: number;
  hours: number;
  bibleStudies: number;
  names: NameEntry[];
  /** División opcional del recuadro: cada fila con su propio ojo. */
  sections?: { label: string; value: number; names: NameEntry[] }[];
  tone?: "violet" | "amber";
}) {
  const [open, setOpen] = useState(false);
  // Fila de la división cuyos nombres están desplegados (o null).
  const [openSection, setOpenSection] = useState<number | null>(null);
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
      <dl className="mt-3 divide-y divide-border border-t border-border text-sm">
        <div className="flex items-baseline justify-between gap-3 py-2">
          <dt className="text-muted">Horas de predicación</dt>
          <dd className="font-semibold tabular-nums text-foreground">
            {hours}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-2">
          <dt className="text-muted">Cursos bíblicos</dt>
          <dd className="font-semibold tabular-nums text-foreground">
            {bibleStudies}
          </dd>
        </div>

        {/* División del recuadro: cada fila despliega sus nombres con el ojo. */}
        {(sections ?? []).map((s, i) => {
          const isOpen = openSection === i;
          return (
            <div key={i} className="py-2">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">{s.label}</dt>
                <dd className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums text-foreground">
                    {s.value}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpenSection(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    aria-label={
                      isOpen
                        ? `Ocultar nombres de ${s.label}`
                        : `Ver nombres de ${s.label}`
                    }
                    title={isOpen ? "Ocultar nombres" : "Ver nombres"}
                    className="rounded-md border border-border px-1.5 py-0.5 text-xs text-muted transition-colors hover:bg-slate-50 hover:text-foreground"
                  >
                    <span aria-hidden>{isOpen ? "🙈" : "👁️"}</span>
                  </button>
                </dd>
              </div>
              {isOpen ? (
                <div className="mt-2 space-y-2 rounded-lg bg-slate-50 px-3 py-2">
                  {s.names.length === 0 ? (
                    <p className="text-xs text-muted">
                      Nadie en esta categoría.
                    </p>
                  ) : (
                    groupByGroup(s.names).map((g, gi) => (
                      <div key={gi}>
                        <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-primary">
                          {g.group}
                        </p>
                        <ol className="mt-0.5 space-y-1">
                          {g.items.map((n, j) => (
                            <li
                              key={j}
                              className="flex items-center gap-2 text-sm text-foreground"
                            >
                              <span className="w-6 shrink-0 text-right tabular-nums text-muted">
                                {j + 1}.
                              </span>
                              {n}
                            </li>
                          ))}
                        </ol>
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
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
            <div className="max-h-[55vh] space-y-3 overflow-y-auto px-5 py-3">
              {names.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">
                  No hay publicadores en esta categoría.
                </p>
              ) : (
                groupByGroup(names).map((g, gi) => (
                  <div key={gi}>
                    <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-primary">
                      {g.group}
                    </p>
                    <ol className="mt-0.5 space-y-1">
                      {g.items.map((n, i) => (
                        <li
                          key={i}
                          className="flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm odd:bg-slate-50"
                        >
                          <span className="w-6 shrink-0 text-right tabular-nums text-muted">
                            {i + 1}.
                          </span>
                          <span className="font-medium text-foreground">
                            {n}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))
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
