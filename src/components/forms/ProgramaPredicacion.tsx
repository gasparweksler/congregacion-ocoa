"use client";

// ============================================================================
//  El programa de predicación del mes.
//
//  Se elige el mes y la modalidad (solo mañana, solo tarde, o las dos) y la
//  pantalla propone las salidas de ese mes: una por día elegido y turno, con
//  los territorios repartidos empezando por los que llevan más tiempo sin
//  predicarse. Después se corrige lo que haga falta, se guarda y se descarga
//  en PDF, con o sin los mapas.
//
//  Al guardar, las salidas cuentan para las estadísticas de los territorios.
// ============================================================================

import { useActionState, useState } from "react";
import { guardarProgramaAction } from "@/server/territorio-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Alert, Button, Input, Label, Select, Badge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { monthName, weekdayName } from "@/lib/constants";
import {
  MODALIDAD_LABELS,
  HORA_POR_DEFECTO,
  TURNOS,
  etiquetaDeFecha,
  fechaDeISO,
  filasDelPrograma,
  generarSalidas,
  isoDeFecha,
  nombreCompleto,
  nuevaKey,
  ordenarSalidas,
  territoriosDelPrograma,
  turnoLabel,
  type Modalidad,
  type Salida,
  type SalidaBorrador,
  type Territorio,
  type Turno,
} from "@/lib/territorios";

/** Días de la semana, empezando en domingo, como los numera el navegador. */
const DIAS = [0, 1, 2, 3, 4, 5, 6];

const campo =
  "rounded-[10px] border border-border bg-white px-2.5 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25";

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
  congregacion: string;
}) {
  const [salidas, setSalidas] = useState<SalidaBorrador[]>(salidasGuardadas);
  const [modalidad, setModalidad] = useState<Modalidad>("manana");
  const [dias, setDias] = useState<number[]>([6, 0]); // sábado y domingo
  const [lugar, setLugar] = useState(lugares[0] ?? "Salón del Reino");
  const [capitan, setCapitan] = useState("");
  const [horaManana, setHoraManana] = useState(HORA_POR_DEFECTO.MANANA);
  const [horaTarde, setHoraTarde] = useState(HORA_POR_DEFECTO.TARDE);
  const [conMapas, setConMapas] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [avisoPdf, setAvisoPdf] = useState("");

  const [state, action] = useActionState(
    guardarProgramaAction,
    EMPTY_FORM_STATE,
  );

  const porId = new Map(territorios.map((t) => [t.id, t]));

  function generar() {
    setSalidas(
      generarSalidas({
        anio,
        mes,
        diasSemana: dias,
        modalidad,
        lugar,
        capitan,
        horas: { MANANA: horaManana, TARDE: horaTarde },
        territoriosSugeridos: sugeridos,
      }),
    );
    setAvisoPdf("");
  }

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
    setSalidas((previas) => [
      ...previas,
      {
        key: nuevaKey(),
        iso: ultima?.iso ?? isoDeFecha(new Date(anio, mes - 1, 1, 12, 0, 0)),
        turno: TURNOS.MANANA,
        time: horaManana,
        place: ultima?.place ?? lugar,
        territoryId: "",
        captainName: ultima?.captainName ?? capitan,
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

  return (
    <div className="space-y-6">
      {/* ---------------- Armar el mes ---------------- */}
      <div className="space-y-4 rounded-2xl border border-border bg-slate-50 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="modalidad">Modalidad</Label>
            <Select
              id="modalidad"
              value={modalidad}
              onChange={(e) => setModalidad(e.target.value as Modalidad)}
            >
              {(
                Object.keys(MODALIDAD_LABELS) as (keyof typeof MODALIDAD_LABELS)[]
              ).map((m) => (
                <option key={m} value={m}>
                  {MODALIDAD_LABELS[m]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="lugar-defecto">Lugar de encuentro</Label>
            <Input
              id="lugar-defecto"
              value={lugar}
              onChange={(e) => setLugar(e.target.value)}
              list="lugares-guardados"
              placeholder="Salón del Reino"
              maxLength={120}
            />
          </div>
          <div>
            <Label htmlFor="capitan-defecto">Capitán (opcional)</Label>
            <Input
              id="capitan-defecto"
              value={capitan}
              onChange={(e) => setCapitan(e.target.value)}
              list="capitanes-guardados"
              placeholder="Gastón Mondaca"
              maxLength={120}
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="hora-manana">Hora mañana</Label>
              <Input
                id="hora-manana"
                value={horaManana}
                onChange={(e) => setHoraManana(e.target.value)}
                maxLength={20}
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="hora-tarde">Hora tarde</Label>
              <Input
                id="hora-tarde"
                value={horaTarde}
                onChange={(e) => setHoraTarde(e.target.value)}
                maxLength={20}
              />
            </div>
          </div>
        </div>

        <div>
          <Label>Días en que se predica</Label>
          <div className="flex flex-wrap gap-2">
            {DIAS.map((d) => {
              const puesto = dias.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={puesto}
                  onClick={() =>
                    setDias((previos) =>
                      puesto ? previos.filter((x) => x !== d) : [...previos, d],
                    )
                  }
                  className={
                    puesto
                      ? "rounded-[10px] bg-primary px-3 py-1.5 text-sm font-semibold text-white"
                      : "rounded-[10px] border border-border bg-white px-3 py-1.5 text-sm font-medium text-foreground hover:bg-slate-100"
                  }
                >
                  {weekdayName(d)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={generar} disabled={dias.length === 0}>
            🗓️ Generar las salidas de {monthName(mes)}
          </Button>
          <span className="text-xs text-muted">
            Reemplaza lo que haya en la tabla de abajo (todavía sin guardar).
          </span>
        </div>
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
          Todavía no hay salidas en {monthName(mes)} de {anio}. Elige la
          modalidad y los días, y pulsa “Generar las salidas”.
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
