// ============================================================================
//  Canciones y lectura semanal de una reunión: normalización de lo que se
//  escribe a mano en el editor.
//
//  Módulo puro (sin base de datos) para poder probarlo aislado.
// ============================================================================

/**
 * Normaliza un número de canción escrito a mano.
 *   null       -> el campo queda vacío (sin dato; no se imprime)
 *   "33"       -> número válido
 *   undefined  -> lo escrito NO es un número de canción
 *
 * Se acepta "33", " 33 " y "033"; se rechaza texto, decimales, negativos y
 * cualquier cosa fuera de 1..999. Vacío no es un error: es borrar el dato.
 */
export function parseSongNumber(raw: string): string | null | undefined {
  const t = raw.trim();
  if (!t) return null;
  if (!/^\d{1,3}$/.test(t)) return undefined;
  const n = Number(t);
  if (n < 1 || n > 999) return undefined;
  return String(n);
}

/** Lectura semanal: espacios colapsados, recortada, y vacío = sin dato. */
export function parseWeeklyReading(raw: string, max = 120): string | null {
  return raw.replace(/\s+/g, " ").trim().slice(0, max) || null;
}
