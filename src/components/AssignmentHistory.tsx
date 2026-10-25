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
export type BrotherRow = Omit<
  BrotherStats,
  "participations" | "lastDone" | "lastAssigned"
> & {
  lastDone: string | null;
  lastAssigned: string | null;
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
        // Resaltado SOLO por llevar tiempo sin que le toque una asignación.
        // No dice nada más sobre el hermano.
        const pasado =
          b.daysSinceAssigned !== null && b.daysSinceAssigned > dias;
        const nunca = b.lastAssigned === null;

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
                  {b.doneCount} confirmada(s)
                  <span className="mx-1.5 text-border">·</span>
                  {b.asResponsable} como responsable
                  <span className="mx-1.5 text-border">·</span>
                  {b.asAuxiliar} como auxiliar
                  {b.unrecordedCount > 0 ? (
                    <>
                      <span className="mx-1.5 text-border">·</span>
                      {b.unrecordedCount} sin respuesta
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
                  <Badge tone="slate">Sin asignaciones en el período</Badge>
                ) : (
                  <Badge tone={pasado ? "amber" : "green"}>
                    Última asignación: {fecha(b.lastAssigned!)} ·{" "}
                    {b.daysSinceAssigned} día(s)
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
              <>
                {/* En el móvil, una tarjeta por participación: la tabla de 6
                    columnas no cabe y quedaba con scroll propio y las palabras
                    cortadas. */}
                <ul className="mt-3 space-y-2 sm:hidden">
                  {b.participations.map((p, i) => (
                    <li
                      key={i}
                      className="rounded-lg border border-border bg-surface p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                        <span className="font-semibold text-foreground">
                          {p.weekLabel ?? fecha(p.date)}
                        </span>
                        <span className="text-xs text-muted">{p.dayLabel}</span>
                      </div>
                      {p.deleted ? (
                        <p className="text-xs font-medium text-amber-600">
                          Reunión eliminada
                        </p>
                      ) : null}
                      <p className="mt-1 text-foreground">{p.label}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {MEETING_SECTION_LABELS[p.section] ?? p.section}
                        <span className="mx-1.5 text-border">·</span>
                        {p.role === "responsable" ? "Responsable" : "Auxiliar"}
                        <span className="mx-1.5 text-border">·</span>
                        {CONFIRM_STATUS_LABELS[p.confirmStatus as ConfirmStatus] ??
                          p.confirmStatus}
                      </p>
                      <div className="mt-1.5">
                        <Badge
                          tone={
                            p.done === "confirmada"
                              ? "green"
                              : p.done === "rechazada"
                                ? "red"
                                : "slate"
                          }
                        >
                          {DONE_LABELS[p.done]}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>

                {/* En pantalla ancha sigue la tabla, que se lee de un vistazo. */}
                <div className="mt-3 hidden overflow-x-auto rounded-lg border border-border sm:block">
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
                              p.done === "confirmada"
                                ? "green"
                                : p.done === "rechazada"
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
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
