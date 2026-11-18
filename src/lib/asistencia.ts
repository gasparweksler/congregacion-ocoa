// ============================================================================
//  Asistencia a las reuniones: las reglas, sin base de datos.
//
//  Qué vive aquí (y por qué): el año de servicio va de septiembre a agosto, y
//  los promedios tienen que dejar fuera las reuniones que no se celebraron y
//  las que todavía no tienen asistencia anotada. Son las dos cuentas que se
//  repiten en la pantalla, en el historial y en el PDF S-88, así que se
//  escriben una sola vez y se prueban sin inventar una base de datos.
// ============================================================================

import { MEETING_DAYS, MONTH_NAMES, type MeetingDays } from "@/lib/constants";
import { meetingDatesInMonth } from "@/lib/period";

/** Los 12 meses del año de servicio, en orden: septiembre → agosto. */
export const MESES_ANIO_SERVICIO = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8] as const;

/** Una reunión del mes, con lo que se anotó de ella. */
export type FilaAsistencia = {
  /** "2026-11-06" */
  dateISO: string;
  /** JUEVES = entre semana · SABADO = fin de semana. */
  day: "JUEVES" | "SABADO";
  /** ¿Hubo reunión normal? */
  held: boolean;
  /** Asistencia contada. Nulo = todavía sin anotar. */
  count: number | null;
  /** Observaciones. */
  note: string;
};

/** El resultado de una cuenta de promedio. */
export type Promedio = {
  /** Reuniones que entran en la cuenta (celebradas y con asistencia). */
  reuniones: number;
  /** Suma de las asistencias de esas reuniones. */
  total: number;
  /** Promedio redondeado, o nulo si no hay nada que promediar. */
  promedio: number | null;
};

const VACIO: Promedio = { reuniones: 0, total: 0, promedio: null };

/**
 * El año de servicio al que pertenece un mes. Va de septiembre a agosto, y se
 * nombra por el año en que termina: septiembre de 2026 ya es del año de
 * servicio 2027.
 */
export function anioDeServicio(year: number, month: number): number {
  return month >= 9 ? year + 1 : year;
}

/** Los 12 meses de un año de servicio, de septiembre a agosto. */
export function mesesDelAnioDeServicio(
  anio: number,
): Array<{ year: number; month: number }> {
  return MESES_ANIO_SERVICIO.map((month) => ({
    year: month >= 9 ? anio - 1 : anio,
    month,
  }));
}

/** "Septiembre de 2026 a agosto de 2027". */
export function etiquetaAnioDeServicio(anio: number): string {
  return `Septiembre de ${anio - 1} a agosto de ${anio}`;
}

/**
 * Las hojas del S-88 que se pueden descargar, de la más vieja a la más nueva.
 *
 * Cada hoja lleva DOS años de servicio seguidos, como el formulario de papel:
 * 2027 y 2028, 2028 y 2029, 2029 y 2030… Cada número de la lista es el
 * PRIMERO de la pareja.
 *
 * La lista empieza en el año de servicio en curso, y solo retrocede si ya hay
 * algo anotado antes (para que una hoja vieja nunca deje de poder imprimirse).
 */
export function hojasDelS88({
  hoy = new Date(),
  desde = null,
  mirando = null,
}: {
  /** Para poder probarlo sin depender del día de hoy. */
  hoy?: Date;
  /** Año de servicio del registro más antiguo, si hay alguno. */
  desde?: number | null;
  /** Año de servicio del mes que se está mirando. */
  mirando?: number | null;
} = {}): number[] {
  const actual = anioDeServicio(hoy.getFullYear(), hoy.getMonth() + 1);
  const primero = Math.min(actual, desde ?? actual, mirando ?? actual);
  // Dos por delante: en agosto ya se prepara la hoja del año que viene.
  const ultimo = Math.max(actual + 2, mirando ?? actual, desde ?? actual);
  const out: number[] = [];
  for (let a = primero; a <= ultimo; a++) out.push(a);
  return out;
}

/** "2027 y 2028": los dos años de servicio que caben en una hoja. */
export function etiquetaHoja(anio: number): string {
  return `${anio} y ${anio + 1}`;
}

/** "Septiembre de 2026 a agosto de 2028": lo que abarca una hoja entera. */
export function etiquetaRangoHoja(anio: number): string {
  return `Septiembre de ${anio - 1} a agosto de ${anio + 1}`;
}

/** "noviembre de 2026", para los textos de confirmación. */
export function etiquetaDeMes(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1].toLowerCase()} de ${year}`;
}

/** La fecha de una fila, como la guarda la base (mediodía local). */
export function fechaDeISO(dateISO: string): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/** "2026-11-06" a partir de una fecha. */
export function isoDeFecha(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Lo que se escribe en la casilla de asistencia, ya limpio: solo números
 * enteros. Las letras, los símbolos y el signo menos no llegan a guardarse.
 */
export function soloEnteros(texto: string): string {
  return (texto ?? "").replace(/[^0-9]/g, "").slice(0, 5);
}

/**
 * La asistencia tal como se guarda: un entero, o nulo si la casilla está
 * vacía. Devuelve "mal" si lo escrito no es un número entero válido.
 */
export function parseAsistencia(texto: string): number | null | "mal" {
  const limpio = (texto ?? "").trim();
  if (limpio === "") return null;
  if (!/^[0-9]{1,5}$/.test(limpio)) return "mal";
  return Number(limpio);
}

/**
 * Promedio de un grupo de reuniones. Quedan fuera las que no se celebraron y
 * las que no tienen asistencia anotada: una reunión suspendida no puede
 * hundir el promedio del mes.
 */
export function promedioDe(filas: FilaAsistencia[]): Promedio {
  const cuentan = filas.filter((f) => f.held && f.count !== null);
  if (cuentan.length === 0) return { ...VACIO };
  const total = cuentan.reduce((n, f) => n + (f.count ?? 0), 0);
  return {
    reuniones: cuentan.length,
    total,
    promedio: Math.round(total / cuentan.length),
  };
}

/** Los tres promedios de la pantalla: entre semana, fin de semana y todas. */
export function promediosDelMes(filas: FilaAsistencia[]): {
  entreSemana: Promedio;
  finDeSemana: Promedio;
  todas: Promedio;
} {
  return {
    entreSemana: promedioDe(filas.filter((f) => f.day === MEETING_DAYS.JUEVES)),
    finDeSemana: promedioDe(filas.filter((f) => f.day === MEETING_DAYS.SABADO)),
    todas: promedioDe(filas),
  };
}

/**
 * Las reuniones de un mes: las fechas salen de los días configurados por la
 * congregación, y encima se pone lo que ya estaba anotado.
 *
 * Una fila guardada cuya fecha ya no es día de reunión (porque la
 * congregación cambió de día) NO se pierde: se añade igual, para que el
 * historial siga contando lo que de verdad pasó.
 */
export function filasDelMes(
  year: number,
  month: number,
  days: MeetingDays,
  guardadas: FilaAsistencia[],
): FilaAsistencia[] {
  const porClave = new Map(guardadas.map((g) => [`${g.dateISO}|${g.day}`, g]));
  const out: FilaAsistencia[] = [];
  const vistas = new Set<string>();

  for (const { date, day } of meetingDatesInMonth(year, month, days)) {
    const dateISO = isoDeFecha(date);
    const clave = `${dateISO}|${day}`;
    vistas.add(clave);
    const previa = porClave.get(clave);
    out.push(
      previa ?? { dateISO, day, held: true, count: null, note: "" },
    );
  }

  // Lo anotado en una fecha que ya no toca (cambió el día de reunión, o fue
  // una reunión especial): se enseña igual, al final del día que le toque.
  for (const g of guardadas) {
    if (!vistas.has(`${g.dateISO}|${g.day}`)) out.push(g);
  }

  return out.sort((a, b) =>
    a.dateISO === b.dateISO
      ? a.day.localeCompare(b.day)
      : a.dateISO.localeCompare(b.dateISO),
  );
}

/**
 * El trozo de calendario que ocupa un mes. Lo usan tanto la pantalla como el
 * borrado, para que "el mes" signifique exactamente lo mismo en los dos
 * sitios (y para poder comprobarlo en la prueba sin copiar la consulta).
 */
export function rangoDelMes(year: number, month: number): { gte: Date; lt: Date } {
  return {
    gte: new Date(year, month - 1, 1, 0, 0, 0),
    lt: new Date(year, month, 1, 0, 0, 0),
  };
}

/** El trozo de calendario de un año de servicio: del 1 de septiembre al 31 de agosto. */
export function rangoDelAnioDeServicio(anio: number): { gte: Date; lt: Date } {
  const meses = mesesDelAnioDeServicio(anio);
  const primero = meses[0];
  const ultimo = meses[11];
  return {
    gte: new Date(primero.year, primero.month - 1, 1, 0, 0, 0),
    lt: new Date(ultimo.year, ultimo.month, 1, 0, 0, 0),
  };
}
