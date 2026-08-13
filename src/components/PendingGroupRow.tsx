"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";

// Fila de un grupo con informes pendientes. El "ojo" despliega los nombres de
// los publicadores que aún no informaron.
export function PendingGroupRow({
  groupName,
  pending,
  total,
  names,
}: {
  groupName: string;
  pending: number;
  total: number;
  names: string[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <li className="rounded-lg border border-border">
      <div className="flex items-center justify-between gap-3 px-4 py-2">
        <span className="font-medium text-foreground">{groupName}</span>
        <div className="flex items-center gap-2">
          <Badge tone="amber">
            {pending} de {total} pendientes
          </Badge>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={
              open
                ? "Ocultar publicadores pendientes"
                : "Ver publicadores pendientes"
            }
            title={open ? "Ocultar pendientes" : "Ver quién falta por informar"}
            className="rounded-lg border border-border px-2 py-1 text-sm text-muted transition-colors hover:bg-slate-50 hover:text-foreground"
          >
            <span aria-hidden>{open ? "🙈" : "👁️"}</span>
          </button>
        </div>
      </div>
      {open ? (
        <div className="border-t border-border px-4 py-2">
          {names.length === 0 ? (
            <p className="text-sm text-muted">
              No hay nombres para mostrar.
            </p>
          ) : (
            <ol className="space-y-1">
              {names.map((n, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 text-sm text-foreground"
                >
                  <span className="w-5 shrink-0 text-right tabular-nums text-muted">
                    {i + 1}.
                  </span>
                  {n}
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </li>
  );
}
