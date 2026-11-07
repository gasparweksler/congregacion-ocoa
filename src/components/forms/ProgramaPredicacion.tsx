"use client";

// ============================================================================
//  El programa de predicación del mes.
//
//  Primero se dice cómo es una semana normal en la congregación: para cada
//  día, si se predica de mañana, de tarde, las dos o ninguna, y con qué
//  hora, lugar de encuentro, capitán y (si se quiere) territorio fijo. Se
//  elige también desde qué día hasta qué día (el mes entero, o del 1 al 15),
//  y con eso la pantalla propone las salidas, con los territorios repartidos
//  empezando por los que llevan más tiempo sin predicarse.
//
//  Después se corrige lo que haga falta salida por salida —fecha, turno,
//  hora, lugar, territorio y capitán, cada uno aparte—, se guarda y se
//  descarga en PDF, con o sin los mapas. "Asignar territorio
//  automáticamente" vuelve a repartir los territorios entre las salidas que
//  haya en la tabla, también como propuesta que se puede cambiar a mano.
//
//  Al guardar, las salidas cuentan para las estadísticas de los territorios,
//  y el plan de la semana queda guardado para el mes siguiente.
// ============================================================================

import { useActionState, useState } from "react";
import { guardarProgramaAction } from "@/server/territorio-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CollapsibleCard,
} from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { PeriodSelector } from "@/components/PeriodSelector";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PaletaOpciones } from "@/components/forms/PaletaOpciones";
import {
  FotosDelPrograma,
  type FotoDelPrograma,
} from "@/components/forms/FotosDelPrograma";
import { usePaletaRecordada } from "@/components/forms/usePaletaRecordada";
import { paletaDe } from "@/lib/programa-paletas";
import { monthName, weekdayName } from "@/lib/constants";
import {
  HORA_POR_DEFECTO,
  ORDEN_SEMANA,
  TURNOS,
  TURNOS_ORDEN,
  asignarTerritorios,
  etiquetaDeGrupos,
  cuantasSalidas,
  etiquetaDeFecha,
  fechaDeISO,
  filasDelPrograma,
  generarSalidas,
  isoDeFecha,
  nombreCompleto,
  normalizarRango,
  nuevaKey,
  ordenarSalidas,
  periodoDelPrograma,
  rangoDelMes,
  salidaDeGrupoEnBlanco,
  resumenDelPlan,
  resumenDelReparto,
  territoriosDelPrograma,
  turnoLabel,
  turnosDelPlan,
  ultimoDiaDelMes,
  type PlanSemanal,
  type RangoDias,
  type SalidaDeGrupo,
  type Salida,
  type SalidaBorrador,
  type Territorio,
  type Turno,
  type TurnoSemanal,
} from "@/lib/territorios";

const campo =
  "rounded-[10px] border border-border bg-white px-2.5 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25";

const etiqueta = "mb-0.5 block text-xs text-muted";

/** Dónde se recuerda la paleta elegida para este PDF, en este navegador. */
const RECUERDO_PALETA = "paleta-programa-predicacion";

function plural(n: number, singular: string, muchos: string): string {
  return n === 1 ? singular : muchos;
}

/** El día del mes de una fecha "2026-11-15" (0 si no se entiende). */
function diaDelIso(iso: string): number {
  const n = Number(iso.split("-")[2]);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Qué trozo del mes abarcan estas salidas. Si no hay ninguna, el mes entero:
 * así el programa nuevo empieza propuesto completo.
 */
function rangoDeLasSalidas(
  anio: number,
  mes: number,
  salidas: SalidaBorrador[],
): RangoDias {
  const dias = salidas.map((s) => diaDelIso(s.iso)).filter((d) => d > 0);
  if (dias.length === 0) return rangoDelMes(anio, mes);
  return normalizarRango(anio, mes, {
    desde: Math.min(...dias),
    hasta: Math.max(...dias),
  });
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
  gruposDisponibles,
  salidasDeGrupoIniciales,
  fotos,
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
  /** Los grupos de la congregación, los que haya: salen de la base. */
  gruposDisponibles: string[];
  /** Las salidas de cada grupo: lo último que se guardó. */
  salidasDeGrupoIniciales: SalidaDeGrupo[];
  /** Las fotos de la franja de arriba del impreso, si subieron alguna. */
  fotos: FotoDelPrograma[];
  congregacion: string;
}) {
  const [salidas, setSalidas] = useState<SalidaBorrador[]>(salidasGuardadas);
  const [plan, setPlan] = useState<PlanSemanal>(planInicial);
  // Desde qué día hasta qué día se arma el programa. Si el mes ya tiene uno
  // guardado, se parte del trozo que abarca; si no, del mes entero.
  const [rango, setRango] = useState<RangoDias>(() =>
    rangoDeLasSalidas(anio, mes, salidasGuardadas),
  );
  // El plan ocupa bastante: si el mes ya tiene su programa guardado, se
  // enseña plegado con su resumen y se abre al pulsar "Cambiar".
  const [verPlan, setVerPlan] = useState(salidasGuardadas.length === 0);
  const [conMapas, setConMapas] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [avisoPdf, setAvisoPdf] = useState("");
  // El resultado del último reparto automático, para verlo antes de guardar.
  const [avisoReparto, setAvisoReparto] = useState("");
  // Qué pasó al limpiar el programa, para que nadie crea que se borró más.
  const [avisoLimpieza, setAvisoLimpieza] = useState("");
  const [confirmarLimpieza, setConfirmarLimpieza] = useState(false);
  // Las salidas de cada grupo, dentro del plan de la semana.
  const [salidasDeGrupo, setSalidasDeGrupo] = useState<SalidaDeGrupo[]>(
    salidasDeGrupoIniciales,
  );
  // La paleta del PDF, con el mismo selector y la misma forma de recordarla
  // que la descarga de Responsabilidades.
  const [paleta, elegirPaleta] = usePaletaRecordada(RECUERDO_PALETA);

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

  // --- Las salidas de cada grupo -------------------------------------------

  function cambiarSalidaDeGrupo(key: string, cambios: Partial<SalidaDeGrupo>) {
    setSalidasDeGrupo((previas) =>
      previas.map((s) => (s.key === key ? { ...s, ...cambios } : s)),
    );
  }

  /** Marca o desmarca un grupo en una salida (varios = salida compartida). */
  function alternarGrupo(key: string, grupo: string) {
    setSalidasDeGrupo((previas) =>
      previas.map((s) =>
        s.key === key
          ? {
              ...s,
              grupos: s.grupos.includes(grupo)
                ? s.grupos.filter((g) => g !== grupo)
                : [...s.grupos, grupo],
            }
          : s,
      ),
    );
  }

  function anadirSalidaDeGrupo() {
    const porDefecto = valoresPorDefecto();
    // El primer grupo que todavía no sale ningún día: lo más habitual es ir
    // añadiendo uno por grupo.
    const yaSalen = new Set(salidasDeGrupo.flatMap((s) => s.grupos));
    const libre = gruposDisponibles.find((g) => !yaSalen.has(g));
    const nueva = salidaDeGrupoEnBlanco(
      libre ? [libre] : [],
      porDefecto.place || lugares[0] || "",
    );
    setSalidasDeGrupo((previas) => [
      ...previas,
      { ...nueva, captainName: porDefecto.captainName },
    ]);
  }

  function quitarSalidaDeGrupo(key: string) {
    setSalidasDeGrupo((previas) => previas.filter((s) => s.key !== key));
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

  /**
   * Arma las salidas del trozo elegido.
   *
   * Solo toca los días del rango: lo que haya fuera se queda como está, para
   * poder armar el programa en dos veces (del 1 al 15 y después del 16 al 30)
   * sin perder la primera mitad. Con el mes entero, reemplaza todo.
   */
  function generar() {
    const nuevas = generarSalidas({
      anio,
      mes,
      plan,
      rango,
      territoriosSugeridos: sugeridos,
      salidasDeGrupo,
    });
    const prefijo = `${anio}-${String(mes).padStart(2, "0")}-`;
    setSalidas((previas) => {
      const fuera = previas.filter((s) => {
        // Una fila que alguien movió a otro mes no la toca nadie.
        if (!s.iso.startsWith(prefijo)) return true;
        const dia = diaDelIso(s.iso);
        return dia > 0 && (dia < rango.desde || dia > rango.hasta);
      });
      return ordenarSalidas([...fuera, ...nuevas]);
    });
    setAvisoPdf("");
    setAvisoReparto("");
    setAvisoLimpieza("");
  }

  // --- El rango de días ----------------------------------------------------

  /** La fecha de un día del mes, como la quiere <input type="date">. */
  function isoDelDia(dia: number): string {
    return isoDeFecha(new Date(anio, mes - 1, dia, 12, 0, 0));
  }

  function cambiarRango(cambios: Partial<RangoDias>) {
    setRango((previo) => normalizarRango(anio, mes, { ...previo, ...cambios }));
  }

  // --- El reparto automático de territorios --------------------------------

  /**
   * Reparte los territorios entre las salidas que haya en la tabla. Es una
   * propuesta: queda en pantalla y se puede cambiar antes de guardar.
   */
  function repartirTerritorios() {
    const propuesta = asignarTerritorios(salidas, sugeridos);
    setSalidas(propuesta);
    setAvisoReparto(resumenDelReparto(propuesta));
    setAvisoPdf("");
    setAvisoLimpieza("");
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

  /**
   * Vacía la tabla para empezar el programa de cero.
   *
   * Solo borra lo que hay en pantalla: el programa guardado sigue en su sitio
   * hasta que se pulse "Guardar el programa", y los demás meses no se tocan.
   * Si alguien limpia sin querer, basta con recargar la página.
   */
  function limpiar() {
    setConfirmarLimpieza(false);
    if (salidas.length === 0) return;
    setSalidas([]);
    setRango(rangoDelMes(anio, mes));
    setAvisoReparto("");
    setAvisoPdf("");
    setAvisoLimpieza(
      salidasGuardadas.length > 0
        ? `Tabla vacía. El programa guardado de ${monthName(mes)} sigue en la base: se borrará cuando pulses “Guardar el programa”. Si fue sin querer, recarga la página y vuelve como estaba.`
        : "Tabla vacía. Elige las fechas y pulsa “Generar salidas” para empezar de nuevo.",
    );
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
        groups: [],
      },
    ]);
  }

  /** Marca o desmarca un grupo en una salida ya generada de la tabla. */
  function alternarGrupoDeSalida(key: string, grupo: string) {
    setSalidas((previas) =>
      previas.map((s) =>
        s.key === key
          ? {
              ...s,
              groups: s.groups.includes(grupo)
                ? s.groups.filter((g) => g !== grupo)
                : [...s.groups, grupo],
            }
          : s,
      ),
    );
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
        grupos: s.groups,
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

      // Las fotos del encabezado. Si alguna no se puede traer, el programa
      // baja igual: antes sin franja que sin programa.
      const fotosDelPdf: {
        dataUrl: string;
        ancho: number;
        alto: number;
      }[] = [];
      for (const f of fotos) {
        try {
          const r = await fetch(`/api/territorios/fotos/${f.id}`);
          if (!r.ok) continue;
          const dataUrl = await imagenes.comoDataUrl(await r.blob());
          const medida = await imagenes.medidaDeImagen(dataUrl);
          fotosDelPdf.push({
            dataUrl,
            ancho: medida.ancho,
            alto: medida.alto,
          });
        } catch {
          /* una foto que no llega no impide bajar el programa */
        }
      }

      const doc = new jsPDF({ unit: "pt", format: "letter" });
      pdfLib.dibujarProgramaPredicacion(doc, autoTable, {
        titulo: "Programa de Predicación",
        // El período dice lo que realmente abarca el programa: el mes entero,
        // o "Del 1 al 15 de noviembre de 2026" si es solo un trozo.
        periodo: periodoDelPrograma(
          anio,
          mes,
          rangoDeLasSalidas(anio, mes, salidas),
        ),
        congregacion,
        filas: filasDelPrograma(listas),
        mapas,
        fotos: fotosDelPdf,
        paleta,
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
  const seCrearan = cuantasSalidas(anio, mes, plan, rango, salidasDeGrupo);
  // Se puede armar el programa solo con las salidas de los grupos, aunque no
  // haya ningún turno de toda la congregación.
  const gruposQueSalen = salidasDeGrupo.filter((s) => s.grupos.length > 0);
  const sePuedeGenerar = turnosPorSemana > 0 || gruposQueSalen.length > 0;
  const mesCompleto = rango.desde === 1 && rango.hasta === ultimoDiaDelMes(anio, mes);

  return (
    <div className="space-y-6">
      {/* ================== Crear programa ==================
          Todo lo que arma el programa vive aquí, aparte de la tabla de
          salidas: elegir el mes, cómo es la semana y qué días se arman. */}
      <Card>
        <CardHeader
          title="Crear programa"
          description="Elige el mes y los días que quieres armar. Las salidas aparecen abajo y no se guardan hasta que lo pidas."
        />
        <CardBody className="space-y-5">

      {/* ---------------- Cómo es la semana ----------------
          "Ocultar" pliega solo este recuadro: ni las fechas de abajo ni la
          tabla de salidas se mueven. */}
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

        {/* ---------------- Predicación por grupos ----------------
            Los grupos salen solos de la congregación: los que haya. */}
        {verPlan ? (
          <div className="rounded-2xl border border-border bg-white p-3">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Predicación por grupos
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {gruposDisponibles.length === 0
                    ? "Esta congregación todavía no tiene grupos. Se crean en Publicadores → Grupos y aparecen aquí solos."
                    : `${gruposDisponibles.length} ${plural(gruposDisponibles.length, "grupo", "grupos")}: ${gruposDisponibles.join(", ")}. Marca dos o más en la misma salida y saldrán juntos, como una sola actividad.`}
                </p>
              </div>
              {gruposDisponibles.length > 0 ? (
                <Button variant="secondary" onClick={anadirSalidaDeGrupo}>
                  ✚ Añadir salida de grupo
                </Button>
              ) : null}
            </div>

            {gruposDisponibles.length > 0 && salidasDeGrupo.length === 0 ? (
              <p className="text-xs text-muted">
                Todavía no hay ninguna. Sin salidas de grupo, el programa es
                solo el de toda la congregación, como hasta ahora.
              </p>
            ) : null}

            <div className="space-y-3">
              {salidasDeGrupo.map((s) => (
                <div
                  key={s.key}
                  className={
                    s.grupos.length === 0
                      ? "rounded-xl border border-amber-300 bg-amber-50/60 p-3"
                      : "rounded-xl border border-border bg-slate-50 p-3"
                  }
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {gruposDisponibles.map((g) => {
                        const puesto = s.grupos.includes(g);
                        return (
                          <label
                            key={g}
                            className={
                              puesto
                                ? "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-primary bg-indigo-50 px-2.5 py-1 text-xs font-medium text-primary"
                                : "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-xs text-muted hover:border-primary/40"
                            }
                          >
                            <input
                              type="checkbox"
                              checked={puesto}
                              onChange={() => alternarGrupo(s.key, g)}
                              className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary/25"
                            />
                            {g}
                          </label>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => quitarSalidaDeGrupo(s.key)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Quitar
                    </button>
                  </div>

                  {s.grupos.length === 0 ? (
                    <p className="mb-2 text-xs text-amber-800">
                      Marca al menos un grupo: si no, esta salida no se guarda.
                    </p>
                  ) : (
                    <p className="mb-2 text-xs text-muted">
                      {s.grupos.length > 1 ? "Salida compartida · " : ""}
                      {etiquetaDeGrupos(s.grupos)}
                    </p>
                  )}

                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <label className={etiqueta} htmlFor={`g-dia-${s.key}`}>
                        Día de predicación
                      </label>
                      <select
                        id={`g-dia-${s.key}`}
                        value={s.dia}
                        onChange={(e) =>
                          cambiarSalidaDeGrupo(s.key, {
                            dia: Number(e.target.value),
                          })
                        }
                        className={`${campo} w-full`}
                      >
                        {ORDEN_SEMANA.map((d) => (
                          <option key={d} value={d}>
                            {weekdayName(d)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={etiqueta} htmlFor={`g-hora-${s.key}`}>
                        Horario
                      </label>
                      <input
                        id={`g-hora-${s.key}`}
                        value={s.time}
                        onChange={(e) =>
                          cambiarSalidaDeGrupo(s.key, { time: e.target.value })
                        }
                        className={`${campo} w-full`}
                        maxLength={20}
                        placeholder="10:00"
                      />
                    </div>
                    <div>
                      <label className={etiqueta} htmlFor={`g-lugar-${s.key}`}>
                        Lugar de encuentro
                      </label>
                      <input
                        id={`g-lugar-${s.key}`}
                        value={s.place}
                        onChange={(e) =>
                          cambiarSalidaDeGrupo(s.key, { place: e.target.value })
                        }
                        list="lugares-guardados"
                        placeholder="Salón del Reino"
                        className={`${campo} w-full`}
                        maxLength={120}
                      />
                    </div>
                    <div>
                      <label className={etiqueta} htmlFor={`g-terr-${s.key}`}>
                        Territorio
                      </label>
                      <select
                        id={`g-terr-${s.key}`}
                        value={s.territoryId}
                        onChange={(e) =>
                          cambiarSalidaDeGrupo(s.key, {
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
                    <div className="lg:col-span-2">
                      <label
                        className={etiqueta}
                        htmlFor={`g-capitan-${s.key}`}
                      >
                        Capitán
                      </label>
                      <input
                        id={`g-capitan-${s.key}`}
                        value={s.captainName}
                        onChange={(e) =>
                          cambiarSalidaDeGrupo(s.key, {
                            captainName: e.target.value,
                          })
                        }
                        list="capitanes-guardados"
                        placeholder="Gastón Mondaca"
                        className={`${campo} w-full`}
                        maxLength={120}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* ---------------- Qué días se arman ----------------
          Siempre a la vista: no depende de "Ocultar". */}
      <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <span className={etiqueta}>Mes correspondiente</span>
              <PeriodSelector year={anio} month={mes} />
            </div>
            <div>
              <label className={etiqueta} htmlFor="rango-desde">
                Fecha de inicio
              </label>
              <input
                id="rango-desde"
                type="date"
                value={isoDelDia(rango.desde)}
                min={isoDelDia(1)}
                max={isoDelDia(ultimoDiaDelMes(anio, mes))}
                onChange={(e) =>
                  cambiarRango({ desde: diaDelIso(e.target.value) })
                }
                className={`${campo} w-40`}
              />
            </div>
            <div>
              <label className={etiqueta} htmlFor="rango-hasta">
                Fecha de término
              </label>
              <input
                id="rango-hasta"
                type="date"
                value={isoDelDia(rango.hasta)}
                min={isoDelDia(1)}
                max={isoDelDia(ultimoDiaDelMes(anio, mes))}
                onChange={(e) =>
                  cambiarRango({ hasta: diaDelIso(e.target.value) })
                }
                className={`${campo} w-40`}
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => setRango(rangoDelMes(anio, mes))}
              disabled={mesCompleto}
            >
              📅 Todo el mes
            </Button>
            {/* A la derecha del todo: vacía la tabla para empezar de cero. */}
            <Button
              variant="secondary"
              onClick={() => setConfirmarLimpieza(true)}
              disabled={salidas.length === 0}
              className="border-red-200 text-red-600 hover:bg-red-50 sm:ml-auto"
            >
              🧹 Limpiar programa
            </Button>
          </div>

          <ConfirmDialog
            open={confirmarLimpieza}
            title={`¿Vaciar el programa de ${monthName(mes)} de ${anio}?`}
            description={
              salidasGuardadas.length > 0
                ? `Se quitan las ${salidas.length} ${plural(salidas.length, "salida", "salidas")} de la tabla para empezar de cero. El programa guardado (${salidasGuardadas.length} ${plural(salidasGuardadas.length, "salida", "salidas")}) se borra de verdad cuando pulses “Guardar el programa”; los demás meses no se tocan, y si te arrepientes basta con recargar la página.`
                : `Se quitan las ${salidas.length} ${plural(salidas.length, "salida", "salidas")} de la tabla. Este mes todavía no tiene nada guardado, así que no se borra nada de la base.`
            }
            confirmLabel="Sí, vaciar la tabla"
            onConfirm={limpiar}
            onCancel={() => setConfirmarLimpieza(false)}
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={generar} disabled={!sePuedeGenerar}>
              🗓️ Generar salidas
            </Button>
            <span className="text-xs text-muted">
              {!sePuedeGenerar
                ? "Marca al menos un turno en “Cómo es una semana normal”, o una salida de grupo, para poder generar."
                : `Se armarán ${seCrearan} ${plural(seCrearan, "salida", "salidas")} · ${periodoDelPrograma(anio, mes, rango)} · ${turnosPorSemana === 0 ? "solo las de los grupos" : resumenDelPlan(plan)}${gruposQueSalen.length > 0 && turnosPorSemana > 0 ? `, y ${gruposQueSalen.length} ${plural(gruposQueSalen.length, "salida de grupo", "salidas de grupo")} por semana` : ""}. ${
                    mesCompleto
                      ? "Reemplaza lo que haya en la tabla de abajo"
                      : "Reemplaza solo esos días: lo que haya fuera del rango se queda como está"
                  } (todavía sin guardar).`}
            </span>
          </div>

          {avisoLimpieza ? (
            <Alert tone="warning">{avisoLimpieza}</Alert>
          ) : null}
      </div>
        </CardBody>
      </Card>

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

      {/* ================== Las salidas ==================
          Lo ya generado o guardado del mes, con su propia tarjeta: aquí se
          corrige salida por salida, se guarda y se descarga. */}
      <Card>
        <CardHeader
          title={`Salidas de ${monthName(mes)} de ${anio}`}
          description="Cada salida se edita por separado. Se guarda el mes completo: lo que quites también se quita al guardar."
          action={
            salidas.length > 0 ? (
              <Badge tone="slate">
                {salidas.length} {plural(salidas.length, "salida", "salidas")}
              </Badge>
            ) : null
          }
        />
        <CardBody className="space-y-6">

      {salidas.length === 0 ? (
        <Alert tone="info">
          Todavía no hay salidas en {monthName(mes)} de {anio}. Arriba, en
          “Crear programa”, marca los turnos de cada día, elige las fechas y
          pulsa “Generar salidas”.
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
                {gruposDisponibles.length > 0 ? (
                  <th className="border-b border-border px-2 py-2 text-left font-semibold text-muted">
                    Grupos
                  </th>
                ) : null}
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
                    {gruposDisponibles.length > 0 ? (
                      <td className="border-b border-border px-2 py-2">
                        <div className="flex flex-col gap-0.5">
                          {gruposDisponibles.map((g) => (
                            <label
                              key={g}
                              className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-foreground"
                            >
                              <input
                                type="checkbox"
                                checked={s.groups.includes(g)}
                                onChange={() => alternarGrupoDeSalida(s.key, g)}
                                className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary/25"
                              />
                              {g}
                            </label>
                          ))}
                          <span className="mt-0.5 text-[0.65rem] text-muted">
                            {s.groups.length === 0
                              ? "Toda la congregación"
                              : s.groups.length > 1
                                ? "Compartida"
                                : ""}
                          </span>
                        </div>
                      </td>
                    ) : null}
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

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={anadir}>
            ✚ Añadir una salida
          </Button>
          <Button
            variant="secondary"
            onClick={repartirTerritorios}
            disabled={salidas.length === 0 || sugeridos.length === 0}
          >
            🎯 Asignar territorio automáticamente
          </Button>
          {sinTerritorio > 0 ? (
            <span className="text-xs text-muted">
              {sinTerritorio} sin territorio (no cuentan para las estadísticas)
            </span>
          ) : null}
        </div>

        {avisoReparto ? (
          <Alert tone="info">
            <strong>Propuesta de territorios.</strong> {avisoReparto} Revisa la
            columna “Territorio” y cambia a mano lo que haga falta: nada se
            guarda hasta que pulses “Guardar el programa”.
          </Alert>
        ) : (
          <p className="text-xs text-muted">
            “Asignar territorio automáticamente” reparte todos los territorios
            entre las salidas de la tabla, empezando por los que llevan más
            tiempo sin predicarse y sin que ninguno salga mucho más que otro.
            Lo que proponga se puede cambiar antes de guardar.
          </p>
        )}
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
          {/* Y las salidas de cada grupo, por lo mismo. */}
          <input
            type="hidden"
            name="planGrupos"
            value={JSON.stringify(
              salidasDeGrupo.map((s) => ({
                grupos: s.grupos,
                dia: s.dia,
                time: s.time,
                place: s.place,
                territoryId: s.territoryId,
                captainName: s.captainName,
              })),
            )}
          />
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
                groups: s.groups,
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

      {/* La misma elección de colores que el PDF de Responsabilidades: el
          mismo componente, las mismas cinco paletas. */}
      <CollapsibleCard
        title="Elegir Paleta de Colores"
        description={`Ahora mismo: ${paletaDe(paleta).nombre}. Así se verá la tabla del PDF.`}
      >
        <PaletaOpciones
          value={paleta}
          onChange={elegirPaleta}
          name="paleta-predicacion"
          ejemplo={["Sábado 7", "Domingo 8"]}
        />
      </CollapsibleCard>

      {/* La franja de fotos de arriba del impreso. Se quedan puestas mes a
          mes: se suben una vez y ya salen en todos los programas. */}
      <CollapsibleCard
        title="Fotos del encabezado del PDF"
        description={
          fotos.length === 0
            ? "Ninguna todavía: el programa se imprime sin la franja de arriba."
            : `${fotos.length} ${plural(fotos.length, "foto", "fotos")} en la franja de arriba del programa.`
        }
      >
        <FotosDelPrograma fotos={fotos} />
      </CollapsibleCard>
        </CardBody>
      </Card>
    </div>
  );
}
