// ============================================================================
//  Un día del calendario, guardado siempre igual.
//
//  Las fechas que representan UN DÍA (no un instante) se guardan a mediodía
//  local: así no hay forma de que un cambio de huso horario las mueva al día
//  anterior o al siguiente. Y al escribirlas en una dirección o en un
//  formulario viajan como "2026-12-08", sin horas ni zonas.
// ============================================================================

/** "2026-12-08" a fecha (mediodía local). */
export function fechaDeISO(dateISO: string): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/** Fecha a "2026-12-08". */
export function isoDeFecha(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
