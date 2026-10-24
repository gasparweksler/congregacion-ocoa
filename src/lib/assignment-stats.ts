// ============================================================================
//  Estadísticas de asignaciones de las reuniones.
//
//  Dos ideas que conviene tener claras al leer esto:
//
//  1. REALIZADA no es lo mismo que CONFIRMADA. La confirmación es la respuesta
//     al WhatsApp antes de la reunión; "realizada" es el registro posterior
//     (`primaryDone` / `secondaryDone`). Solo se cuenta como realizada lo que
//     alguien marcó: `null` significa "sin registrar", nunca "sí".
//
//  2. El nombre del hermano en la asignación es TEXTO LIBRE, no una referencia
//     al publicador. Aquí se normaliza (sin tildes ni mayúsculas) y se cruza
//     con la lista de publicadores, de modo que las variantes del mismo nombre
//     se agrupan. Lo que no case con ningún publicador se devuelve aparte, en
//     vez de inventar una coincidencia.
// ============================================================================

/** Estado de cumplimiento de una asignación concreta. */
export type DoneState = "realizada" | "no_realizada" | "sin_registrar";

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
  /** Solo las que constan como realizadas. */
  doneCount: number;
  asResponsable: number;
  asAuxiliar: number;
  /** Fecha de la última asignación REALIZADA, o null si no consta ninguna. */
  lastDone: Date | null;
  /** Días desde la última realizada. null si nunca consta una. */
  daysSinceDone: number | null;
  /** Programadas cuyo cumplimiento nadie registró. */
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

export const doneStateOf = (v: boolean | null | undefined): DoneState =>
  v === true ? "realizada" : v === false ? "no_realizada" : "sin_registrar";

/** Días completos entre una fecha y hoy (0 si es hoy o futura). */
export function daysSince(date: Date, today = new Date()): number {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

export const DONE_LABELS: Record<DoneState, string> = {
  realizada: "Realizada",
  no_realizada: "No realizada",
  sin_registrar: "Sin registrar",
};
