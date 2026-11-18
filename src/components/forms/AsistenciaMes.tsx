"use client";

// ============================================================================
//  Registro mensual de asistencia a las reuniones.
//
//  Las fechas no se escriben a mano: salen de los días de reunión que la
//  congregación tiene configurados en Reuniones. De cada una se anota si hubo
//  reunión normal, cuánta gente asistió y las observaciones.
//
//  Se guarda solo: en cuanto se cambia el interruptor o se sale de una
//  casilla, esa reunión viaja al servidor. Así cambiar de mes o cerrar la
//  página no se lleva por delante lo anotado.
// ============================================================================

import { useState, useTransition } from "react";
import {
  guardarAsistencia,
  type EntradaAsistencia,
} from "@/server/asistencia-actions";
import {
  promediosDelMes,
  soloEnteros,
  type FilaAsistencia,
  type Promedio,
} from "@/lib/asistencia";
import { MEETING_DAYS } from "@/lib/constants";
import { Alert, Badge, Card, CardBody, CardHeader } from "@/components/ui";
import { weekdayNameOfISO } from "@/lib/dates";

/** "6 de noviembre" */
function diaYMes(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  return `${d} de ${meses[m - 1]}`;
}

/** Una de las tres tarjetas de promedio de arriba. */
function Indicador({
  titulo,
  detalle,
  valor,
  tono,
}: {
  titulo: string;
  detalle: string;
  valor: Promedio;
  tono: "blue" | "emerald" | "slate";
}) {
  const colores = {
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    slate: "border-border bg-slate-50 text-foreground",
  }[tono];
  return (
    <div className={`rounded-2xl border p-4 ${colores}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
        {titulo}
      </p>
      <p className="mt-1 text-3xl font-bold tabular-nums">
        {valor.promedio ?? "—"}
      </p>
      <p className="mt-0.5 text-xs opacity-80">
        {valor.reuniones === 0
          ? "Todavía sin asistencias anotadas"
          : `${valor.reuniones} ${valor.reuniones === 1 ? "reunión" : "reuniones"} · ${valor.total} en total`}
      </p>
      <p className="mt-1 text-[0.7rem] opacity-70">{detalle}</p>
    </div>
  );
}

type Estado = "guardando" | "guardado" | "error";

export function AsistenciaMes({ filas }: { filas: FilaAsistencia[] }) {
  const [, empezarGuardado] = useTransition();
  const clave = (f: { dateISO: string; day: string }) =>
    `${f.dateISO}|${f.day}`;

  // Lo que se ve, lo último guardado y cómo fue el último guardado de cada
  // reunión. La llave es fecha + tipo de reunión.
  const inicial = () => {
    const o: Record<string, FilaAsistencia> = {};
    for (const f of filas) o[clave(f)] = f;
    return o;
  };
  const [local, setLocal] = useState<Record<string, FilaAsistencia>>(inicial);
  const [guardado, setGuardado] = useState<Record<string, FilaAsistencia>>(inicial);
  const [estados, setEstados] = useState<Record<string, Estado | undefined>>({});
  const [aviso, setAviso] = useState<string>("");

  // Si cambia el mes (o los días de reunión), se recarga lo que llega del
  // servidor. Se ajusta en render, no en un efecto, para que no parpadee.
  const firma = filas
    .map((f) => `${clave(f)}:${f.held}:${f.count ?? ""}:${f.note}`)
    .join("//");
  const [firmaPrevia, setFirmaPrevia] = useState(firma);
  if (firma !== firmaPrevia) {
    setFirmaPrevia(firma);
    const v = inicial();
    setLocal(v);
    setGuardado(v);
    setEstados({});
  }

  const enOrden = filas.map((f) => local[clave(f)] ?? f);

  const promedios = promediosDelMes(enOrden);

  /** Manda UNA reunión al servidor, si de verdad cambió. */
  const guardar = (k: string, fila: FilaAsistencia) => {
    const previa = guardado[k];
    if (
      previa &&
      previa.held === fila.held &&
      previa.count === fila.count &&
      previa.note === fila.note
    ) {
      return;
    }
    setEstados((e) => ({ ...e, [k]: "guardando" }));
    const entrada: EntradaAsistencia = {
      dateISO: fila.dateISO,
      day: fila.day,
      held: fila.held,
      count: fila.count === null ? "" : String(fila.count),
      note: fila.note,
    };
    empezarGuardado(async () => {
      try {
        const r = await guardarAsistencia([entrada]);
        if (r.error) {
          setEstados((e) => ({ ...e, [k]: "error" }));
          setAviso(r.error);
          return;
        }
        setGuardado((g) => ({ ...g, [k]: fila }));
        setEstados((e) => ({ ...e, [k]: "guardado" }));
        setAviso("");
        // El "Guardado" se borra solo: es un acuse, no un estado.
        setTimeout(() => {
          setEstados((e) => {
            if (e[k] !== "guardado") return e;
            const next = { ...e };
            delete next[k];
            return next;
          });
        }, 2000);
      } catch {
        setEstados((e) => ({ ...e, [k]: "error" }));
        setAviso(
          "No se pudo guardar. Revisa la conexión: lo que escribiste sigue en pantalla, vuelve a salir de la casilla para reintentar.",
        );
      }
    });
  };

  const cambiar = (
    k: string,
    cambios: Partial<FilaAsistencia>,
    guardarYa = false,
  ) => {
    const fila = { ...local[k], ...cambios };
    setLocal((prev) => ({ ...prev, [k]: fila }));
    // El interruptor se guarda en el acto; lo que se escribe, al salir de la
    // casilla (si no, cada letra sería un viaje al servidor).
    if (guardarYa) guardar(k, fila);
  };

  return (
    <div className="space-y-4">
      {/* Los tres promedios, que se recalculan al escribir. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador
          titulo="Fin de semana"
          detalle="Promedio por reunión del fin de semana"
          valor={promedios.finDeSemana}
          tono="emerald"
        />
        <Indicador
          titulo="Entre semana"
          detalle="Promedio por reunión de entre semana"
          valor={promedios.entreSemana}
          tono="blue"
        />
        <Indicador
          titulo="Todas las reuniones"
          detalle="Promedio de todas las reuniones del mes"
          valor={promedios.todas}
          tono="slate"
        />
      </div>

      {aviso ? <Alert tone="error">{aviso}</Alert> : null}

      <Card>
        <CardHeader
          title="Reuniones del mes"
          description="Las fechas salen de los días de reunión de tu congregación. Cada cambio se guarda solo."
        />
        <CardBody className="space-y-3">
          {enOrden.length === 0 ? (
            <Alert tone="info">
              Este mes no tiene días de reunión configurados. Revisa “Selecciona
              tu día de reunión” en la sección Reuniones.
            </Alert>
          ) : (
            enOrden.map((f) => {
              const k = clave(f);
              const estado = estados[k];
              const finde = f.day === MEETING_DAYS.SABADO;
              return (
                <div
                  key={k}
                  className={
                    "rounded-2xl border p-3 transition-colors " +
                    (f.held
                      ? "border-border bg-surface"
                      : "border-red-200 bg-red-50/60")
                  }
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {weekdayNameOfISO(f.dateISO)} {diaYMes(f.dateISO)}
                      </p>
                      <Badge tone={finde ? "green" : "blue"}>
                        {finde ? "Fin de semana" : "Entre semana"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {estado === "guardando" ? (
                        <span className="text-xs text-muted">Guardando…</span>
                      ) : estado === "guardado" ? (
                        <span className="text-xs font-medium text-emerald-700">
                          ✓ Guardado
                        </span>
                      ) : estado === "error" ? (
                        <span className="text-xs font-medium text-red-600">
                          ⚠ Sin guardar
                        </span>
                      ) : null}
                      {/* El interruptor: verde si hubo reunión, rojo si no. */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={f.held}
                        aria-label={`¿Hubo reunión normal el ${f.dateISO}?`}
                        onClick={() => cambiar(k, { held: !f.held }, true)}
                        className={
                          "inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs font-semibold transition-colors " +
                          (f.held
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-red-300 bg-red-50 text-red-700")
                        }
                      >
                        <span
                          aria-hidden
                          className={
                            "relative h-4 w-8 rounded-full transition-colors " +
                            (f.held ? "bg-emerald-500" : "bg-red-500")
                          }
                        >
                          <span
                            className={
                              "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all " +
                              (f.held ? "left-4" : "left-0.5")
                            }
                          />
                        </span>
                        {f.held ? "Sí" : "No"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 grid gap-2 sm:grid-cols-[9rem_1fr]">
                    <label className="block">
                      <span className="mb-0.5 block text-xs text-muted">
                        Asistencia
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={f.count === null ? "" : String(f.count)}
                        disabled={!f.held}
                        onChange={(e) => {
                          const limpio = soloEnteros(e.target.value);
                          cambiar(k, {
                            count: limpio === "" ? null : Number(limpio),
                          });
                        }}
                        onBlur={() => guardar(k, local[k])}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        placeholder={f.held ? "Ej.: 85" : "—"}
                        aria-label={`Asistencia del ${f.dateISO}`}
                        className="w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-0.5 block text-xs text-muted">
                        Comentarios
                      </span>
                      <input
                        type="text"
                        value={f.note}
                        onChange={(e) => cambiar(k, { note: e.target.value })}
                        onBlur={() => guardar(k, local[k])}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        maxLength={300}
                        placeholder="Reunión suspendida, se hizo en otro lugar, visita del superintendente…"
                        aria-label={`Comentarios del ${f.dateISO}`}
                        className="w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
                      />
                    </label>
                  </div>

                  {!f.held ? (
                    <p className="mt-1.5 text-xs text-red-700">
                      Marcada como <strong>No</strong>: no cuenta para los
                      promedios ni para el registro S-88.
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </CardBody>
      </Card>
    </div>
  );
}
