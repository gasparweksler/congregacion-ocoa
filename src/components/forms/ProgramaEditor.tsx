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
  columnaTieneDatos,
  conColumna,
  sinColumna,
  MAX_COLUMNAS,
  nombreArchivo,
  queFalta,
  type Programa,
  type QueDias,
} from "@/lib/programa-libre";
import { dibujarPrograma } from "@/lib/programa-libre-pdf";
import { paletaDe } from "@/lib/programa-paletas";
import { PaletaOpciones } from "@/components/forms/PaletaOpciones";

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

  const añadirColumna = () => {
    setListo(false);
    setP((prev) => conColumna(prev, nuevaColumna(prev.columnas.length + 1)));
  };

  const quitarColumna = (id: string) => {
    if (p.columnas.length <= 1) return;
    const col = p.columnas.find((c) => c.id === id);
    // Avisar solo si se va a perder algo: preguntar siempre cansa.
    if (
      columnaTieneDatos(p, id) &&
      !window.confirm(
        `La columna "${col?.titulo.trim() || "sin título"}" tiene nombres escritos. ¿Quitarla igual?`,
      )
    ) {
      return;
    }
    setListo(false);
    setP((prev) => sinColumna(prev, id));
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
        <PaletaOpciones
          value={p.paleta}
          onChange={(paleta) => set({ paleta })}
        />
        <p className="mt-3 text-xs text-muted">
          Los tonos son suaves a propósito: estos programas se imprimen, muchas
          veces en blanco y negro, y un fondo oscuro se come el texto.
        </p>
      </CollapsibleCard>

      {/* ---------- 2. Las columnas ---------- */}
      <Card>
        <CardHeader
          title="3 · Columnas de la tabla"
          description="Tú decides cuántas son y cómo se llama cada una."
        />
        <CardBody className="space-y-4">
          {/* Botones y no un campo de número: atado al número de columnas, el
              campo recortaba en cada tecla, así que escribir "2" sobre un "1"
              se leía como "12" y saltaba a 8. Así no hay número inválido que
              valga. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              Columnas:
            </span>
            <div className="inline-flex items-center gap-1 rounded-[10px] border border-border bg-surface p-1">
              <button
                type="button"
                onClick={() => quitarColumna(p.columnas[p.columnas.length - 1].id)}
                disabled={p.columnas.length <= 1}
                aria-label="Quitar una columna"
                className="h-8 w-8 rounded-md text-lg font-semibold text-foreground transition-colors hover:bg-slate-100 disabled:opacity-30"
              >
                −
              </button>
              <span
                aria-live="polite"
                className="w-8 text-center text-sm font-semibold tabular-nums text-foreground"
              >
                {p.columnas.length}
              </span>
              <button
                type="button"
                onClick={añadirColumna}
                disabled={p.columnas.length >= MAX_COLUMNAS}
                aria-label="Añadir una columna"
                className="h-8 w-8 rounded-md text-lg font-semibold text-foreground transition-colors hover:bg-slate-100 disabled:opacity-30"
              >
                +
              </button>
            </div>
            <span className="text-xs text-muted">
              {p.columnas.length >= MAX_COLUMNAS
                ? "Es el máximo que cabe en la hoja."
                : `Hasta ${MAX_COLUMNAS}.`}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {p.columnas.map((c, i) => (
              <div key={c.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <Label htmlFor={`col-${c.id}`}>Columna {i + 1}</Label>
                  {/* Quitar ESTA, no la última: si sobra la del medio, antes
                      había que borrar las de atrás y volver a escribirlas. */}
                  {p.columnas.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => quitarColumna(c.id)}
                      className="text-xs font-semibold text-red-600 hover:underline"
                    >
                      Quitar
                    </button>
                  ) : null}
                </div>
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
