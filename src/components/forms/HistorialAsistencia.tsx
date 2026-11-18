"use client";

// ============================================================================
//  Historial de asistencias: un año de servicio (septiembre a agosto) mes a
//  mes, con sus promedios, sus observaciones y lo que se suspendió.
//
//  Desde aquí se abre cualquier mes para corregirlo, y se puede borrar un mes
//  suelto o el año de servicio entero. Borrar pide confirmación y dice
//  exactamente qué período se va.
// ============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  borrarAsistenciaDelMes,
  borrarAsistenciaDelAnioDeServicio,
  type MesDelHistorial,
} from "@/server/asistencia-actions";
import { etiquetaAnioDeServicio, etiquetaDeMes } from "@/lib/asistencia";
import { MONTH_NAMES, MEETING_DAYS } from "@/lib/constants";
import { Alert, Badge } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import Link from "next/link";

export function HistorialAsistencia({
  anio,
  meses,
}: {
  /** El año de servicio que se está mirando. */
  anio: number;
  meses: MesDelHistorial[];
}) {
  const router = useRouter();
  const [borrando, empezarBorrado] = useTransition();
  const [aviso, setAviso] = useState<{ error?: string; success?: string }>({});
  /** Qué se está confirmando: un mes, el año entero, o nada. */
  const [confirmar, setConfirmar] = useState<
    { tipo: "mes"; year: number; month: number } | { tipo: "anio" } | null
  >(null);

  const conDatos = meses.filter((m) => m.anotadas > 0);
  const totalReuniones = meses.reduce((n, m) => n + m.todas.reuniones, 0);

  const borrar = () => {
    if (!confirmar) return;
    const pedido = confirmar;
    empezarBorrado(async () => {
      try {
        const r =
          pedido.tipo === "mes"
            ? await borrarAsistenciaDelMes(pedido.year, pedido.month)
            : await borrarAsistenciaDelAnioDeServicio(anio);
        setAviso(r);
        setConfirmar(null);
        router.refresh();
      } catch {
        setAviso({
          error: "No se pudo borrar. Revisa la conexión y vuelve a intentarlo.",
        });
      }
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {etiquetaAnioDeServicio(anio)} ·{" "}
        {conDatos.length === 0
          ? "todavía sin registros"
          : `${conDatos.length} ${conDatos.length === 1 ? "mes anotado" : "meses anotados"} · ${totalReuniones} ${totalReuniones === 1 ? "reunión" : "reuniones"} con asistencia`}
      </p>

      {aviso.error ? <Alert tone="error">{aviso.error}</Alert> : null}
      {aviso.success ? <Alert tone="success">{aviso.success}</Alert> : null}

      <div className="space-y-2">
        {meses.map((m) => {
          const vacio = m.anotadas === 0;
          return (
            <div
              key={`${m.year}-${m.month}`}
              className={
                "rounded-2xl border p-3 " +
                (vacio ? "border-dashed border-border" : "border-border bg-surface")
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {MONTH_NAMES[m.month - 1]} {m.year}
                  </p>
                  <p className="text-xs text-muted">
                    {vacio
                      ? "Sin registros"
                      : `${m.todas.reuniones} ${m.todas.reuniones === 1 ? "reunión" : "reuniones"} con asistencia`}
                    {m.suspendidas > 0 ? (
                      <>
                        {" · "}
                        <span className="font-medium text-red-700">
                          {m.suspendidas} marcada{m.suspendidas === 1 ? "" : "s"}{" "}
                          como No
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Link
                    href={`/asistencia?anio=${m.year}&mes=${m.month}`}
                    className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-slate-50"
                  >
                    ✏️ Abrir y editar
                  </Link>
                  <button
                    type="button"
                    disabled={vacio || borrando}
                    onClick={() =>
                      setConfirmar({ tipo: "mes", year: m.year, month: m.month })
                    }
                    className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    🗑️ Borrar mes
                  </button>
                </div>
              </div>

              {!vacio ? (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <Badge tone="green">
                    Fin de semana: {m.finDeSemana.promedio ?? "—"}
                  </Badge>
                  <Badge tone="blue">
                    Entre semana: {m.entreSemana.promedio ?? "—"}
                  </Badge>
                  <Badge tone="slate">Todas: {m.todas.promedio ?? "—"}</Badge>
                </div>
              ) : null}

              {m.notas.length > 0 ? (
                <ul className="mt-2 space-y-1 border-t border-border pt-2 text-xs text-muted">
                  {m.notas.map((n) => (
                    <li key={`${n.dateISO}-${n.day}`}>
                      <span className="font-medium text-foreground">
                        {n.dateISO.slice(8)} ·{" "}
                        {n.day === MEETING_DAYS.SABADO
                          ? "fin de semana"
                          : "entre semana"}
                      </span>
                      {!n.held ? (
                        <span className="ml-1 font-semibold text-red-700">
                          · no hubo reunión
                        </span>
                      ) : null}
                      {n.note ? <span className="ml-1">· {n.note}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="border-t border-border pt-3">
        <button
          type="button"
          disabled={borrando || conDatos.length === 0}
          onClick={() => setConfirmar({ tipo: "anio" })}
          className="w-full rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          🗑️ Borrar todo el año de servicio {anio}
        </button>
      </div>

      <ConfirmDialog
        open={confirmar !== null}
        title={
          confirmar?.tipo === "mes"
            ? `¿Borrar la asistencia de ${etiquetaDeMes(confirmar.year, confirmar.month)}?`
            : `¿Borrar la asistencia del año de servicio ${anio}?`
        }
        description={
          confirmar?.tipo === "mes"
            ? "Se borran las asistencias, los comentarios y las marcas de ese mes. No se toca ninguna otra cosa de Ocoa: ni reuniones, ni publicadores, ni grupos."
            : `Se borra TODO lo anotado desde septiembre de ${anio - 1} hasta agosto de ${anio}. No se toca ninguna otra cosa de Ocoa: ni reuniones, ni publicadores, ni grupos.`
        }
        confirmLabel="Confirmar borrado"
        pendingLabel="Borrando…"
        pending={borrando}
        onCancel={() => setConfirmar(null)}
        onConfirm={borrar}
      />
    </div>
  );
}
