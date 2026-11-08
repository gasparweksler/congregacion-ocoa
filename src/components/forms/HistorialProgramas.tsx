"use client";

// ============================================================================
//  El historial de programas de predicación.
//
//  Cada programa es el conjunto de salidas de un mes, así que el historial es
//  la lista de meses con salidas guardadas, del más nuevo al más viejo. Desde
//  aquí se vuelve a bajar cualquiera en PDF y se borran los que ya no hacen
//  falta.
//
//  El PDF lo dibuja la MISMA función que la pantalla del programa
//  (src/lib/territorios-pdf.ts), con los datos que devuelve
//  /api/territorios/programa: un programa del año pasado sale igual que el
//  día que se armó, con su franja de fotos y sus colores.
//
//  Nada se guarda en este navegador: la lista, las salidas y el borrado van
//  contra la base, así que dos personas con el permiso ven y tocan lo mismo.
// ============================================================================

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { borrarProgramasAction } from "@/server/territorio-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PaletaOpciones } from "@/components/forms/PaletaOpciones";
import { usePaletaRecordada } from "@/components/forms/usePaletaRecordada";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Label,
  Select,
} from "@/components/ui";
import { monthName } from "@/lib/constants";
import {
  fechaDeISO,
  filasDelPrograma,
  nombreCompleto,
  territoriosDelPrograma,
  type ProgramaDelHistorial,
  type Salida,
} from "@/lib/territorios";
import { ProgramasPorMesChart } from "@/components/charts/TerritoriosChart";

/** La misma clave que la pantalla del programa: la paleta es una sola. */
const RECUERDO_PALETA = "paleta-programa-predicacion";

/** Lo que devuelve /api/territorios/programa. */
type RespuestaPrograma = {
  periodo: string;
  congregacion: string;
  fotos: string[];
  salidas: {
    id: string;
    iso: string;
    turno: string;
    time: string;
    place: string;
    captainName: string;
    territorio: { id: string; number: number; name: string } | null;
    grupos: string[];
  }[];
};

type ImagenParaPdf = { dataUrl: string; ancho: number; alto: number };

const TODOS = "todos";

export function HistorialProgramas({
  programas,
}: {
  programas: ProgramaDelHistorial[];
}) {
  const [paleta, elegirPaleta] = usePaletaRecordada(RECUERDO_PALETA);
  const [anio, setAnio] = useState(TODOS);
  const [mes, setMes] = useState(TODOS);
  const [conMapas, setConMapas] = useState(false);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [aBorrar, setABorrar] = useState<string[]>([]);
  const [bajando, setBajando] = useState("");
  const [aviso, setAviso] = useState("");

  const [estado, borrar] = useActionState(
    borrarProgramasAction,
    EMPTY_FORM_STATE,
  );

  // Los que de verdad siguen en la base. Al borrar, la página se vuelve a
  // pintar sin ellos y las selecciones que los nombraban se caen solas: así
  // no hay que limpiar nada a mano cuando la acción termina.
  const existentes = useMemo(
    () => new Set(programas.map((p) => p.clave)),
    [programas],
  );
  const seleccion = elegidos.filter((c) => existentes.has(c));
  const pendientes = aBorrar.filter((c) => existentes.has(c));

  const anios = useMemo(
    () => [...new Set(programas.map((p) => p.anio))].sort((a, b) => b - a),
    [programas],
  );

  const visibles = programas.filter(
    (p) =>
      (anio === TODOS || p.anio === Number(anio)) &&
      (mes === TODOS || p.mes === Number(mes)),
  );

  // El gráfico va del más viejo al más nuevo, como se lee el tiempo.
  const porMes = [...visibles].reverse().map((p) => ({
    etiqueta: `${monthName(p.mes).slice(0, 3)} ${String(p.anio).slice(2)}`,
    salidas: p.salidas,
  }));

  const todosPuestos =
    visibles.length > 0 && visibles.every((p) => seleccion.includes(p.clave));

  function marcar(clave: string, puesto: boolean) {
    setElegidos((previos) =>
      puesto
        ? [...previos.filter((c) => c !== clave), clave]
        : previos.filter((c) => c !== clave),
    );
  }

  function marcarTodos(puesto: boolean) {
    const deLaVista = visibles.map((p) => p.clave);
    setElegidos((previos) =>
      puesto
        ? [...new Set([...previos, ...deLaVista])]
        : previos.filter((c) => !deLaVista.includes(c)),
    );
  }

  /** Vuelve a dibujar el PDF de un mes guardado, igual que el día que se armó. */
  async function descargar(p: ProgramaDelHistorial) {
    setBajando(p.clave);
    setAviso("");
    try {
      const respuesta = await fetch(
        `/api/territorios/programa?anio=${p.anio}&mes=${p.mes}`,
      );
      if (!respuesta.ok) {
        throw new Error("no se pudo leer el programa guardado");
      }
      const datos = (await respuesta.json()) as RespuestaPrograma;
      if (datos.salidas.length === 0) {
        throw new Error("ese programa ya no tiene salidas");
      }

      const [{ jsPDF }, autoTableMod, pdfLib, imagenes] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
        import("@/lib/territorios-pdf"),
        import("@/lib/pdf-a-imagenes"),
      ]);

      const salidas: Salida[] = [];
      for (const s of datos.salidas) {
        const fecha = fechaDeISO(s.iso);
        if (!fecha) continue;
        salidas.push({
          id: s.id,
          date: fecha,
          turno: s.turno,
          time: s.time,
          place: s.place,
          captainName: s.captainName,
          territorio: s.territorio,
          grupos: s.grupos,
        });
      }

      // Las fotos de la franja. Si alguna no llega, el programa baja igual:
      // antes sin franja que sin programa.
      const fotos: ImagenParaPdf[] = [];
      for (const id of datos.fotos) {
        try {
          const r = await fetch(`/api/territorios/fotos/${id}`);
          if (!r.ok) continue;
          const dataUrl = await imagenes.comoDataUrl(await r.blob());
          const medida = await imagenes.medidaDeImagen(dataUrl);
          fotos.push({ dataUrl, ancho: medida.ancho, alto: medida.alto });
        } catch {
          /* una foto que no llega no impide bajar el programa */
        }
      }

      const mapas: (ImagenParaPdf & { titulo: string })[] = [];
      const sinMapa: string[] = [];
      if (conMapas) {
        for (const t of territoriosDelPrograma(salidas)) {
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
      pdfLib.dibujarProgramaPredicacion(doc, autoTableMod.default, {
        titulo: "Programa de Predicación",
        periodo: datos.periodo || p.periodo,
        congregacion: datos.congregacion,
        filas: filasDelPrograma(salidas),
        fotos,
        mapas,
        paleta,
      });
      doc.save(
        `programa-predicacion-${p.anio}-${String(p.mes).padStart(2, "0")}.pdf`,
      );

      if (sinMapa.length > 0) {
        setAviso(
          `El PDF se descargó, pero ${sinMapa.length} ` +
            `${sinMapa.length === 1 ? "territorio no tiene mapa" : "territorios no tienen mapa"}: ` +
            `${sinMapa.slice(0, 6).join(", ")}.`,
        );
      }
    } catch (err) {
      setAviso(
        err instanceof Error && err.message
          ? `No se pudo generar el PDF: ${err.message}.`
          : "No se pudo generar el PDF.",
      );
    } finally {
      setBajando("");
    }
  }

  const nombresPendientes = pendientes
    .map((c) => programas.find((p) => p.clave === c)?.etiqueta ?? c)
    .join(", ");
  const salidasPendientes = pendientes.reduce(
    (suma, c) => suma + (programas.find((p) => p.clave === c)?.salidas ?? 0),
    0,
  );

  return (
    <Card>
      <CardHeader
        title={`Historial de programas (${programas.length})`}
        description="Todos los programas de predicación guardados, del más nuevo al más viejo. Se pueden volver a descargar en PDF tal como se armaron, o borrar los que ya no hagan falta."
      />
      <CardBody className="space-y-5">
        {programas.length === 0 ? (
          <EmptyState
            title="Todavía no hay ningún programa guardado"
            description="Arma el primero en «Programa de predicación» y aparecerá aquí, con sus estadísticas."
          />
        ) : (
          <>
            {/* --- Filtros ------------------------------------------------ */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label htmlFor="hist-anio">Año</Label>
                <Select
                  id="hist-anio"
                  value={anio}
                  onChange={(e) => setAnio(e.target.value)}
                >
                  <option value={TODOS}>Todos los años</option>
                  {anios.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="hist-mes">Mes</Label>
                <Select
                  id="hist-mes"
                  value={mes}
                  onChange={(e) => setMes(e.target.value)}
                >
                  <option value={TODOS}>Todos los meses</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {monthName(m)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex items-end">
                <label className="flex cursor-pointer items-center gap-2 py-2.5 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={conMapas}
                    onChange={(e) => setConMapas(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  Incluir los mapas
                </label>
              </div>
              <div className="flex items-end">
                {anio !== TODOS || mes !== TODOS ? (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setAnio(TODOS);
                      setMes(TODOS);
                    }}
                  >
                    Quitar filtros
                  </Button>
                ) : null}
              </div>
            </div>

            {aviso ? <Alert tone="warning">{aviso}</Alert> : null}
            {estado.success ? (
              <Alert tone="success">{estado.success}</Alert>
            ) : null}

            {visibles.length === 0 ? (
              <EmptyState
                title="Ningún programa con ese filtro"
                description="Prueba con otro mes o con otro año."
              />
            ) : (
              <>
                {/* --- Cuántas salidas tuvo cada programa ----------------- */}
                {visibles.length > 1 ? (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">
                      Salidas de cada programa
                    </p>
                    <ProgramasPorMesChart data={porMes} />
                  </div>
                ) : null}

                {/* --- Seleccionar y borrar ------------------------------- */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-slate-50 px-3 py-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={todosPuestos}
                      onChange={(e) => marcarTodos(e.target.checked)}
                      className="h-4 w-4 rounded border-border"
                    />
                    {todosPuestos ? "Quitar la selección" : "Seleccionar todos"}
                    {seleccion.length > 0 ? (
                      <Badge tone="blue">
                        {seleccion.length === 1
                          ? "1 elegido"
                          : `${seleccion.length} elegidos`}
                      </Badge>
                    ) : null}
                  </label>

                  <Button
                    variant="danger"
                    disabled={seleccion.length === 0}
                    onClick={() => setABorrar(seleccion)}
                  >
                    Borrar los seleccionados
                  </Button>
                </div>

                {/* --- La lista ------------------------------------------- */}
                <ul className="space-y-3">
                  {visibles.map((p) => {
                    const puesto = seleccion.includes(p.clave);
                    return (
                      <li
                        key={p.clave}
                        className={
                          puesto
                            ? "rounded-xl border-2 border-primary bg-primary/5 p-3"
                            : "rounded-xl border border-border bg-surface p-3"
                        }
                      >
                        <div className="flex flex-wrap items-start gap-3">
                          <input
                            type="checkbox"
                            checked={puesto}
                            onChange={(e) => marcar(p.clave, e.target.checked)}
                            aria-label={`Elegir el programa de ${p.etiqueta}`}
                            className="mt-1 h-4 w-4 shrink-0 rounded border-border"
                          />

                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground">
                              {p.etiqueta}
                            </p>
                            <p className="text-xs text-muted">{p.periodo}</p>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              <Badge tone="blue">
                                {p.salidas}{" "}
                                {p.salidas === 1 ? "salida" : "salidas"}
                              </Badge>
                              <Badge tone="slate">
                                {p.territorios}{" "}
                                {p.territorios === 1
                                  ? "territorio"
                                  : "territorios"}
                              </Badge>
                              {p.deGrupo > 0 ? (
                                <Badge tone="violet">
                                  {p.deGrupo} por grupo
                                </Badge>
                              ) : null}
                              {p.sinTerritorio > 0 ? (
                                <Badge tone="amber">
                                  {p.sinTerritorio} sin territorio
                                </Badge>
                              ) : null}
                            </div>
                          </div>

                          {/* En el teléfono los botones van a lo ancho, uno
                              debajo del otro; en pantalla grande, al lado. */}
                          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
                            <Button
                              variant="secondary"
                              disabled={bajando === p.clave}
                              onClick={() => descargar(p)}
                            >
                              {bajando === p.clave
                                ? "Preparando…"
                                : "Descargar PDF"}
                            </Button>
                            <Button
                              variant="danger"
                              onClick={() => setABorrar([p.clave])}
                            >
                              Borrar
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {/* --- Los colores del PDF ---------------------------------- */}
            <details className="rounded-xl border border-border bg-surface">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-foreground">
                Colores del PDF
              </summary>
              <div className="border-t border-border p-4">
                <p className="mb-3 text-sm text-muted">
                  El mismo selector que la pantalla del programa: lo que elijas
                  aquí vale también allí, y al revés.
                </p>
                <PaletaOpciones
                  value={paleta}
                  onChange={elegirPaleta}
                  name="paleta-historial"
                  ejemplo={["Sábado 7", "Domingo 8"]}
                  estilo="programa"
                />
              </div>
            </details>

            {/* --- El borrado, que no se puede deshacer ----------------- */}
            <form action={borrar}>
              <input
                type="hidden"
                name="meses"
                value={JSON.stringify(pendientes)}
              />
              <DialogoDeBorrado
                open={pendientes.length > 0}
                cuantos={pendientes.length}
                nombres={nombresPendientes}
                salidas={salidasPendientes}
                error={estado.error}
                onCancel={() => setABorrar([])}
              />
            </form>
          </>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * La confirmación. Va dentro del <form> para poder decir, con useFormStatus,
 * que el borrado está en marcha.
 */
function DialogoDeBorrado({
  open,
  cuantos,
  nombres,
  salidas,
  error,
  onCancel,
}: {
  open: boolean;
  cuantos: number;
  nombres: string;
  salidas: number;
  error?: string;
  onCancel: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <ConfirmDialog
      open={open}
      title={
        cuantos === 1
          ? `¿Borrar el programa de ${nombres}?`
          : `¿Borrar ${cuantos} programas?`
      }
      description={
        `Se borran ${salidas} ${salidas === 1 ? "salida" : "salidas"} ` +
        `(${nombres}). Las estadísticas de los territorios se recalculan al ` +
        "momento, y los demás usuarios con permiso dejarán de verlos. Esto no " +
        "se puede deshacer."
      }
      confirmLabel={cuantos === 1 ? "Sí, borrar el programa" : "Sí, borrarlos"}
      pendingLabel="Borrando…"
      pending={pending}
      onCancel={onCancel}
      extra={error ? <Alert tone="error">{error}</Alert> : undefined}
    />
  );
}
