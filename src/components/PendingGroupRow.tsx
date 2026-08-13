"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui";

// Fila de un grupo con informes pendientes. El "ojo" despliega los nombres de
// los publicadores que aún no informaron, y cada uno tiene "Subir Informe".
export function PendingGroupRow({
  groupId,
  groupName,
  pending,
  total,
  year,
  month,
  publishers,
}: {
  groupId: string;
  groupName: string;
  pending: number;
  total: number;
  year: number;
  month: number;
  publishers: { id: string; fullName: string }[];
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
          {publishers.length === 0 ? (
            <p className="text-sm text-muted">No hay nombres para mostrar.</p>
          ) : (
            <ol className="space-y-1.5">
              {publishers.map((p, i) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="flex items-center gap-2 text-foreground">
                    <span className="w-5 shrink-0 text-right tabular-nums text-muted">
                      {i + 1}.
                    </span>
                    {p.fullName}
                  </span>
                  <Link
                    href={`/informes?grupo=${groupId}&anio=${year}&mes=${month}&pub=${p.id}`}
                    className="shrink-0 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-[var(--primary-hover)]"
                  >
                    📝 Subir Informe
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </li>
  );
}
