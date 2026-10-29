// ============================================================================
//  Programas libres: una tabla que se arma a mano y se descarga en PDF.
//
//  A diferencia del programa de las reuniones (que sale del Excel de la VyMC),
//  aquí las columnas las pone quien lo crea: sirve igual para el aseo, para
//  una asamblea, para las salidas al servicio o para lo que haga falta.
//
//  Lo único que la aplicación aporta sola son las FECHAS: al elegir un mes
//  aparecen los días de reunión de esa congregación, que cada una tiene los
//  suyos. Este módulo no toca la base ni el navegador, para poder probarlo.
// ============================================================================

import { meetingDatesInMonth } from "@/lib/period";
import { monthName, weekdayName, type MeetingDays } from "@/lib/constants";
import { type PaletaId } from "@/lib/programa-paletas";

/** Qué reuniones entran en el programa. */
export type QueDias = "ambos" | "entresemana" | "finsemana";

/** Una columna de la tabla: su título lo escribe quien crea el programa. */
export type Columna = { id: string; titulo: string };

export type Programa = {
  titulo: string;
  anio: number;
  /** Meses que abarca, 1..12. Puede ser más de uno. */
  meses: number[];
  queDias: QueDias;
  /** Tonos del PDF. Por defecto los azules, que son los de siempre. */
  paleta: PaletaId;
  columnas: Columna[];
  /** valores[fechaISO][idColumna] = lo escrito en esa casilla. */
  valores: Record<string, Record<string, string>>;
};

/** Una fila de la tabla: una fecha de reunión. */
export type Fila = {
  /** YYYY-MM-DD */
  iso: string;
  /** 1..12, para agrupar por mes. */
  mes: number;
  /** "Jueves 2" */
  etiqueta: string;
  /** Entre semana o fin de semana (los nombres vienen de la base). */
  tipo: "JUEVES" | "SABADO";
};

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

/**
 * Las fechas que le tocan al programa: los días de reunión de los meses
 * elegidos, en orden, filtrados por lo que se quiera incluir.
 */
export function filasDelPrograma(
  anio: number,
  meses: number[],
  queDias: QueDias,
  days: MeetingDays,
): Fila[] {
  const out: Fila[] = [];
  for (const mes of [...new Set(meses)].sort((a, b) => a - b)) {
    if (mes < 1 || mes > 12) continue;
    for (const { date, day } of meetingDatesInMonth(anio, mes, days)) {
      if (queDias === "entresemana" && day !== "JUEVES") continue;
      if (queDias === "finsemana" && day !== "SABADO") continue;
      out.push({
        iso: iso(date),
        mes,
        etiqueta: `${weekdayName(date.getDay())} ${date.getDate()}`,
        tipo: day,
      });
    }
  }
  return out;
}

/**
 * Cómo se llama cada opción de días EN ESTA congregación: no "jueves y
 * sábado" fijos, sino los que tenga configurados.
 */
export function etiquetasDeDias(days: MeetingDays): Record<QueDias, string> {
  return {
    ambos: `Ambos (${weekdayName(days.midweekDay).toLowerCase()} y ${weekdayName(
      days.weekendDay,
    ).toLowerCase()})`,
    entresemana: `Solo ${weekdayName(days.midweekDay).toLowerCase()}`,
    finsemana: `Solo ${weekdayName(days.weekendDay).toLowerCase()}`,
  };
}

/** "Octubre 2026", o "Octubre – Diciembre 2026" si abarca varios. */
export function periodoDelPrograma(anio: number, meses: number[]): string {
  const ms = [...new Set(meses)].filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b);
  if (ms.length === 0) return String(anio);
  if (ms.length === 1) return `${monthName(ms[0])} ${anio}`;
  // Si son seguidos, se enseña el rango; si no, se enumeran.
  const seguidos = ms.every((m, i) => i === 0 || m === ms[i - 1] + 1);
  return seguidos
    ? `${monthName(ms[0])} – ${monthName(ms[ms.length - 1])} ${anio}`
    : `${ms.map((m) => monthName(m)).join(", ")} ${anio}`;
}

/**
 * Los meses marcados, escritos como se dicen: "Noviembre y Diciembre",
 * "Octubre, Noviembre y Diciembre". Para que se vea en pantalla qué se eligió.
 */
export function listaDeMeses(meses: number[]): string {
  const ms = [...new Set(meses)]
    .filter((m) => m >= 1 && m <= 12)
    .sort((a, b) => a - b)
    .map((m) => monthName(m));
  if (ms.length === 0) return "";
  if (ms.length === 1) return ms[0];
  return `${ms.slice(0, -1).join(", ")} y ${ms[ms.length - 1]}`;
}

/** Nombre del archivo que se descarga. */
export function nombreArchivo(p: Programa): string {
  const base = (p.titulo.trim() || "programa")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const ms = [...new Set(p.meses)].sort((a, b) => a - b);
  const sufijo = ms.length ? `_${monthName(ms[0]).toLowerCase()}_${p.anio}` : `_${p.anio}`;
  return `${base || "programa"}${sufijo}.pdf`;
}

/** Qué le falta al programa para poder descargarse. */
export function queFalta(p: Programa, filas: Fila[]): string | null {
  if (!p.titulo.trim()) return "Ponle un título al programa.";
  if (p.meses.length === 0) return "Elige al menos un mes.";
  if (filas.length === 0) {
    return "Con esos meses y esos días no queda ninguna fecha. Prueba con otro mes o incluye ambos días.";
  }
  if (p.columnas.length === 0) return "Añade al menos una columna.";
  if (p.columnas.every((c) => !c.titulo.trim())) {
    return "Ponle un título a las columnas.";
  }
  return null;
}

/**
 * La tabla ya resuelta, lista para el PDF o para la pantalla: una entrada por
 * mes (así cada mes lleva su propia cabecera, como el programa impreso).
 */
export function tablasDelPrograma(
  p: Programa,
  filas: Fila[],
): { mes: number; periodo: string; cabecera: string[]; cuerpo: string[][] }[] {
  const porMes = new Map<number, Fila[]>();
  for (const f of filas) {
    if (!porMes.has(f.mes)) porMes.set(f.mes, []);
    porMes.get(f.mes)!.push(f);
  }
  const cabecera = ["DÍA", ...p.columnas.map((c) => c.titulo.trim().toUpperCase())];
  return [...porMes.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([mes, suyas]) => ({
      mes,
      periodo: `${monthName(mes).toUpperCase()} ${p.anio}`,
      cabecera,
      cuerpo: suyas.map((f) => [
        f.etiqueta,
        ...p.columnas.map((c) => p.valores[f.iso]?.[c.id]?.trim() ?? ""),
      ]),
    }));
}
