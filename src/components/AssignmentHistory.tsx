"use client";

// Tabla de hermanos con su historial de asignaciones. Cada fila se despliega
// para ver el detalle, de modo que un historial largo no se cargue entero en
// pantalla de golpe.

import { useState } from "react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { MEETING_SECTION_LABELS } from "@/lib/constants";
import { DONE_LABELS, type BrotherStats } from "@/lib/assignment-stats";
import { CONFIRM_STATUS_LABELS, type ConfirmStatus } from "@/lib/constants";

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

/** Lo que llega desde el servidor (las fechas viajan como texto ISO). */
export type BrotherRow = Omit<BrotherStats, "participations" | "lastDone"> & {
  lastDone: string | null;
  participations: (Omit<BrotherStats["participations"][number], "date"> & {
    date: string;
  })[];
};

export function AssignmentHistory({
  brothers,
  dias,
}: {
  brothers: BrotherRow[];
  /** Umbral de aviso en días. */
  dias: number;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);

  if (brothers.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm text-muted">
        Ningún hermano coincide con los filtros.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border">
      {brothers.map((b) => {
        const clave = b.publisherId ?? b.name;
        const open = abierto === clave;
        // Resaltado SOLO por llevar tiempo sin una asignación registrada como
        // realizada. No dice nada más sobre el hermano.
        const pasado = b.daysSinceDone !== null && b.daysSinceDone > dias;
        const nunca = b.lastDone === null;

        return (
          <div
            key={clave}
            className={cn(
              "px-4 py-3 sm:px-5",
              pasado ? "bg-amber-50" : "",
              nunca ? "bg-slate-50" : "",
            )}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{b.name}</span>
                  {b.publisherId === null ? (
                    <Badge tone="red">Sin publicador</Badge>
                  ) : null}
                  {b.groupName ? (
                    <span className="text-xs text-muted">{b.groupName}</span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-sm text-muted">
                  {b.doneCount} realizada(s)
                  <span className="mx-1.5 text-border">·</span>
                  {b.asResponsable} como responsable
                  <span className="mx-1.5 text-border">·</span>
                  {b.asAuxiliar} como auxiliar
                  {b.unrecordedCount > 0 ? (
                    <>
                      <span className="mx-1.5 text-border">·</span>
                      {b.unrecordedCount} sin registrar
                    </>
                  ) : null}
                </p>
                {b.variants.length > 1 ? (
                  <p className="mt-0.5 text-xs text-muted">
                    Escrito como: {b.variants.join(" · ")}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {nunca ? (
                  <Badge tone="slate">Sin asignación realizada registrada</Badge>
                ) : (
                  <Badge tone={pasado ? "amber" : "green"}>
                    Última: {fecha(b.lastDone!)} · {b.daysSinceDone} día(s)
                  </Badge>
                )}
                <button
                  type="button"
                  onClick={() => setAbierto(open ? null : clave)}
                  aria-expanded={open}
                  className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted transition-colors hover:bg-slate-50 hover:text-foreground"
                >
                  {open ? "🙈 Ocultar" : `👁️ Ver ${b.participations.length}`}
                </button>
              </div>
            </div>

            {open ? (
              <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-3 py-2 font-semibold">Fecha</th>
                      <th className="px-3 py-2 font-semibold">Asignación</th>
                      <th className="px-3 py-2 font-semibold">Parte</th>
                      <th className="px-3 py-2 font-semibold">Papel</th>
                      <th className="px-3 py-2 font-semibold">Confirmación</th>
                      <th className="px-3 py-2 font-semibold">¿Realizada?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.participations.map((p, i) => (
                      <tr key={i} className="border-t border-border/60">
                        <td className="whitespace-nowrap px-3 py-2">
                          {p.weekLabel ?? fecha(p.date)}
                          <span className="block text-xs text-muted">
                            {p.dayLabel}
                          </span>
                          {/* Viene del historial guardado al borrar la reunión:
                              sigue contando, pero ya no se puede abrir. */}
                          {p.deleted ? (
                            <span className="mt-0.5 block text-xs font-medium text-amber-600">
                              Reunión eliminada
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-muted">
                          {MEETING_SECTION_LABELS[p.section] ?? p.section}
                        </td>
                        <td className="px-3 py-2">{p.label}</td>
                        <td className="px-3 py-2">
                          {p.role === "responsable" ? "Responsable" : "Auxiliar"}
                        </td>
                        <td className="px-3 py-2 text-muted">
                          {CONFIRM_STATUS_LABELS[p.confirmStatus as ConfirmStatus] ??
                            p.confirmStatus}
                        </td>
                        <td className="px-3 py-2">
                          <Badge
                            tone={
                              p.done === "realizada"
                                ? "green"
                                : p.done === "no_realizada"
                                  ? "red"
                                  : "slate"
                            }
                          >
                            {DONE_LABELS[p.done]}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
