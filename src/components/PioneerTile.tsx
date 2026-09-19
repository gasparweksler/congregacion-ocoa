"use client";

import { useState } from "react";
import { Card, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { NameEntry } from "@/lib/stats";

// Agrupa las entradas por grupo, preservando el orden ya ordenado.
function groupByGroup(
  names: NameEntry[],
): { group: string; items: NameEntry[] }[] {
  const out: { group: string; items: NameEntry[] }[] = [];
  for (const n of names) {
    const last = out[out.length - 1];
    if (last && last.group === n.group) last.items.push(n);
    else out.push({ group: n.group, items: [n] });
  }
  return out;
}

type TileRow = {
  label: string;
  value: number;
  /** Si viene, la fila lleva un ojo que despliega esta lista. */
  names?: NameEntry[];
};

// Recuadro de precursores con título clicable que abre un modal con la lista
// de nombres agrupados por grupo. Mismo estilo que el resto de los recuadros.
// Horas y Cursos bíblicos llevan un ojo con lo que aportó cada hermano.
export function PioneerTile({
  label,
  count,
  hours,
  bibleStudies,
  names,
  hoursDetail,
  coursesDetail,
  sections,
  tone = "violet",
}: {
  label: string;
  count: number;
  hours: number;
  bibleStudies: number;
  names: NameEntry[];
  /** Horas de cada hermano (se muestran al pulsar el ojo de la fila). */
  hoursDetail?: NameEntry[];
  /** Cursos bíblicos de cada hermano. */
  coursesDetail?: NameEntry[];
  /** División opcional del recuadro: cada fila con su propio ojo. */
  sections?: { label: string; value: number; names: NameEntry[] }[];
  tone?: "violet" | "amber";
}) {
  const [open, setOpen] = useState(false);
  // Fila cuyo desglose está desplegado (o null).
  const [openRow, setOpenRow] = useState<number | null>(null);
  const accent = tone === "amber" ? "text-amber-600" : "text-violet-600";

  const rows: TileRow[] = [
    { label: "Horas de predicación", value: hours, names: hoursDetail },
    { label: "Cursos bíblicos", value: bibleStudies, names: coursesDetail },
    ...(sections ?? []),
  ];

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
        {rows.map((r, i) => {
          const isOpen = openRow === i;
          return (
            <div key={i} className="py-2">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">{r.label}</dt>
                <dd className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums text-foreground">
                    {r.value}
                  </span>
                  {r.names ? (
                    <button
                      type="button"
                      onClick={() => setOpenRow(isOpen ? null : i)}
                      aria-expanded={isOpen}
                      aria-label={
                        isOpen
                          ? `Ocultar detalle de ${r.label}`
                          : `Ver detalle de ${r.label}`
                      }
                      title={isOpen ? "Ocultar detalle" : "Ver detalle"}
                      className="rounded-md border border-border px-1.5 py-0.5 text-xs text-muted transition-colors hover:bg-slate-50 hover:text-foreground"
                    >
                      <span aria-hidden>{isOpen ? "🙈" : "👁️"}</span>
                    </button>
                  ) : null}
                </dd>
              </div>
              {isOpen && r.names ? (
                <div className="mt-2 space-y-2 rounded-lg bg-slate-50 px-3 py-2">
                  {r.names.length === 0 ? (
                    <p className="text-xs text-muted">
                      Nadie en esta categoría.
                    </p>
                  ) : (
                    groupByGroup(r.names).map((g, gi) => (
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
                              <span className="min-w-0 flex-1">{n.name}</span>
                              {n.value !== undefined ? (
                                <span
                                  className={cn(
                                    "shrink-0 tabular-nums",
                                    n.value === "sin informe"
                                      ? "text-xs italic text-muted"
                                      : "font-semibold",
                                  )}
                                >
                                  {n.value}
                                </span>
                              ) : null}
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
                            {n.name}
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
