"use client";

// ============================================================================
//  Editor de programas libres.
//
//  Se elige el título, los meses y qué reuniones entran; las fechas aparecen
//  solas (las de ESTA congregación). Las columnas las pone quien lo crea, con
//  el título que quiera, y al final se descarga en PDF.
//
//  El borrador se guarda en el navegador: llenar un mes entero son decenas de
//  casillas y una recarga sin querer las perdía todas.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Input,
  Label,
  Select,
  Alert,
  Card,
  CardHeader,
  CardBody,
  CollapsibleCard,
} from "@/components/ui";
import { MONTH_NAMES, type MeetingDays } from "@/lib/constants";
import { yearOptions, currentPeriod } from "@/lib/period";
import {
  filasDelPrograma,
  etiquetasDeDias,
  periodoDelPrograma,
  listaDeMeses,
  nombreArchivo,
  queFalta,
  type Programa,
  type QueDias,
} from "@/lib/programa-libre";
import { dibujarPrograma } from "@/lib/programa-libre-pdf";
import { PALETAS, paletaDe, css, type PaletaId } from "@/lib/programa-paletas";

const BORRADOR = "programa-libre-borrador";

const nuevaColumna = (n: number) => ({
  id: `c${Date.now().toString(36)}${n}`,
  titulo: `Columna ${n}`,
});

function programaInicial(): Programa {
  const { year, month } = currentPeriod();
  return {
    titulo: "",
    anio: year,
    meses: [month],
    queDias: "ambos",
    paleta: "azules",
    columnas: [nuevaColumna(1), nuevaColumna(2)],
    valores: {},
  };
}

export function ProgramaEditor({
  days,
  publishers,
  congregacion,
}: {
  days: MeetingDays;
  /** Para autocompletar los nombres, igual que en Responsabilidades. */
  publishers: string[];
  /** "Congregación Ocoa": sale bajo el título del PDF. */
  congregacion: string;
}) {
  const [p, setP] = useState<Programa>(programaInicial);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const enCurso = useRef(false);

  // Recuperar el borrador al abrir. En un efecto (no al montar) para que el
  // servidor y el navegador pinten lo mismo en el primer render.
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(BORRADOR);
      if (guardado) setP({ ...programaInicial(), ...JSON.parse(guardado) });
    } catch {
      /* navegador sin almacenamiento: se empieza en blanco */
    }
  }, []);

  // Guardarlo en cada cambio.
  useEffect(() => {
    try {
      localStorage.setItem(BORRADOR, JSON.stringify(p));
    } catch {
      /* sin espacio o bloqueado: el editor sigue funcionando igual */
    }
  }, [p]);

  const filas = useMemo(
    () => filasDelPrograma(p.anio, p.meses, p.queDias, days),
    [p.anio, p.meses, p.queDias, days],
  );
  const etiquetas = useMemo(() => etiquetasDeDias(days), [days]);
  const falta = queFalta(p, filas);

  const set = (cambio: Partial<Programa>) => {
    setListo(false);
    setP((prev) => ({ ...prev, ...cambio }));
  };

  const alternarMes = (mes: number) => {
    set({
      meses: p.meses.includes(mes)
        ? p.meses.filter((m) => m !== mes)
        : [...p.meses, mes].sort((a, b) => a - b),
    });
  };

  const ponerValor = (iso: string, columnaId: string, valor: string) => {
    setListo(false);
    setP((prev) => ({
      ...prev,
      valores: {
        ...prev.valores,
        [iso]: { ...(prev.valores[iso] ?? {}), [columnaId]: valor },
      },
    }));
  };

  const cambiarNumeroColumnas = (cuantas: number) => {
    const n = Math.min(8, Math.max(1, cuantas));
    if (n === p.columnas.length) return;
    if (n < p.columnas.length) {
      set({ columnas: p.columnas.slice(0, n) });
      return;
    }
    const añadidas = [...p.columnas];
    for (let i = p.columnas.length; i < n; i++) añadidas.push(nuevaColumna(i + 1));
    set({ columnas: añadidas });
  };

  const renombrarColumna = (id: string, titulo: string) => {
    set({ columnas: p.columnas.map((c) => (c.id === id ? { ...c, titulo } : c)) });
  };

  const empezarDeCero = () => {
    if (!window.confirm("¿Vaciar el programa y empezar de nuevo?")) return;
    setP(programaInicial());
    setListo(false);
    setError(null);
  };

  // --- Descargar ---
  // jsPDF se carga solo al pulsar: son cientos de kilobytes que no hacen falta
  // para abrir la página.
  const descargar = async () => {
    if (enCurso.current || falta) return;
    enCurso.current = true;
    setGenerando(true);
    setError(null);
    setListo(false);
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);

      const doc = new jsPDF({
        unit: "pt",
        format: "letter",
        orientation: "portrait",
      });
      dibujarPrograma(doc, autoTable, p, filas, congregacion);
      doc.save(nombreArchivo(p));
      setListo(true);
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "No se pudo generar el PDF.",
      );
    } finally {
      enCurso.current = false;
      setGenerando(false);
    }
  };

  const llenas = filas.reduce(
    (n, f) => n + p.columnas.filter((c) => (p.valores[f.iso]?.[c.id] ?? "").trim()).length,
    0,
  );
  const total = filas.length * p.columnas.length;

  return (
    <div className="space-y-6">
      {/* ---------- 1. Qué programa es ---------- */}
      <Card>
        <CardHeader
          title="1 · Título y período"
          description={`El título sale como encabezado del PDF, y debajo "${congregacion}".`}
        />
        <CardBody className="space-y-4">
          <div>
            <Label htmlFor="titulo" required>
              Título del programa
            </Label>
            <Input
              id="titulo"
              value={p.titulo}
              onChange={(e) => set({ titulo: e.target.value })}
              placeholder="Por ejemplo: Programa de aseo del Salón del Reino"
              maxLength={120}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="anio">Año</Label>
              <Select
                id="anio"
                value={p.anio}
                onChange={(e) => set({ anio: Number(e.target.value) })}
              >
                {yearOptions().map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="quedias">¿Qué reuniones incluir?</Label>
              <Select
                id="quedias"
                value={p.queDias}
                onChange={(e) => set({ queDias: e.target.value as QueDias })}
              >
                <option value="ambos">{etiquetas.ambos}</option>
                <option value="entresemana">{etiquetas.entresemana}</option>
                <option value="finsemana">{etiquetas.finsemana}</option>
              </Select>
            </div>
          </div>

          <div>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <Label>
                Mes o meses que abarca · <span className="font-normal text-muted">marca los que quieras</span>
              </Label>
              <div className="flex gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => set({ meses: MONTH_NAMES.map((_, i) => i + 1) })}
                  className="text-primary hover:underline"
                >
                  Todo el año
                </button>
                {p.meses.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => set({ meses: [] })}
                    className="text-muted hover:underline"
                  >
                    Quitar todos
                  </button>
                ) : null}
              </div>
            </div>

            {/* Casillas de verdad (no botones): el lector de pantalla las
                anuncia como marcables, y se ve que admiten más de una. */}
            <div className="flex flex-wrap gap-1.5">
              {MONTH_NAMES.map((nombre, i) => {
                const mes = i + 1;
                const puesto = p.meses.includes(mes);
                return (
                  <label
                    key={mes}
                    className={
                      puesto
                        ? "inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white"
                        : "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-slate-50"
                    }
                  >
                    <input
                      type="checkbox"
                      checked={puesto}
                      onChange={() => alternarMes(mes)}
                      className="h-3.5 w-3.5 shrink-0 accent-white"
                    />
                    {nombre}
                  </label>
                );
              })}
            </div>

            <p className="mt-2 text-xs text-muted">
              {p.meses.length === 0 ? (
                "Marca al menos un mes para que aparezcan sus días de reunión."
              ) : (
                <>
                  El programa abarcará{" "}
                  <strong className="text-foreground">
                    {listaDeMeses(p.meses)} de {p.anio}
                  </strong>
                  {p.meses.length > 1
                    ? ` · ${p.meses.length} meses, uno tras otro en la misma tabla`
                    : ""}
                  .
                </>
              )}
            </p>
          </div>
        </CardBody>
      </Card>

      {/* ---------- 2. Los colores ---------- */}
      {/* Plegada: se elige una vez y casi nunca se vuelve. El botón enseña la
          paleta puesta, para no tener que abrirla solo por mirar. */}
      <CollapsibleCard
        title="2 · Elegir Paleta de Colores"
        description={`Ahora mismo: ${paletaDe(p.paleta).nombre}. Así se verá la tabla del PDF.`}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PALETAS.map((pal) => {
            const puesta = pal.id === p.paleta;
            return (
              <label
                key={pal.id}
                className={
                  puesta
                    ? "cursor-pointer rounded-2xl border-2 border-primary bg-surface p-3"
                    : "cursor-pointer rounded-2xl border border-border bg-surface p-3 hover:border-primary/40"
                }
              >
                <span className="mb-2 flex items-center gap-2">
                  <input
                    type="radio"
                    name="paleta"
                    value={pal.id}
                    checked={puesta}
                    onChange={() => set({ paleta: pal.id as PaletaId })}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-semibold text-foreground">
                    {pal.nombre}
                  </span>
                </span>

                {/* Ejemplo: los mismos colores que va a usar el PDF. */}
                <span
                  aria-hidden
                  className="block overflow-hidden rounded-lg border"
                  style={{ borderColor: css(pal.linea) }}
                >
                  <span
                    className="flex text-[0.6rem] font-bold uppercase"
                    style={{
                      background: css(pal.cabecera),
                      color: css(pal.cabeceraTexto),
                    }}
                  >
                    <span className="w-14 shrink-0 px-1.5 py-1">Día</span>
                    <span className="flex-1 px-1.5 py-1">Columna</span>
                  </span>
                  {["Jueves 1", "Sábado 3"].map((d) => (
                    <span
                      key={d}
                      className="flex border-t text-[0.6rem] text-slate-700"
                      style={{ borderColor: css(pal.linea) }}
                    >
                      <span
                        className="w-14 shrink-0 px-1.5 py-1 font-semibold"
                        style={{ background: css(pal.columnaDia) }}
                      >
                        {d}
                      </span>
                      <span className="flex-1 bg-white px-1.5 py-1">Hermano</span>
                    </span>
                  ))}
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted">
          Los tonos son suaves a propósito: estos programas se imprimen, muchas
          veces en blanco y negro, y un fondo oscuro se come el texto.
        </p>
      </CollapsibleCard>

      {/* ---------- 2. Las columnas ---------- */}
      <Card>
        <CardHeader
          title="3 · Columnas de la tabla"
          description="Tú decides cuántas son y cómo se llaman."
        />
        <CardBody className="space-y-4">
          <div className="sm:w-48">
            <Label htmlFor="ncols">¿Cuántas columnas?</Label>
            <Input
              id="ncols"
              type="number"
              min={1}
              max={8}
              value={p.columnas.length}
              onChange={(e) => cambiarNumeroColumnas(Number(e.target.value))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {p.columnas.map((c, i) => (
              <div key={c.id}>
                <Label htmlFor={`col-${c.id}`}>Título de la columna {i + 1}</Label>
                <Input
                  id={`col-${c.id}`}
                  value={c.titulo}
                  onChange={(e) => renombrarColumna(c.id, e.target.value)}
                  placeholder="Por ejemplo: Acomodadores"
                  maxLength={40}
                />
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* ---------- 3. La tabla ---------- */}
      <Card>
        <CardHeader
          title="4 · Rellena el programa"
          description={
            filas.length > 0
              ? `${periodoDelPrograma(p.anio, p.meses)} · ${filas.length} fecha(s) · ${llenas} de ${total} casillas`
              : "Elige un mes para que aparezcan las fechas."
          }
        />
        <CardBody className="px-0 py-0">
          {/* Lista para autocompletar, igual que en Responsabilidades. */}
          <datalist id="programa-hermanos">
            {publishers.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>

          {filas.length === 0 ? (
            <p className="px-6 py-6 text-sm text-muted">
              Todavía no hay fechas. Marca al menos un mes arriba.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-slate-50">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      Día
                    </th>
                    {p.columnas.map((c) => (
                      <th
                        key={c.id}
                        className="px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted"
                      >
                        {c.titulo.trim() || "Sin título"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => {
                    // Separador cuando empieza otro mes.
                    const cambiaMes = i > 0 && filas[i - 1].mes !== f.mes;
                    return (
                      <tr
                        key={f.iso}
                        className={
                          cambiaMes
                            ? "border-t-2 border-primary/30"
                            : "border-t border-border"
                        }
                      >
                        <td className="whitespace-nowrap px-4 py-2 font-medium text-foreground">
                          {f.etiqueta}
                          {cambiaMes || i === 0 ? (
                            <span className="ml-1.5 text-xs font-normal text-muted">
                              {MONTH_NAMES[f.mes - 1]}
                            </span>
                          ) : null}
                        </td>
                        {p.columnas.map((c) => (
                          <td key={c.id} className="px-2 py-1.5">
                            <Input
                              list="programa-hermanos"
                              value={p.valores[f.iso]?.[c.id] ?? ""}
                              onChange={(e) => ponerValor(f.iso, c.id, e.target.value)}
                              className="px-2 py-1.5"
                              aria-label={`${c.titulo || "Columna"} del ${f.etiqueta}`}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ---------- 4. Descargar ---------- */}
      {falta ? <Alert tone="info">{falta}</Alert> : null}
      {error ? (
        <Alert tone="error">
          {error}{" "}
          <button type="button" onClick={descargar} className="underline">
            Reintentar
          </button>
        </Alert>
      ) : null}
      {listo ? (
        <Alert tone="success">
          Programa descargado. El borrador queda aquí por si quieres cambiarlo y
          volver a bajarlo.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={descargar}
          disabled={generando || !!falta}
          aria-busy={generando}
          className="disabled:cursor-not-allowed"
        >
          {generando ? (
            <>
              <span
                aria-hidden
                className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
              Generando PDF…
            </>
          ) : (
            "⬇ Descargar programa"
          )}
        </Button>
        <Button type="button" variant="secondary" onClick={empezarDeCero}>
          Empezar de nuevo
        </Button>
      </div>

      <p className="text-xs text-muted">
        Lo que escribes se guarda en este navegador mientras lo editas, así que
        puedes cerrar y seguir después. No se guarda en la congregación: para
        conservarlo, descarga el PDF.
      </p>
    </div>
  );
}
