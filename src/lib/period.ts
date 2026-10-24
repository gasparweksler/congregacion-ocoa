// Utilidades de período (año/mes) para informes y estadísticas.

import { DEFAULT_MEETING_DAYS, type MeetingDays } from "@/lib/constants";

export type Period = { year: number; month: number };

/** Período actual (año y mes 1..12). */
export function currentPeriod(): Period {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** Período del mes anterior. */
export function previousPeriod(p: Period = currentPeriod()): Period {
  return p.month === 1
    ? { year: p.year - 1, month: 12 }
    : { year: p.year, month: p.month - 1 };
}

/** Período del mes siguiente. */
export function nextPeriod(p: Period = currentPeriod()): Period {
  return p.month === 12
    ? { year: p.year + 1, month: 1 }
    : { year: p.year, month: p.month + 1 };
}

/** Lista de años para selectores (desde startYear hasta el año actual + 1). */
export function yearOptions(startYear = 2024): number[] {
  const end = new Date().getFullYear() + 1;
  const years: number[] = [];
  for (let y = end; y >= startYear; y--) years.push(y);
  return years;
}

/**
 * Todas las fechas de reunión de un mes, en orden.
 *
 * Los días dependen de cada congregación (`midweekDay` y `weekendDay`, 0 =
 * domingo … 6 = sábado); si no se indican se usan los de siempre, jueves y
 * sábado. Devuelve la fecha (mediodía local) y el TIPO de reunión:
 * "JUEVES" = entre semana, "SABADO" = fin de semana.
 */
export function meetingDatesInMonth(
  year: number,
  month: number,
  days: MeetingDays = DEFAULT_MEETING_DAYS,
): Array<{ date: Date; day: "JUEVES" | "SABADO" }> {
  const out: Array<{ date: Date; day: "JUEVES" | "SABADO" }> = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d, 12, 0, 0);
    const wd = date.getDay();
    if (wd === days.midweekDay) out.push({ date, day: "JUEVES" });
    else if (wd === days.weekendDay) out.push({ date, day: "SABADO" });
  }
  return out;
}

/** Normaliza y valida un período proveniente de la URL. */
export function parsePeriod(
  yearStr?: string,
  monthStr?: string,
  def: Period = currentPeriod(),
): Period {
  const year = parseInt(yearStr ?? "", 10);
  const month = parseInt(monthStr ?? "", 10);
  return {
    year: !isNaN(year) && year >= 2000 && year <= 2100 ? year : def.year,
    month: !isNaN(month) && month >= 1 && month <= 12 ? month : def.month,
  };
}
