"use client";

// Recuadro "Más de N días sin asignación": el número grande y un ojo que
// despliega de quién se trata. Son dos cosas distintas y conviene no
// mezclarlas:
//   - los que hace más de N días que no tienen una asignación realizada, y
//   - los publicadores que no han tenido ninguna participación.

import { useState } from "react";
import { Card } from "@/components/ui";

export type SinAsignacion = {
  name: string;
  groupName: string | null;
  /** Días desde su última asignación realizada; null si nunca tuvo una. */
  days: number | null;
};

// Agrupa por grupo de predicación, respetando el orden recibido.
function porGrupo<T extends { groupName: string | null }>(
  items: T[],
): { group: string; items: T[] }[] {
  const out: { group: string; items: T[] }[] = [];
  for (const it of items) {
    const g = it.groupName ?? "Sin grupo";
    const last = out[out.length - 1];
    if (last && last.group === g) last.items.push(it);
    else out.push({ group: g, items: [it] });
  }
  return out;
}

function Lista({ items, vacio }: { items: SinAsignacion[]; vacio: string }) {
  if (items.length === 0) {
    return <p className="text-xs text-muted">{vacio}</p>;
  }
  return (
    <div className="space-y-2">
      {porGrupo(items).map((g, gi) => (
        <div key={gi}>
          <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-primary">
            {g.group}
          </p>
          <ol className="mt-0.5 space-y-1">
            {g.items.map((it, j) => (
              <li
                key={j}
                className="flex items-baseline gap-2 text-sm text-foreground"
              >
                <span className="w-6 shrink-0 text-right tabular-nums text-muted">
                  {j + 1}.
                </span>
                <span className="min-w-0 flex-1">{it.name}</span>
                {it.days !== null ? (
                  <span className="shrink-0 text-xs tabular-nums text-amber-600">
                    {it.days} días
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

export function WithoutAssignmentTile({
  dias,
  conAviso,
  sinParticipacion,
}: {
  dias: number;
  /** Hermanos con más de `dias` sin una asignación realizada. */
  conAviso: SinAsignacion[];
  /** Publicadores sin ninguna participación en el período. */
  sinParticipacion: SinAsignacion[];
}) {
  const [open, setOpen] = useState(false);
  const total = conAviso.length + sinParticipacion.length;

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 text-sm text-muted">
          Más de {dias} días sin asignación
        </p>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? "Ocultar nombres" : "Ver nombres"}
          title={open ? "Ocultar nombres" : "Ver nombres"}
          className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-xs text-muted transition-colors hover:bg-slate-50 hover:text-foreground"
        >
          <span aria-hidden>{open ? "🙈" : "👁️"}</span>
        </button>
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums text-amber-600">
        {conAviso.length}
      </p>

      {open ? (
        <div className="mt-3 space-y-3 rounded-lg bg-slate-50 px-3 py-2">
          <div>
            <p className="mb-1 text-xs font-semibold text-foreground">
              Más de {dias} días sin una asignación realizada
            </p>
            <Lista
              items={conAviso}
              vacio={`Nadie lleva más de ${dias} días sin una asignación realizada.`}
            />
          </div>
          <div className="border-t border-border pt-2">
            <p className="mb-1 text-xs font-semibold text-foreground">
              Sin ninguna participación ({sinParticipacion.length})
            </p>
            <Lista
              items={sinParticipacion}
              vacio="Todos los publicadores activos han tenido alguna asignación."
            />
          </div>
          {total === 0 ? null : (
            <p className="border-t border-border pt-2 text-[0.7rem] text-muted">
              Solo se cuentan las reuniones anteriores a hoy: las programadas
              para más adelante no entran.
            </p>
          )}
        </div>
      ) : null}
    </Card>
  );
}
