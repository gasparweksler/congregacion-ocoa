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
import { normalizeName } from "@/lib/assignment-stats";

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

/** Cuántas columnas caben en la hoja. */
export const MAX_COLUMNAS = 8;

/** ¿Esa columna tiene algo escrito en alguna fecha? */
export function columnaTieneDatos(p: Programa, id: string): boolean {
  return Object.values(p.valores).some((fila) => (fila?.[id] ?? "").trim());
}

/** El programa con una columna más al final. Si ya están todas, igual. */
export function conColumna(p: Programa, nueva: Columna): Programa {
  if (p.columnas.length >= MAX_COLUMNAS) return p;
  return { ...p, columnas: [...p.columnas, nueva] };
}

/**
 * El programa sin esa columna, y sin las casillas que tenía escritas (si no,
 * se quedarían colgadas en el borrador para siempre).
 *
 * Nunca deja la tabla sin columnas: con una sola, devuelve el programa igual.
 */
export function sinColumna(p: Programa, id: string): Programa {
  if (p.columnas.length <= 1) return p;
  const valores: Programa["valores"] = {};
  for (const [fecha, fila] of Object.entries(p.valores)) {
    const resto = { ...fila };
    delete resto[id];
    if (Object.keys(resto).length > 0) valores[fecha] = resto;
  }
  return { ...p, columnas: p.columnas.filter((c) => c.id !== id), valores };
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

/** Cuántas veces aparece un hermano, y en qué columnas. */
export type Reparto = {
  /** La forma del nombre que más se repite, para enseñarla. */
  nombre: string;
  /** Todas las formas en que se escribió (sirve para avisar de erratas). */
  variantes: string[];
  veces: number;
  /** idColumna -> cuántas veces en esa columna. */
  porColumna: Record<string, number>;
};

/**
 * Quién está puesto y cuántas veces, para ver de un vistazo si el reparto
 * quedó parejo.
 *
 * Se cuenta SOLO sobre las fechas que de verdad entran en el programa: si se
 * desmarca un mes, lo escrito sigue en el borrador pero no va a salir en el
 * PDF, y contarlo engañaría.
 *
 * Las variantes del mismo nombre se agrupan con la misma regla que las
 * estadísticas de asignaciones (sin tildes, sin puntos, en minúsculas), así
 * que "Juan Pérez" y "juan perez" son la misma persona.
 */
export function repartoDelPrograma(
  p: Programa,
  filas: Fila[],
): { hermanos: Reparto[]; casillasLlenas: number; casillasTotales: number } {
  const porClave = new Map<
    string,
    { formas: Map<string, number>; veces: number; porColumna: Record<string, number> }
  >();
  let casillasLlenas = 0;

  for (const f of filas) {
    for (const c of p.columnas) {
      const escrito = (p.valores[f.iso]?.[c.id] ?? "").replace(/\s+/g, " ").trim();
      if (!escrito) continue;
      casillasLlenas++;
      const clave = normalizeName(escrito);
      if (!clave) continue;
      let r = porClave.get(clave);
      if (!r) {
        r = { formas: new Map(), veces: 0, porColumna: {} };
        porClave.set(clave, r);
      }
      r.formas.set(escrito, (r.formas.get(escrito) ?? 0) + 1);
      r.veces++;
      r.porColumna[c.id] = (r.porColumna[c.id] ?? 0) + 1;
    }
  }

  const hermanos = [...porClave.values()]
    .map((r) => {
      const formas = [...r.formas.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
      return {
        nombre: formas[0][0],
        variantes: formas.map(([f]) => f),
        veces: r.veces,
        porColumna: r.porColumna,
      };
    })
    // Primero quien más veces está: así salta a la vista quien se repite.
    .sort((a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre, "es"));

  return {
    hermanos,
    casillasLlenas,
    casillasTotales: filas.length * p.columnas.length,
  };
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
