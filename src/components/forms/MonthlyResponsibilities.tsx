"use client";

import { useState, useTransition } from "react";
import {
  setMonthlyResponsibilities,
  type ResultadoGuardado,
} from "@/server/monthly-resp-actions";
import {
  responsibilitiesToShow,
  type RespSettings,
} from "@/lib/resp-settings";
import { weekdayNameOfISO } from "@/lib/dates";
import { Alert, Button, Card, CardBody, CardHeader } from "@/components/ui";
import type { MonthlyMeetingRow } from "@/server/monthly-resp-actions";
import {
  casillasCambiadas,
  type RespEntry,
} from "@/lib/monthly-resp-plan";

function formatDateISO(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  return `${d} de ${meses[m - 1]}`;
}

/** Lo que se le cuenta al usuario después de guardar. */
function mensajeDeGuardado(r: ResultadoGuardado): string {
  const casillas = `${r.guardadas} ${r.guardadas === 1 ? "casilla" : "casillas"}`;
  const reuniones = `${r.reunionesTocadas} ${
    r.reunionesTocadas === 1 ? "reunión" : "reuniones"
  }`;
  let txt = `✅ Cambios guardados: ${casillas} en ${reuniones} del mes.`;
  if (r.reunionesCreadas > 0) {
    const creadas = `${r.reunionesCreadas} ${
      r.reunionesCreadas === 1 ? "reunión que faltaba" : "reuniones que faltaban"
    }`;
    txt += ` Se creó ${creadas} para esas fechas.`;
  }
  return txt;
}

export function MonthlyResponsibilities({
  titulo,
  rows,
  publishers,
  groups,
  ajustes,
}: {
  /** El título de la tarjeta, p. ej. "Responsabilidades · Noviembre 2026". */
  titulo: string;
  rows: MonthlyMeetingRow[];
  publishers: string[];
  groups: string[];
  /** Cuántos micrófonos usa la congregación y si Audio hace también Video. */
  ajustes: RespSettings;
}) {
  const [guardando, empezarGuardado] = useTransition();
  // Los recuadros nacen bloqueados: así no se cambia nada sin querer al
  // consultar el programa del mes.
  const [editando, setEditando] = useState(false);
  const [aviso, setAviso] = useState<{ error?: string; success?: string }>({});
  // Las casillas que la congregación usa, con su etiqueta ya ajustada ("Audio
  // y Video"). Una casilla apagada solo sigue a la vista si ya tenía un nombre
  // guardado: se enseña en gris para que no parezca que se borró.
  const RESPONSABILIDADES = responsibilitiesToShow(ajustes, (slotKey) =>
    rows.some((r) => (r.values[slotKey]?.name ?? "").trim() !== ""),
  );
  // Para contar "3 de 7" solo cuentan las que de verdad hay que rellenar.
  const AREPARTIR = RESPONSABILIDADES.filter((r) => !r.inactiva);
  // Fechas plegadas. Arrancan plegadas las que ya están completas.
  const [plegadas, setPlegadas] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const todas = AREPARTIR.every((x) =>
        (r.values[x.key]?.name ?? "").trim(),
      );
      if (todas) s.add(r.dateISO);
    }
    return s;
  });

  const initialValues = () => {
    const o: Record<string, string> = {};
    for (const r of rows)
      for (const resp of RESPONSABILIDADES)
        o[`${r.dateISO}_${resp.key}`] = r.values[resp.key]?.name ?? "";
    return o;
  };
  // Valor mostrado (mientras se escribe) y último valor guardado (para saber
  // qué cambió y no reescribir lo que está igual).
  const [local, setLocal] = useState<Record<string, string>>(initialValues);
  const [saved, setSaved] = useState<Record<string, string>>(initialValues);

  // Si los datos del servidor cambian (p. ej. tras la asignación automática),
  // hay que volver a cargarlos: antes el estado se fijaba una sola vez y las
  // casillas seguían viéndose vacías aunque ya estuvieran guardadas.
  // Se ajusta en render, no en un efecto, para que no haya un parpadeo.
  // Mientras se está editando NO se recarga: lo escrito a mano manda hasta
  // que se guarde o se cancele.
  const firma = rows
    .map(
      (r) =>
        `${r.dateISO}:${RESPONSABILIDADES.map((x) => r.values[x.key]?.name ?? "").join("|")}`,
    )
    .join("//");
  const [firmaPrevia, setFirmaPrevia] = useState(firma);
  if (firma !== firmaPrevia && !editando && !guardando) {
    setFirmaPrevia(firma);
    const v = initialValues();
    setLocal(v);
    setSaved(v);
  }

  // Las casillas que cambiaron respecto a lo guardado: es lo único que se
  // manda al servidor.
  const cambios = (): RespEntry[] =>
    casillasCambiadas(
      rows.flatMap((row) =>
        RESPONSABILIDADES.map((resp) => {
          const cellKey = `${row.dateISO}_${resp.key}`;
          return {
            dateISO: row.dateISO,
            day: row.day,
            slotKey: resp.key,
            valor: local[cellKey] ?? "",
            guardado: saved[cellKey] ?? "",
            // Las que la congregación ya no reparte no se editan.
            editable: !resp.inactiva,
          };
        }),
      ),
    );
  const pendientes = cambios().length;

  const empezarAEditar = () => {
    setAviso({});
    setEditando(true);
  };

  const cancelar = () => {
    if (
      pendientes > 0 &&
      !window.confirm(
        "Se perderán los cambios que todavía no guardaste. ¿Salir de la edición?",
      )
    )
      return;
    setLocal(saved);
    setAviso({});
    setEditando(false);
  };

  const guardar = () => {
    const entries = cambios();
    if (entries.length === 0) {
      setEditando(false);
      setAviso({ success: "No había cambios que guardar." });
      return;
    }
    const firmaAlGuardar = firma;
    setAviso({});
    empezarGuardado(async () => {
      try {
        const r = await setMonthlyResponsibilities(entries);
        // Lo que acabamos de escribir pasa a ser "lo guardado". Se marca
        // también la firma del servidor como vista, para que los datos
        // antiguos (que aún pueden tardar un instante en refrescarse) no
        // pisen lo recién guardado.
        const limpios: Record<string, string> = { ...local };
        for (const e of entries)
          limpios[`${e.dateISO}_${e.slotKey}`] = e.value;
        setLocal(limpios);
        setSaved(limpios);
        setFirmaPrevia(firmaAlGuardar);
        setEditando(false);
        setAviso({ success: mensajeDeGuardado(r) });
      } catch {
        // Nada se borra: se sigue en modo edición con lo escrito a la vista
        // para poder reintentar sin volver a teclearlo.
        setAviso({
          error:
            "No se pudieron guardar los cambios. Revisa la conexión y vuelve a pulsar «Guardar»: lo que escribiste sigue aquí.",
        });
      }
    });
  };

  // Mientras se guarda, los recuadros vuelven a bloquearse para que no se
  // escriba encima de lo que está viajando al servidor.
  const bloqueado = !editando || guardando;

  const botones =
    rows.length === 0 ? null : editando ? (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={cancelar} disabled={guardando}>
          Cancelar
        </Button>
        <Button onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando…" : "💾 Guardar"}
        </Button>
      </div>
    ) : (
      <Button variant="secondary" onClick={empezarAEditar}>
        ✏️ Editar
      </Button>
    );

  const inputClass =
    "w-full rounded-lg border px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 " +
    (bloqueado
      ? "cursor-not-allowed border-border bg-slate-50 text-muted"
      : "border-primary/40 bg-white text-foreground shadow-sm");

  return (
    <Card>
      <CardHeader
        title={titulo}
        description={
          editando
            ? "Modo edición: escribe los nombres y pulsa «Guardar» para almacenar todos los cambios."
            : "Pulsa «Editar» para modificar el programa del mes. Al guardar, los cambios pasan solos a cada reunión."
        }
        action={botones}
      />
      <CardBody className="space-y-3">
        {aviso.error ? <Alert tone="error">{aviso.error}</Alert> : null}
        {aviso.success ? <Alert tone="success">{aviso.success}</Alert> : null}

        {rows.length === 0 ? (
          <p className="text-sm text-muted">
            No hay jueves ni sábados en el mes seleccionado.
          </p>
        ) : (
          <>
            {editando ? (
              <Alert tone="warning">
                ✏️ <strong>Estás editando el programa.</strong> Los cambios no
                se guardan hasta que pulses «Guardar».
                {pendientes > 0 ? (
                  <>
                    {" "}
                    Llevas <strong>{pendientes}</strong>{" "}
                    {pendientes === 1 ? "cambio" : "cambios"} sin guardar.
                  </>
                ) : null}
              </Alert>
            ) : (
              <p className="text-xs text-muted">
                🔒 Los recuadros están bloqueados para evitar cambios sin
                querer.
              </p>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Lista de hermanos para autocompletar (igual que en Asignaciones). */}
              <datalist id="resp-hermanos">
                {publishers.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>

              {rows.map((row) => {
                const puestas = AREPARTIR.filter((r) =>
                  (local[`${row.dateISO}_${r.key}`] ?? "").trim(),
                ).length;
                const completa = puestas === AREPARTIR.length;
                return (
                  <details
                    key={row.dateISO}
                    // Las fechas ya completas se pliegan: con 8 casillas por
                    // fecha, un mes entero son ~80 campos de scroll en el móvil.
                    open={!plegadas.has(row.dateISO)}
                    onToggle={(e) => {
                      const abierto = (e.currentTarget as HTMLDetailsElement)
                        .open;
                      setPlegadas((prev) => {
                        const next = new Set(prev);
                        if (abierto) next.delete(row.dateISO);
                        else next.add(row.dateISO);
                        return next;
                      });
                    }}
                    className={
                      "overflow-hidden rounded-2xl border bg-surface " +
                      (editando
                        ? "border-primary/50 shadow-md ring-1 ring-primary/20"
                        : "border-border shadow-sm")
                    }
                  >
                    <summary
                      className={
                        "flex cursor-pointer list-none items-center justify-between gap-2 border-b px-4 py-2.5 " +
                        (editando
                          ? "border-primary/30 bg-primary/5"
                          : "border-border bg-slate-50")
                      }
                    >
                      <span className="min-w-0 font-semibold text-foreground">
                        {weekdayNameOfISO(row.dateISO)}{" "}
                        {formatDateISO(row.dateISO)}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-[0.7rem]">
                        {!row.meetingId ? (
                          <span className="text-muted">Sin asignar aún</span>
                        ) : null}
                        <span
                          className={
                            completa
                              ? "font-semibold text-emerald-700"
                              : "text-muted"
                          }
                        >
                          {puestas} de {AREPARTIR.length}
                        </span>
                        <span aria-hidden className="text-muted">
                          {plegadas.has(row.dateISO) ? "▸" : "▾"}
                        </span>
                      </span>
                    </summary>
                    <table className="w-full border-collapse text-sm">
                      <tbody>
                        {RESPONSABILIDADES.map((resp) => {
                          const cellKey = `${row.dateISO}_${resp.key}`;
                          const value = local[cellKey] ?? "";
                          const cambiada =
                            !resp.inactiva &&
                            value.trim() !== (saved[cellKey] ?? "").trim();
                          const setVal = (v: string) =>
                            setLocal((prev) => ({ ...prev, [cellKey]: v }));
                          return (
                            <tr
                              key={resp.key}
                              className="border-b border-border/60"
                            >
                              <td className="w-1/2 px-3 py-2 align-middle">
                                <span
                                  className={
                                    "font-medium " +
                                    (resp.inactiva
                                      ? "text-muted"
                                      : resp.kind === "group"
                                        ? "text-emerald-700"
                                        : "text-foreground")
                                  }
                                >
                                  {resp.label}
                                </span>
                                {resp.inactiva ? (
                                  <span className="block text-xs text-muted">
                                    {resp.inactiva}
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1.5">
                                  {resp.inactiva ? (
                                    // La congregación ya no usa esta casilla,
                                    // pero lo que había escrito sigue guardado:
                                    // se enseña en gris y sin poder editarse,
                                    // para no hacer creer que se borró.
                                    <span className="min-w-0 flex-1 rounded-lg border border-dashed border-border bg-slate-50 px-2 py-1.5 text-sm text-muted">
                                      {value || "—"}
                                    </span>
                                  ) : resp.kind === "group" ? (
                                    // Limpieza: desplegable con los grupos
                                    // registrados.
                                    <select
                                      value={value}
                                      disabled={bloqueado}
                                      onChange={(e) => setVal(e.target.value)}
                                      aria-label={`${resp.label} — ${row.dateISO}`}
                                      className={inputClass}
                                    >
                                      <option value="">— Elegir grupo —</option>
                                      {value && !groups.includes(value) ? (
                                        <option value={value}>{value}</option>
                                      ) : null}
                                      {groups.map((g) => (
                                        <option key={g} value={g}>
                                          {g}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    // Hermano: campo de escritura con
                                    // autocompletado.
                                    <input
                                      type="text"
                                      list="resp-hermanos"
                                      value={value}
                                      disabled={bloqueado}
                                      onChange={(e) => setVal(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          (e.target as HTMLInputElement).blur();
                                        }
                                      }}
                                      // Corto a propósito: en el móvil el campo
                                      // es estrecho y el texto largo salía
                                      // cortado.
                                      placeholder={
                                        bloqueado ? "—" : "Nombre…"
                                      }
                                      autoComplete="off"
                                      aria-label={`${resp.label} — ${row.dateISO}`}
                                      className={inputClass}
                                    />
                                  )}
                                  {cambiada ? (
                                    <span
                                      className="shrink-0 text-amber-600"
                                      title="Cambio sin guardar"
                                      aria-label="Cambio sin guardar"
                                    >
                                      ●
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </details>
                );
              })}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
