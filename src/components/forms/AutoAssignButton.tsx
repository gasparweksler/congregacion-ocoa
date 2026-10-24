"use client";

// "Asignar responsabilidades automáticamente": calcula una propuesta, la
// enseña entera —con sus conflictos y sus huecos— y solo guarda si se confirma.
// Nada se escribe hasta que se pulsa "Confirmar y guardar".

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  proposeAutoAssignAction,
  applyAutoAssignAction,
  clearMonthResponsibilitiesAction,
  type AutoAssignPreview,
} from "@/server/resp-auto-actions";
import { Alert, Button } from "@/components/ui";
import { weekdayNameOfISO } from "@/lib/dates";
import { monthName } from "@/lib/constants";

function fechaCorta(iso: string): string {
  const [, , d] = iso.split("-");
  return `${weekdayNameOfISO(iso)} ${Number(d)}`;
}

export function AutoAssignButton({
  year,
  month,
}: {
  year: number;
  month: number;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<AutoAssignPreview | null>(null);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [calculando, calcular] = useTransition();
  const [guardando, guardar] = useTransition();
  const [limpiando, limpiarMes] = useTransition();

  const proponer = () => {
    setMensaje(null);
    calcular(async () => {
      const r = await proposeAutoAssignAction(year, month);
      if (!r.ok) {
        setMensaje({ ok: false, texto: r.error ?? "No se pudo calcular el reparto." });
        setPreview(null);
        return;
      }
      setPreview(r);
    });
  };

  const limpiar = () => {
    if (
      !confirm(
        `¿Dejar en blanco todas las responsabilidades de ${monthName(month)} ${year}?\n\n` +
          "Se vacían Acomodadores, Pasa Micrófono, Plataforma, Audio y Video para poder repartirlas otra vez.\n" +
          "La Limpieza por Grupos y las partes de las reuniones NO se tocan.\n\n" +
          "No se puede deshacer.",
      )
    ) {
      return;
    }
    setPreview(null);
    setMensaje(null);
    limpiarMes(async () => {
      const r = await clearMonthResponsibilitiesAction(year, month);
      setMensaje({ ok: r.ok, texto: r.message });
      if (r.ok) router.refresh();
    });
  };

  const confirmar = () => {
    if (!preview) return;
    guardar(async () => {
      const r = await applyAutoAssignAction(year, month, preview.proposals);
      setMensaje({ ok: r.ok, texto: r.message });
      setPreview(null);
      if (r.ok) router.refresh();
    });
  };

  const conflictos = preview?.proposals.filter((p) => p.conflict) ?? [];

  // Propuestas agrupadas por fecha, para que se lea como la pantalla.
  const porFecha = new Map<string, AutoAssignPreview["proposals"]>();
  for (const p of preview?.proposals ?? []) {
    if (!porFecha.has(p.dateISO)) porFecha.set(p.dateISO, []);
    porFecha.get(p.dateISO)!.push(p);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={proponer}
          disabled={calculando || guardando || limpiando}
        >
          {calculando ? "Calculando…" : "🎲 Asignar responsabilidades automáticamente"}
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={limpiar}
          disabled={calculando || guardando || limpiando}
        >
          {limpiando ? "Limpiando…" : "🧹 Limpiar Mes"}
        </Button>
        {preview ? (
          <span className="text-xs text-muted">
            Nada se ha guardado todavía: revisa la propuesta y confirma.
          </span>
        ) : null}
      </div>

      {mensaje ? (
        <Alert tone={mensaje.ok ? "success" : "error"}>{mensaje.texto}</Alert>
      ) : null}

      {preview ? (
        <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Vista previa · {preview.periodo}
            </h3>
            <p className="mt-0.5 text-sm text-muted">
              {preview.proposals.length} responsabilidad(es) propuestas
              {preview.kept.length > 0
                ? ` · ${preview.kept.length} ya tenían a alguien y no se tocan`
                : ""}
              {preview.uncovered.length > 0
                ? ` · ${preview.uncovered.length} sin cubrir`
                : ""}
            </p>
          </div>

          {conflictos.length > 0 ? (
            <Alert tone="warning">
              <strong>
                {conflictos.length} responsabilidad(es) recaen en hermanos que ya
                tienen una parte en esa misma reunión.
              </strong>
              <ul className="mt-1.5 list-disc space-y-1 pl-5">
                {conflictos.map((c, i) => (
                  <li key={i}>
                    <strong>{c.name}</strong> — {fechaCorta(c.dateISO)}: ya tiene
                    «{c.conflictWith}» y tendría además «{c.slotLabel}».
                  </li>
                ))}
              </ul>
              No se encontró otra combinación posible con los hermanos
              registrados.
            </Alert>
          ) : null}

          {preview.uncovered.length > 0 ? (
            <Alert tone="error">
              <strong>Puestos que quedarían sin cubrir:</strong>
              <ul className="mt-1.5 list-disc space-y-1 pl-5">
                {preview.uncovered.map((u, i) => (
                  <li key={i}>
                    {fechaCorta(u.dateISO)} · {u.slotLabel} — {u.reason}
                  </li>
                ))}
              </ul>
            </Alert>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <tbody>
                {[...porFecha.entries()].map(([fecha, items]) => (
                  <tr key={fecha} className="border-t border-border/60 align-top">
                    <th className="whitespace-nowrap px-2 py-2 text-left font-semibold text-foreground">
                      {fechaCorta(fecha)}
                    </th>
                    <td className="px-2 py-2">
                      <ul className="space-y-0.5">
                        {items.map((p, i) => (
                          <li key={i} className="flex flex-wrap gap-x-2">
                            <span className="text-muted">{p.slotLabel}:</span>
                            <span className="font-medium text-foreground">
                              {p.name}
                            </span>
                            {p.conflict ? (
                              <span className="text-xs font-medium text-amber-600">
                                (conflicto)
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.loads.length > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">
                Cómo queda el reparto por hermano
              </summary>
              <ul className="mt-2 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
                {preview.loads.map((l, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate text-foreground">{l.name}</span>
                    <span className="shrink-0 tabular-nums text-muted">
                      {l.total}
                      {l.before > 0 ? ` (${l.before} ya tenía)` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {/* El guardado escribe una casilla por responsabilidad, así que
              tarda. Más vale decirlo que dejar el botón quieto. */}
          {guardando ? (
            <Alert tone="warning">
              <strong>Guardando las {preview.proposals.length} responsabilidades…</strong>
              <br />
              Esto puede tardar un par de minutos: se guarda cada una por
              separado. No cierres ni recargues la página; al terminar se
              actualizará sola y verás los nombres en la tabla de abajo.
            </Alert>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={confirmar} disabled={guardando}>
              {guardando ? "Guardando… puede tardar un par de minutos" : "Confirmar y guardar"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPreview(null)}
              disabled={guardando}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
