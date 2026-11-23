// ============================================================================
//  Capitanes de predicación: las reglas, sin base de datos.
//
//  Qué vive aquí (y por qué): el calendario del mes, los horarios, la
//  modalidad y el resumen en palabras son las mismas cuentas en tres sitios
//  distintos —el enlace público, la página del capitán y la del
//  Administrador—, así que se escriben una sola vez y se prueban solas.
// ============================================================================

import { MONTH_NAMES, WEEKDAY_NAMES } from "@/lib/constants";
import { fechaDeISO, isoDeFecha } from "@/lib/dia";

export { fechaDeISO, isoDeFecha };

/** Las dos formas de salir a predicar. */
export const MODALIDADES = {
  CASA: "casa",
  ZOOM: "zoom",
} as const;

/** Un día que el hermano puede, con sus horarios y su modalidad. */
export type DiaDisponible = {
  /** "2026-12-08" */
  dateISO: string;
  /** Los horarios elegidos para ese día. */
  slots: string[];
  /** Predicación de casa en casa. */
  houseToHouse: boolean;
  /** Predicación por Zoom. */
  zoom: boolean;
};

/** Una casilla del calendario: un día del mes, o un hueco. */
export type Casilla = {
  /** Nulo en los huecos del principio y del final. */
  dateISO: string | null;
  dia: number | null;
};

// --- El calendario ----------------------------------------------------------

/** Las iniciales de los días, empezando en lunes. */
export const CABECERA_SEMANA = ["L", "M", "X", "J", "V", "S", "D"];

/** Cuántos días tiene un mes. */
export function diasDelMes(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * El mes repartido en semanas, de lunes a domingo, como se dibuja en
 * pantalla. Los huecos del principio y del final van en blanco.
 */
export function semanasDelMes(year: number, month: number): Casilla[][] {
  const total = diasDelMes(year, month);
  // getDay(): 0 = domingo. Se gira para que la semana empiece en lunes.
  const primero = (new Date(year, month - 1, 1).getDay() + 6) % 7;

  const casillas: Casilla[] = [];
  for (let i = 0; i < primero; i++) casillas.push({ dateISO: null, dia: null });
  for (let d = 1; d <= total; d++) {
    casillas.push({
      dateISO: isoDeFecha(new Date(year, month - 1, d, 12, 0, 0)),
      dia: d,
    });
  }
  while (casillas.length % 7 !== 0) casillas.push({ dateISO: null, dia: null });

  const semanas: Casilla[][] = [];
  for (let i = 0; i < casillas.length; i += 7) {
    semanas.push(casillas.slice(i, i + 7));
  }
  return semanas;
}

/** ¿Esa fecha cae dentro del mes de la encuesta? */
export function esDelMes(dateISO: string, year: number, month: number): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return false;
  const f = fechaDeISO(dateISO);
  if (isNaN(f.getTime())) return false;
  // Una fecha inventada como "2026-12-32" se desbordaría a otro mes.
  return (
    isoDeFecha(f) === dateISO &&
    f.getFullYear() === year &&
    f.getMonth() + 1 === month
  );
}

/** El trozo de calendario que ocupa un mes, para consultar y para borrar. */
export function rangoDelMes(year: number, month: number): { gte: Date; lt: Date } {
  return {
    gte: new Date(year, month - 1, 1, 0, 0, 0),
    lt: new Date(year, month, 1, 0, 0, 0),
  };
}

/** "lunes 8" — cómo se nombra un día dentro de su mes. */
export function etiquetaDeDia(dateISO: string): string {
  const f = fechaDeISO(dateISO);
  return `${WEEKDAY_NAMES[f.getDay()].toLowerCase()} ${f.getDate()}`;
}

/** "diciembre de 2026". */
export function etiquetaDelMes(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1].toLowerCase()} de ${year}`;
}

/**
 * El resumen en palabras: "3, 8, 12 y 19 de diciembre".
 * Los días van ordenados y sin repetir.
 */
export function resumenDeDias(
  dias: string[],
  year: number,
  month: number,
): string {
  const numeros = [
    ...new Set(
      dias
        .filter((d) => esDelMes(d, year, month))
        .map((d) => fechaDeISO(d).getDate()),
    ),
  ].sort((a, b) => a - b);

  if (numeros.length === 0) return "";
  const mes = MONTH_NAMES[month - 1].toLowerCase();
  if (numeros.length === 1) return `${numeros[0]} de ${mes}`;
  const ultimo = numeros[numeros.length - 1];
  return `${numeros.slice(0, -1).join(", ")} y ${ultimo} de ${mes}`;
}

// --- Los horarios -----------------------------------------------------------

/** Un horario escrito en limpio: sin espacios de más. */
export function limpiarHorario(texto: string): string {
  return (texto ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
}

/** Dos horarios son el mismo si solo cambian mayúsculas o espacios. */
export function claveDeHorario(texto: string): string {
  return limpiarHorario(texto)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** ¿Está ya ese horario en la lista? */
export function horarioRepetido(nuevo: string, existentes: string[]): boolean {
  const clave = claveDeHorario(nuevo);
  return existentes.some((h) => claveDeHorario(h) === clave);
}

/** Los horarios de un día, tal como se guardan: separados por "|". */
export function serializarSlots(slots: string[]): string {
  return [...new Set(slots.map(limpiarHorario).filter(Boolean))].join("|");
}

/** Los horarios de un día, tal como se leen. */
export function leerSlots(texto: string): string[] {
  return (texto ?? "")
    .split("|")
    .map(limpiarHorario)
    .filter((s) => s !== "");
}

/** "Casa en casa y Zoom", para enseñar la modalidad de un día. */
export function etiquetaModalidad(dia: {
  houseToHouse: boolean;
  zoom: boolean;
}): string {
  if (dia.houseToHouse && dia.zoom) return "Casa en casa y Zoom";
  if (dia.zoom) return "Por Zoom";
  if (dia.houseToHouse) return "Casa en casa";
  return "Sin modalidad";
}

// --- La respuesta entera ----------------------------------------------------

/** Lo que falla de una respuesta, o nulo si está bien. */
export function errorDeRespuesta(
  nombre: string,
  dias: DiaDisponible[],
  year: number,
  month: number,
): string | null {
  if (limpiarHorario(nombre).length < 3) {
    return "Escribe tu nombre y apellido.";
  }
  if (dias.length === 0) {
    return "Marca en el calendario al menos un día en que puedas ser capitán.";
  }
  if (dias.length > 31) {
    return "Hay más días de los que tiene el mes.";
  }
  const vistos = new Set<string>();
  for (const d of dias) {
    if (!esDelMes(d.dateISO, year, month)) {
      return `El día ${d.dateISO} no es de ${etiquetaDelMes(year, month)}.`;
    }
    if (vistos.has(d.dateISO)) {
      return "Hay un día repetido en la respuesta.";
    }
    vistos.add(d.dateISO);
    if (!d.houseToHouse && !d.zoom) {
      return `Elige la modalidad del ${etiquetaDeDia(d.dateISO)}: casa en casa, Zoom o las dos.`;
    }
  }
  return null;
}

/**
 * ¿Puede el enlace público escribir encima de una respuesta que ya existe?
 *
 * Solo si no la dejó alguien entrando con su cuenta. Así, un enlace repartido
 * por WhatsApp no sirve para cambiar (ni borrar) lo que un hermano firmó con
 * su usuario: para eso tiene que entrar él, o pedírselo al Administrador.
 */
export function puedePisarDesdeElEnlace(
  previa: { userId: string | null } | null,
): boolean {
  return !previa?.userId;
}

/** El nombre en limpio con el que se evita guardar dos veces al mismo. */
export function claveDeNombre(nombre: string): string {
  return limpiarHorario(nombre)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// --- Lo que ve el Administrador ---------------------------------------------

/** Una respuesta ya resumida, como se enseña en la lista. */
export type RespuestaResumen = {
  id: string;
  name: string;
  /** Si respondió desde su sesión. */
  userId: string | null;
  dias: DiaDisponible[];
  actualizada: Date;
};

/** Con qué se puede filtrar la lista de respuestas. */
export type FiltroRespuestas = {
  /** "2026-12-08", o vacío para todas. */
  dateISO?: string;
  /** Un horario concreto, o vacío para todos. */
  slot?: string;
  /** "casa" | "zoom", o vacío para las dos. */
  modalidad?: string;
};

/** ¿Este día de disponibilidad cumple el filtro? */
export function diaPasaFiltro(dia: DiaDisponible, filtro: FiltroRespuestas): boolean {
  if (filtro.dateISO && dia.dateISO !== filtro.dateISO) return false;
  if (filtro.slot && !dia.slots.includes(filtro.slot)) return false;
  if (filtro.modalidad === MODALIDADES.CASA && !dia.houseToHouse) return false;
  if (filtro.modalidad === MODALIDADES.ZOOM && !dia.zoom) return false;
  return true;
}

/** Las respuestas que cumplen el filtro, con solo los días que cumplen. */
export function filtrarRespuestas(
  respuestas: RespuestaResumen[],
  filtro: FiltroRespuestas,
): RespuestaResumen[] {
  const vacio = !filtro.dateISO && !filtro.slot && !filtro.modalidad;
  if (vacio) return respuestas;
  return respuestas
    .map((r) => ({ ...r, dias: r.dias.filter((d) => diaPasaFiltro(d, filtro)) }))
    .filter((r) => r.dias.length > 0);
}

/** Quién puede cada día del mes, para la vista de calendario. */
export function porDia(
  respuestas: RespuestaResumen[],
): Map<string, Array<{ name: string; dia: DiaDisponible }>> {
  const mapa = new Map<string, Array<{ name: string; dia: DiaDisponible }>>();
  for (const r of respuestas) {
    for (const d of r.dias) {
      const lista = mapa.get(d.dateISO) ?? [];
      lista.push({ name: r.name, dia: d });
      mapa.set(d.dateISO, lista);
    }
  }
  for (const lista of mapa.values()) {
    lista.sort((a, b) => a.name.localeCompare(b.name, "es"));
  }
  return mapa;
}

/** El recuento de un día suelto, para la ventana que se abre al tocarlo. */
export type CuentasDelDia = {
  /** Cuántos hermanos pueden ese día. */
  total: number;
  /** Cuántos por cada horario; primero los de la lista del Administrador. */
  porHorario: Array<{ horario: string; cuantos: number }>;
  /** Cuántos marcaron cada modalidad (uno puede estar en las dos). */
  casa: number;
  zoom: number;
  /** Los que no dejaron ningún horario puesto. */
  sinHorario: number;
};

/**
 * Las cuentas de un día: cuántos pueden, con qué horario y de qué forma.
 *
 * Los horarios van en el orden del Administrador. Si alguien guardó un horario
 * que después se quitó de la lista, sale igual al final: lo que contestó el
 * hermano no se esconde.
 */
export function cuentasDelDia(
  gente: Array<{ name: string; dia: DiaDisponible }>,
  horarios: string[],
): CuentasDelDia {
  const cuenta = new Map<string, number>();
  let casa = 0;
  let zoom = 0;
  let sinHorario = 0;

  for (const { dia } of gente) {
    if (dia.houseToHouse) casa++;
    if (dia.zoom) zoom++;
    const suyos = [...new Set(dia.slots.map(limpiarHorario).filter(Boolean))];
    if (suyos.length === 0) sinHorario++;
    for (const s of suyos) cuenta.set(s, (cuenta.get(s) ?? 0) + 1);
  }

  const puestos = new Set<string>();
  const porHorario: Array<{ horario: string; cuantos: number }> = [];
  for (const h of horarios) {
    const limpio = limpiarHorario(h);
    if (puestos.has(limpio)) continue;
    puestos.add(limpio);
    const cuantos = cuenta.get(limpio) ?? 0;
    if (cuantos > 0) porHorario.push({ horario: limpio, cuantos });
  }
  for (const [h, cuantos] of cuenta) {
    if (!puestos.has(h)) porHorario.push({ horario: h, cuantos });
  }

  return { total: gente.length, porHorario, casa, zoom, sinHorario };
}

/** Los que todavía no han contestado, de entre los que tienen la casilla. */
export function faltanPorResponder(
  capitanes: Array<{ id: string; name: string }>,
  respuestas: RespuestaResumen[],
): Array<{ id: string; name: string }> {
  const porUsuario = new Set(
    respuestas.map((r) => r.userId).filter((x): x is string => Boolean(x)),
  );
  const porNombre = new Set(respuestas.map((r) => claveDeNombre(r.name)));
  return capitanes.filter(
    (c) => !porUsuario.has(c.id) && !porNombre.has(claveDeNombre(c.name)),
  );
}
