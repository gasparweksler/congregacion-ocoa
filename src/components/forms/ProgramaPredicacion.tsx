"use client";

// ============================================================================
//  El programa de predicación del mes.
//
//  Primero se dice cómo es una semana normal en la congregación: para cada
//  día, si se predica de mañana, de tarde, las dos o ninguna, y con qué
//  hora, lugar de encuentro, capitán y (si se quiere) territorio fijo. Con
//  eso la pantalla propone todas las salidas del mes, con los territorios
//  repartidos empezando por los que llevan más tiempo sin predicarse.
//
//  Después se corrige lo que haga falta salida por salida, se guarda y se
//  descarga en PDF, con o sin los mapas. Al guardar, las salidas cuentan
//  para las estadísticas de los territorios, y el plan de la semana queda
//  guardado para el mes siguiente.
// ============================================================================

import { useActionState, useState } from "react";
import { guardarProgramaAction } from "@/server/territorio-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Alert, Button, Badge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { monthName, weekdayName } from "@/lib/constants";
import {
  HORA_POR_DEFECTO,
  ORDEN_SEMANA,
  TURNOS,
  TURNOS_ORDEN,
  cuantasSalidas,
  etiquetaDeFecha,
  fechaDeISO,
  filasDelPrograma,
  generarSalidas,
  isoDeFecha,
  nombreCompleto,
  nuevaKey,
  ordenarSalidas,
  resumenDelPlan,
  territoriosDelPrograma,
  turnoLabel,
  turnosDelPlan,
  type PlanSemanal,
  type Salida,
  type SalidaBorrador,
  type Territorio,
  type Turno,
  type TurnoSemanal,
} from "@/lib/territorios";

const campo =
  "rounded-[10px] border border-border bg-white px-2.5 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25";

const etiqueta = "mb-0.5 block text-xs text-muted";

function plural(n: number, singular: string, muchos: string): string {
  return n === 1 ? singular : muchos;
}

export function ProgramaPredicacion({
  anio,
  mes,
  territorios,
  sugeridos,
  capitanes,
  lugares,
  salidasGuardadas,
  planInicial,
  congregacion,
}: {
  anio: number;
  mes: number;
  territorios: Territorio[];
  /** Ids de territorios, del más olvidado al menos. */
  sugeridos: string[];
  capitanes: string[];
  lugares: string[];
  salidasGuardadas: SalidaBorrador[];
  /** Cómo es una semana normal: lo último que se guardó. */
  planInicial: PlanSemanal;
  congregacion: string;
}) {
  const [salidas, setSalidas] = useState<SalidaBorrador[]>(salidasGuardadas);
  const [plan, setPlan] = useState<PlanSemanal>(planInicial);
  // El plan ocupa bastante: si el mes ya tiene su programa guardado, se
  // enseña plegado con su resumen y se abre al pulsar "Cambiar".
  const [verPlan, setVerPlan] = useState(salidasGuardadas.length === 0);
  const [conMapas, setConMapas] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [avisoPdf, setAvisoPdf] = useState("");

  const [state, action] = useActionState(
    guardarProgramaAction,
    EMPTY_FORM_STATE,
  );

  const porId = new Map(territorios.map((t) => [t.id, t]));

  // --- El plan de la semana ------------------------------------------------

  function cambiarTurno(
    dia: number,
    turno: Turno,
    cambios: Partial<TurnoSemanal>,
  ) {
    setPlan((previo) =>
      previo.map((d, i) =>
        i === dia ? { ...d, [turno]: { ...d[turno], ...cambios } } : d,
      ),
    );
  }

  /** Copia un día entero (turnos, horas, lugar y capitán) a los demás. */
  function copiarATodos(dia: number) {
    setPlan((previo) =>
      previo.map(() => ({
        MANANA: { ...previo[dia].MANANA },
        TARDE: { ...previo[dia].TARDE },
      })),
    );
  }

  /** Lo que se pone en una salida añadida a mano: lo del primer día activo. */
  function valoresPorDefecto(): {
    time: string;
    place: string;
    captainName: string;
  } {
    for (const d of ORDEN_SEMANA) {
      for (const turno of TURNOS_ORDEN) {
        const c = plan[d]?.[turno];
        if (c?.activo) {
          return { time: c.time, place: c.place, captainName: c.captainName };
        }
      }
    }
    return {
      time: HORA_POR_DEFECTO.MANANA,
      place: lugares[0] ?? "",
      captainName: "",
    };
  }

  function generar() {
    setSalidas(
      generarSalidas({ anio, mes, plan, territoriosSugeridos: sugeridos }),
    );
    setAvisoPdf("");
  }

  // --- Las salidas ---------------------------------------------------------

  function cambiar(key: string, campos: Partial<SalidaBorrador>) {
    setSalidas((previas) =>
      previas.map((s) => (s.key === key ? { ...s, ...campos } : s)),
    );
  }

  function quitar(key: string) {
    setSalidas((previas) => previas.filter((s) => s.key !== key));
  }

  function anadir() {
    const ultima = salidas[salidas.length - 1];
    const porDefecto = valoresPorDefecto();
    setSalidas((previas) => [
      ...previas,
      {
        key: nuevaKey(),
        iso: ultima?.iso ?? isoDeFecha(new Date(anio, mes - 1, 1, 12, 0, 0)),
        turno: TURNOS.MANANA,
        time: ultima?.time ?? porDefecto.time,
        place: ultima?.place ?? porDefecto.place,
        territoryId: "",
        captainName: ultima?.captainName ?? porDefecto.captainName,
      },
    ]);
  }

  /** Las salidas como las necesita el PDF, ya con el territorio resuelto. */
  function comoSalidas(): Salida[] {
    const out: Salida[] = [];
    for (const s of salidas) {
      const fecha = fechaDeISO(s.iso);
      if (!fecha) continue;
      const t = s.territoryId ? porId.get(s.territoryId) : undefined;
      out.push({
        id: s.key,
        date: fecha,
        turno: s.turno,
        time: s.time,
        place: s.place,
        captainName: s.captainName,
        territorio: t ? { id: t.id, number: t.number, name: t.name } : null,
      });
    }
    return out;
  }

  async function descargarPdf() {
    setDescargando(true);
    setAvisoPdf("");
    try {
      const [{ jsPDF }, autoTableMod, pdfLib, imagenes] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
        import("@/lib/territorios-pdf"),
        import("@/lib/pdf-a-imagenes"),
      ]);
      const autoTable = autoTableMod.default;

      const listas = comoSalidas();
      const mapas: {
        titulo: string;
        dataUrl: string;
        ancho: number;
        alto: number;
      }[] = [];
      const sinMapa: string[] = [];

      if (conMapas) {
        for (const t of territoriosDelPrograma(listas)) {
          try {
            const r = await fetch(`/api/territorios/${t.id}/mapa`);
            if (!r.ok) {
              sinMapa.push(nombreCompleto(t));
              continue;
            }
            const dataUrl = await imagenes.comoDataUrl(await r.blob());
            const medida = await imagenes.medidaDeImagen(dataUrl);
            mapas.push({
              titulo: nombreCompleto(t),
              dataUrl,
              ancho: medida.ancho,
              alto: medida.alto,
            });
          } catch {
            sinMapa.push(nombreCompleto(t));
          }
        }
      }

      const doc = new jsPDF({ unit: "pt", format: "letter" });
      pdfLib.dibujarProgramaPredicacion(doc, autoTable, {
        titulo: "Programa de Predicación",
        periodo: `${monthName(mes)} ${anio}`,
        congregacion,
        filas: filasDelPrograma(listas),
        mapas,
      });
      doc.save(`programa-predicacion-${anio}-${String(mes).padStart(2, "0")}.pdf`);

      if (sinMapa.length > 0) {
        setAvisoPdf(
          `El PDF se descargó, pero ${sinMapa.length} ${plural(
            sinMapa.length,
            "territorio no tiene mapa",
            "territorios no tienen mapa",
          )}: ${sinMapa.slice(0, 6).join(", ")}.`,
        );
      }
    } catch (err) {
      setAvisoPdf(
        err instanceof Error && err.message
          ? `No se pudo generar el PDF: ${err.message}`
          : "No se pudo generar el PDF.",
      );
    } finally {
      setDescargando(false);
    }
  }

  const enOrden = ordenarSalidas(salidas);
  const sinTerritorio = salidas.filter((s) => !s.territoryId).length;
  const turnosPorSemana = turnosDelPlan(plan);
  const seCrearan = cuantasSalidas(anio, mes, plan);

  return (
    <div className="space-y-6">
      {/* ---------------- Cómo es la semana ---------------- */}
      <div className="space-y-4 rounded-2xl border border-border bg-slate-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Cómo es una semana normal
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {verPlan
                ? "Marca los turnos de cada día. Cada uno lleva su hora, su lugar de encuentro y su capitán; el territorio se reparte solo, salvo que le pongas uno fijo."
                : `Se predica: ${resumenDelPlan(plan)}.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setVerPlan((v) => !v)}
            className="shrink-0 rounded-md px-2.5 py-1 text-sm font-medium text-primary hover:bg-indigo-50"
          >
            {verPlan ? "Ocultar" : "Cambiar"}
          </button>
        </div>

        {verPlan ? (
          <div className="grid gap-3 lg:grid-cols-2">
          {ORDEN_SEMANA.map((d) => {
            const dia = plan[d];
            const activos = TURNOS_ORDEN.filter((t) => dia?.[t]?.activo).length;
            return (
              <div
                key={d}
                className={
                  activos > 0
                    ? "rounded-2xl border border-primary/30 bg-white p-3"
                    : "rounded-2xl border border-border bg-white/60 p-3"
                }
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {weekdayName(d)}
                  </p>
                  {activos > 0 ? (
                    <button
                      type="button"
                      onClick={() => copiarATodos(d)}
                      className="rounded-md px-2 py-0.5 text-xs font-medium text-primary hover:bg-indigo-50"
                      title="Deja todos los días de la semana igual que este"
                    >
                      Copiar a los demás
                    </button>
                  ) : (
                    <span className="text-xs text-muted">No se predica</span>
                  )}
                </div>

                {TURNOS_ORDEN.map((turno) => {
                  const cfg = dia?.[turno];
                  if (!cfg) return null;
                  return (
                    <div
                      key={turno}
                      className="border-t border-border/70 py-2 first:border-t-0"
                    >
                      <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
                        <input
                          type="checkbox"
                          checked={cfg.activo}
                          onChange={(e) =>
                            cambiarTurno(d, turno, { activo: e.target.checked })
                          }
                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary/25"
                        />
                        {turnoLabel(turno)}
                      </label>

                      {cfg.activo ? (
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <div>
                            <label
                              className={etiqueta}
                              htmlFor={`hora-${d}-${turno}`}
                            >
                              Hora
                            </label>
                            <input
                              id={`hora-${d}-${turno}`}
                              value={cfg.time}
                              onChange={(e) =>
                                cambiarTurno(d, turno, { time: e.target.value })
                              }
                              className={`${campo} w-full`}
                              maxLength={20}
                            />
                          </div>
                          <div>
                            <label
                              className={etiqueta}
                              htmlFor={`lugar-${d}-${turno}`}
                            >
                              Lugar de encuentro
                            </label>
                            <input
                              id={`lugar-${d}-${turno}`}
                              value={cfg.place}
                              onChange={(e) =>
                                cambiarTurno(d, turno, { place: e.target.value })
                              }
                              list="lugares-guardados"
                              placeholder="Salón del Reino"
                              className={`${campo} w-full`}
                              maxLength={120}
                            />
                          </div>
                          <div>
                            <label
                              className={etiqueta}
                              htmlFor={`capitan-${d}-${turno}`}
                            >
                              Capitán
                            </label>
                            <input
                              id={`capitan-${d}-${turno}`}
                              value={cfg.captainName}
                              onChange={(e) =>
                                cambiarTurno(d, turno, {
                                  captainName: e.target.value,
                                })
                              }
                              list="capitanes-guardados"
                              placeholder="Gastón Mondaca"
                              className={`${campo} w-full`}
                              maxLength={120}
                            />
                          </div>
                          <div>
                            <label
                              className={etiqueta}
                              htmlFor={`terr-${d}-${turno}`}
                            >
                              Territorio
                            </label>
                            <select
                              id={`terr-${d}-${turno}`}
                              value={cfg.territoryId}
                              onChange={(e) =>
                                cambiarTurno(d, turno, {
                                  territoryId: e.target.value,
                                })
                              }
                              className={`${campo} w-full`}
                            >
                              <option value="">— Se reparte solo —</option>
                              {territorios.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {nombreCompleto(t)}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
          </div>
        ) : null}

        {verPlan ? (
          <div className="flex flex-wrap items-center gap-3">
          <Button onClick={generar} disabled={turnosPorSemana === 0}>
            🗓️ Generar las salidas de {monthName(mes)}
          </Button>
          <span className="text-xs text-muted">
            {turnosPorSemana === 0
              ? "Marca al menos un turno para poder generar."
              : `Se armarán ${seCrearan} ${plural(seCrearan, "salida", "salidas")} en ${monthName(mes)}: ${resumenDelPlan(plan)}. Reemplaza lo que haya en la tabla de abajo (todavía sin guardar).`}
          </span>
          </div>
        ) : null}
      </div>

      {/* Listas guardadas, para escribir rápido. */}
      <datalist id="capitanes-guardados">
        {capitanes.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="lugares-guardados">
        {lugares.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>

      {/* ---------------- Las salidas ---------------- */}
      {salidas.length === 0 ? (
        <Alert tone="info">
          Todavía no hay salidas en {monthName(mes)} de {anio}. Marca arriba
          los turnos de cada día y pulsa “Generar las salidas”.
        </Alert>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-border px-2 py-2 text-left font-semibold text-muted">
                  Fecha
                </th>
                <th className="border-b border-border px-2 py-2 text-left font-semibold text-muted">
                  Turno
                </th>
                <th className="border-b border-border px-2 py-2 text-left font-semibold text-muted">
                  Hora
                </th>
                <th className="border-b border-border px-2 py-2 text-left font-semibold text-muted">
                  Lugar de encuentro
                </th>
                <th className="border-b border-border px-2 py-2 text-left font-semibold text-muted">
                  Territorio
                </th>
                <th className="border-b border-border px-2 py-2 text-left font-semibold text-muted">
                  Capitán
                </th>
                <th className="border-b border-border px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {enOrden.map((s) => {
                const fecha = fechaDeISO(s.iso);
                return (
                  <tr key={s.key}>
                    <td className="border-b border-border px-2 py-2">
                      <input
                        type="date"
                        value={s.iso}
                        onChange={(e) => cambiar(s.key, { iso: e.target.value })}
                        className={`${campo} w-36`}
                        aria-label="Fecha de la salida"
                      />
                      {fecha ? (
                        <span className="mt-0.5 block text-xs text-muted">
                          {etiquetaDeFecha(fecha)}
                        </span>
                      ) : null}
                    </td>
                    <td className="border-b border-border px-2 py-2">
                      <select
                        value={s.turno}
                        onChange={(e) =>
                          cambiar(s.key, { turno: e.target.value as Turno })
                        }
                        className={`${campo} w-28`}
                        aria-label="Turno"
                      >
                        <option value={TURNOS.MANANA}>
                          {turnoLabel(TURNOS.MANANA)}
                        </option>
                        <option value={TURNOS.TARDE}>
                          {turnoLabel(TURNOS.TARDE)}
                        </option>
                      </select>
                    </td>
                    <td className="border-b border-border px-2 py-2">
                      <input
                        value={s.time}
                        onChange={(e) => cambiar(s.key, { time: e.target.value })}
                        className={`${campo} w-20`}
                        maxLength={20}
                        aria-label="Hora"
                      />
                    </td>
                    <td className="border-b border-border px-2 py-2">
                      <input
                        value={s.place}
                        onChange={(e) => cambiar(s.key, { place: e.target.value })}
                        list="lugares-guardados"
                        className={`${campo} w-44`}
                        maxLength={120}
                        aria-label="Lugar de encuentro"
                      />
                    </td>
                    <td className="border-b border-border px-2 py-2">
                      <select
                        value={s.territoryId}
                        onChange={(e) =>
                          cambiar(s.key, { territoryId: e.target.value })
                        }
                        className={`${campo} w-52`}
                        aria-label="Territorio"
                      >
                        <option value="">— Sin territorio —</option>
                        {territorios.map((t) => (
                          <option key={t.id} value={t.id}>
                            {nombreCompleto(t)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border-b border-border px-2 py-2">
                      <input
                        value={s.captainName}
                        onChange={(e) =>
                          cambiar(s.key, { captainName: e.target.value })
                        }
                        list="capitanes-guardados"
                        className={`${campo} w-44`}
                        maxLength={120}
                        aria-label="Capitán"
                      />
                    </td>
                    <td className="border-b border-border px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => quitar(s.key)}
                        className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={anadir}>
          ✚ Añadir una salida
        </Button>
        {salidas.length > 0 ? (
          <span className="text-xs text-muted">
            {salidas.length} {plural(salidas.length, "salida", "salidas")}
            {sinTerritorio > 0
              ? ` · ${sinTerritorio} sin territorio (no cuentan para las estadísticas)`
              : ""}
          </span>
        ) : null}
      </div>

      {/* ---------------- Guardar y descargar ---------------- */}
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
      {avisoPdf ? <Alert tone="warning">{avisoPdf}</Alert> : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <form action={action}>
          <input type="hidden" name="anio" value={anio} />
          <input type="hidden" name="mes" value={mes} />
          {/* El plan viaja con el programa: así el mes que viene ya aparece
              puesto y no hay que marcarlo de nuevo. */}
          <input type="hidden" name="plan" value={JSON.stringify(plan)} />
          <input
            type="hidden"
            name="salidas"
            value={JSON.stringify(
              enOrden.map((s) => ({
                iso: s.iso,
                turno: s.turno,
                time: s.time,
                place: s.place,
                territoryId: s.territoryId,
                captainName: s.captainName,
              })),
            )}
          />
          <SubmitButton pendingText="Guardando…">
            💾 Guardar el programa
          </SubmitButton>
        </form>

        <Button
          variant="secondary"
          onClick={descargarPdf}
          disabled={descargando || salidas.length === 0}
        >
          {descargando ? "Generando el PDF…" : "🖨️ Descargar en PDF"}
        </Button>

        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={conMapas}
            onChange={(e) => setConMapas(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary/25"
          />
          Incluir el mapa de cada territorio
        </label>

        {salidas.length > 0 ? (
          <Badge tone="amber">
            Guarda antes de salir: los cambios de la tabla no se guardan solos
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
