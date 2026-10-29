// ============================================================================
//  A qué reunión corresponde una fecha del calendario.
//
//  Una reunión importada de la planilla guarda como fecha el LUNES de su
//  semana, no el día en que se reúne la congregación. Para saber si la fecha
//  "jueves 15" ya tiene reunión creada hay que comparar por semana, no por
//  fecha exacta.
//
//  Estaba dentro de monthly-resp-actions.ts; se saca aquí para que la
//  asignación automática use exactamente la misma regla y no una parecida.
// ============================================================================

/** Lunes de la semana de una fecha, como "aaaa-mm-dd". */
export function weekKey(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offsetToMonday = (d.getDay() + 6) % 7; // Dom=0 -> 6, Lun=1 -> 0, ...
  d.setDate(d.getDate() - offsetToMonday);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export type MeetingLike = {
  id: string;
  date: Date;
  day: string;
  weekLabel?: string | null;
};

/**
 * El día en que la congregación se reunió de verdad.
 *
 * Una reunión importada de la planilla guarda el LUNES de su semana (la fila
 * "26 de Octubre a 1 de Noviembre" se guarda como 2026-10-26), así que su
 * fecha no es el día de la reunión: ese lunes no hubo nada. Aquí se mueve al
 * día que la congregación tiene configurado dentro de esa misma semana —el
 * jueves 29, en el ejemplo.
 *
 * Solo se corrige cuando la reunión viene de un rango (tiene weekLabel). Las
 * creadas a mano ya guardan el día exacto, y recalcularlas las movería si la
 * congregación cambiara sus días después.
 */
export function realMeetingDate(
  stored: Date,
  day: string,
  opts?: { weekLabel?: string | null; weekday?: number | null },
): Date {
  const weekday = opts?.weekday;
  if (!opts?.weekLabel || weekday === null || weekday === undefined) {
    return stored;
  }
  // Lunes de esa semana y, desde él, el día configurado (domingo cuenta como
  // el final de la semana, no como su principio).
  const lunes = new Date(stored.getFullYear(), stored.getMonth(), stored.getDate());
  lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
  const desdeLunes = (weekday + 6) % 7; // Lun=0 … Dom=6
  const real = new Date(lunes);
  real.setDate(real.getDate() + desdeLunes);
  // Se conserva la hora original (las fechas se guardan a mediodía).
  real.setHours(stored.getHours(), stored.getMinutes(), stored.getSeconds(), 0);
  void day;
  return real;
}

/**
 * La reunión ya creada que corresponde a una fecha y tipo de día: misma semana
 * y mismo tipo. Si hubiera varias, prefiere la que tiene rango (weekLabel),
 * luego la de fecha exacta, y por último la más antigua.
 */
export function findWeekMeeting<T extends MeetingLike>(
  meetings: T[],
  date: Date,
  day: string,
): T | undefined {
  const wk = weekKey(date);
  const candidates = meetings.filter(
    (m) => m.day === day && weekKey(m.date) === wk,
  );
  if (candidates.length <= 1) return candidates[0];
  const exactISO = date.toDateString();
  return candidates.sort((a, b) => {
    const aw = a.weekLabel ? 0 : 1;
    const bw = b.weekLabel ? 0 : 1;
    if (aw !== bw) return aw - bw;
    const ae = a.date.toDateString() === exactISO ? 0 : 1;
    const be = b.date.toDateString() === exactISO ? 0 : 1;
    if (ae !== be) return ae - be;
    return a.date.getTime() - b.date.getTime();
  })[0];
}
