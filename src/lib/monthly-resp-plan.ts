// ============================================================================
//  Reglas del guardado de responsabilidades del mes, sin tocar la base.
//
//  El guardado en lote (setMonthlyResponsibilities) lee el mes de una vez,
//  decide aquí qué escribir, y escribe todo junto. Separar la decisión de la
//  escritura permite comprobar las reglas sin inventarse una base de datos:
//  qué fechas necesitan reunión, qué casillas cambian, y cuándo se renueva el
//  enlace de confirmación de WhatsApp.
// ============================================================================

import { CONFIRM_STATUS } from "@/lib/constants";

/** Una casilla a guardar: qué fecha, qué responsabilidad y qué nombre. */
export type RespEntry = {
  dateISO: string;
  day: "JUEVES" | "SABADO";
  slotKey: string;
  value: string;
};

/** Lo que ya hay guardado en una casilla. */
export type CasillaPrevia = {
  id: string;
  meetingId: string;
  slotKey: string;
  primaryName: string | null;
  primaryToken: string | null;
  primaryStatus: string;
};

/** Una escritura decidida: actualizar la casilla que había, o crearla. */
export type Escritura = {
  /** Presente si la casilla ya existía (hay que actualizarla). */
  assignmentId: string | null;
  meetingId: string;
  slotKey: string;
  label: string;
  primaryName: string | null;
  primaryToken: string | null;
  primaryStatus: string;
};

/** Clave con la que se agrupan las casillas de una misma reunión. */
export const claveFecha = (dateISO: string, day: string): string =>
  `${dateISO}|${day}`;

/**
 * Token y estado de confirmación de una casilla.
 *
 * - Los grupos (Limpieza por Grupos) no se confirman: nunca llevan token.
 * - Al cambiar de persona se emite un token nuevo y vuelve a Pendiente, para
 *   que el enlace viejo de WhatsApp deje de servir.
 * - Si sigue siendo la misma persona, se conserva su confirmación tal cual.
 * - Al vaciar la casilla se borra el token.
 */
export function tokenYEstado(
  esGrupo: boolean,
  nombre: string,
  previo: Pick<CasillaPrevia, "primaryName" | "primaryToken" | "primaryStatus"> | undefined,
  nuevoToken: () => string,
): { token: string | null; status: string } {
  if (esGrupo || !nombre) {
    return { token: null, status: CONFIRM_STATUS.PENDIENTE };
  }
  if (nombre !== previo?.primaryName) {
    return { token: nuevoToken(), status: CONFIRM_STATUS.PENDIENTE };
  }
  return {
    token: previo.primaryToken ?? nuevoToken(),
    status: previo.primaryStatus,
  };
}

/**
 * Fechas que reciben algún nombre y todavía no tienen reunión creada.
 *
 * Una casilla que se deja vacía en una fecha sin reunión no crea nada: así,
 * borrar un nombre nunca inventa una reunión que no existía.
 */
export function fechasQueFaltan(
  entries: RespEntry[],
  idPorFecha: Map<string, string>,
): { dateISO: string; day: "JUEVES" | "SABADO" }[] {
  const faltan = new Map<string, { dateISO: string; day: "JUEVES" | "SABADO" }>();
  for (const e of entries) {
    const clave = claveFecha(e.dateISO, e.day);
    if (idPorFecha.has(clave)) continue;
    if (!e.value.trim()) continue;
    faltan.set(clave, { dateISO: e.dateISO, day: e.day });
  }
  return [...faltan.values()];
}

/**
 * Qué escribir, ya resuelto: una entrada por casilla que de verdad cambia de
 * dueño o de enlace. Las casillas de fechas sin reunión se descartan.
 */
export function planearEscrituras(
  entries: (RespEntry & { label: string; esGrupo: boolean })[],
  idPorFecha: Map<string, string>,
  previas: CasillaPrevia[],
  nuevoToken: () => string,
): Escritura[] {
  const previaDe = new Map(
    previas.map((a) => [`${a.meetingId}|${a.slotKey}`, a]),
  );
  const out: Escritura[] = [];
  for (const e of entries) {
    const meetingId = idPorFecha.get(claveFecha(e.dateISO, e.day));
    if (!meetingId) continue; // fecha sin reunión y sin nombre
    const nombre = e.value.trim();
    const previo = previaDe.get(`${meetingId}|${e.slotKey}`);
    const { token, status } = tokenYEstado(e.esGrupo, nombre, previo, nuevoToken);
    out.push({
      assignmentId: previo?.id ?? null,
      meetingId,
      slotKey: e.slotKey,
      label: e.label,
      primaryName: nombre || null,
      primaryToken: token,
      primaryStatus: status,
    });
  }
  return out;
}
