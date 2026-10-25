// ============================================================================
//  Estadísticas de asignaciones de las reuniones.
//
//  Dos ideas que conviene tener claras al leer esto:
//
//  1. Todo sale de la CONFIRMACIÓN del hermano: la respuesta que da al abrir
//     el enlace que se le envía por WhatsApp (Confirmada, Rechazada o sin
//     responder). No hay un registro aparte de "se realizó": lo que no se ha
//     respondido cuenta como "sin respuesta", nunca como un sí.
//
//  2. El nombre del hermano en la asignación es TEXTO LIBRE, no una referencia
//     al publicador. Aquí se normaliza (sin tildes ni mayúsculas) y se cruza
//     con la lista de publicadores, de modo que las variantes del mismo nombre
//     se agrupan. Lo que no case con ningún publicador se devuelve aparte, en
//     vez de inventar una coincidencia.
// ============================================================================

import { CONFIRM_STATUS } from "@/lib/constants";

/**
 * Estado de una participación, tomado de la CONFIRMACIÓN del hermano (el
 * enlace que se le envía por WhatsApp), no de un registro aparte:
 *   confirmada    = respondió que sí
 *   rechazada     = respondió que no
 *   sin_respuesta = todavía no ha respondido
 */
export type DoneState = "confirmada" | "rechazada" | "sin_respuesta";

/** Una participación de un hermano en una asignación. */
export type Participation = {
  assignmentId: string;
  meetingId: string;
  date: Date;
  dayLabel: string;
  weekLabel: string | null;
  section: string;
  label: string;
  /** Responsable o Auxiliar. */
  role: "responsable" | "auxiliar";
  /** Confirmación PREVIA (PENDIENTE | CONFIRMADO | RECHAZADO). */
  confirmStatus: string;
  done: DoneState;
  /**
   * La reunión se eliminó: esta participación viene del historial guardado al
   * borrarla. Sigue contando, pero ya no se puede abrir ni editar.
   */
  deleted?: boolean;
};

export type BrotherStats = {
  /** Nombre del publicador si se pudo emparejar; si no, el texto tal cual. */
  name: string;
  /** Publicador emparejado, cuando existe. */
  publisherId: string | null;
  status: string | null;
  groupName: string | null;
  /** Variantes del nombre encontradas en las asignaciones. */
  variants: string[];
  participations: Participation[];
  /** Solo las que el hermano confirmó. */
  doneCount: number;
  asResponsable: number;
  asAuxiliar: number;
  /**
   * Fecha de la última asignación que TUVO, en una reunión ya pasada, sin
   * importar si llegó a confirmarla. Es lo que mide el aviso de "días sin
   * asignación": para repartir las partes importa a quién le tocó.
   */
  lastAssigned: Date | null;
  /** Días desde esa última asignación. null si nunca ha tenido ninguna. */
  daysSinceAssigned: number | null;
  /** Fecha de la última asignación CONFIRMADA, o null si no consta ninguna. */
  lastDone: Date | null;
  /** Días desde la última confirmada. null si nunca consta una. */
  daysSinceDone: number | null;
  /** Asignaciones que todavía no ha respondido. */
  unrecordedCount: number;
};

/** Normaliza un nombre para comparar: sin tildes, sin puntos, minúsculas. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Empareja un nombre escrito a mano con un publicador.
 * Primero por coincidencia exacta normalizada; si no, por "todas las palabras
 * del nombre del publicador aparecen en el texto" (cubre "Benjamin Saavedra G."
 * frente a "Benjamín Saavedra"). Si hay más de un candidato, no se decide: se
 * devuelve null para no atribuir una asignación al hermano equivocado.
 */
export function matchPublisher<T extends { id: string; fullName: string }>(
  texto: string,
  publishers: T[],
  indice?: Map<string, T>,
): T | null {
  const n = normalizeName(texto);
  if (!n) return null;

  const exacto = indice?.get(n) ?? publishers.find((p) => normalizeName(p.fullName) === n);
  if (exacto) return exacto;

  const candidatos = publishers.filter((p) => {
    const palabras = normalizeName(p.fullName).split(" ").filter((w) => w.length > 2);
    return palabras.length > 0 && palabras.every((w) => n.includes(w));
  });
  return candidatos.length === 1 ? candidatos[0] : null;
}

/**
 * El estado sale del campo de confirmación de la asignación (PENDIENTE,
 * CONFIRMADO o RECHAZADO), que es lo que responde el hermano al abrir el
 * enlace de WhatsApp.
 */
export const doneStateOf = (status: string | null | undefined): DoneState =>
  status === CONFIRM_STATUS.CONFIRMADO
    ? "confirmada"
    : status === CONFIRM_STATUS.RECHAZADO
      ? "rechazada"
      : "sin_respuesta";

/** Días completos entre una fecha y hoy (0 si es hoy o futura). */
export function daysSince(date: Date, today = new Date()): number {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

export const DONE_LABELS: Record<DoneState, string> = {
  confirmada: "Confirmada",
  rechazada: "Rechazada",
  sin_respuesta: "Sin respuesta",
};
