// Utilidades de período (año/mes) para informes y estadísticas.

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

/** Lista de años para selectores (desde startYear hasta el año actual + 1). */
export function yearOptions(startYear = 2024): number[] {
  const end = new Date().getFullYear() + 1;
  const years: number[] = [];
  for (let y = end; y >= startYear; y--) years.push(y);
  return years;
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
