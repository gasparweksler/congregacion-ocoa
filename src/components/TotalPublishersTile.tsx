"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import type { NameEntry } from "@/lib/stats";

type Row = {
  label: string;
  value: number;
  names: NameEntry[];
};

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

// Recuadro "Total Publicadores": número grande + filas con un ojo que despliega
// los nombres de los publicadores de esa categoría.
export function TotalPublishersTile({
  total,
  rows,
}: {
  total: number;
  rows: Row[];
}) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <Card className="p-4">
      <p className="text-sm text-muted">Total Publicadores</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-700">
        {total}
      </p>
      <dl className="mt-3 divide-y divide-border border-t border-border text-sm">
        {rows.map((r, i) => {
          const isOpen = open === i;
          return (
            <div key={i} className="py-2">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">{r.label}</dt>
                <dd className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums text-foreground">
                    {r.value}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    aria-label={
                      isOpen
                        ? `Ocultar nombres de ${r.label}`
                        : `Ver nombres de ${r.label}`
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
    </Card>
  );
}
