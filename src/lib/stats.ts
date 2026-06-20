// ============================================================================
//  Cálculo de estadísticas
//  Funciones que agregan publicadores e informes para producir las
//  estadísticas por grupo, congregacionales y de evolución temporal.
// ============================================================================

import { prisma } from "@/lib/prisma";
import {
  PUBLISHER_STATUS,
  PUBLISHER_STATUS_VALUES,
  isPioneer,
  type PublisherStatus,
} from "@/lib/constants";
import { monthName } from "@/lib/constants";

export type PeriodStats = {
  totalPublishers: number;
  byStatus: Record<PublisherStatus, number>;
  totalPrecursores: number;
  reported: number; // publicadores que informaron actividad (participaron)
  totalBibleStudies: number;
  totalHours: number;
  participationPct: number; // reported / totalPublishers * 100
};

function emptyByStatus(): Record<PublisherStatus, number> {
  const obj = {} as Record<PublisherStatus, number>;
  for (const s of PUBLISHER_STATUS_VALUES) obj[s] = 0;
  return obj;
}

/** Estadísticas de un conjunto de publicadores para un período concreto. */
export async function getPeriodStats(
  where: { groupId?: string },
  year: number,
  month: number,
): Promise<PeriodStats> {
  const publishers = await prisma.publisher.findMany({
    where: { ...(where.groupId ? { groupId: where.groupId } : {}) },
    select: { id: true, status: true },
  });

  const reports = await prisma.monthlyReport.findMany({
    where: {
      year,
      month,
      ...(where.groupId ? { publisher: { groupId: where.groupId } } : {}),
    },
    select: { participated: true, bibleStudies: true, hours: true },
  });

  const byStatus = emptyByStatus();
  for (const p of publishers) {
    if (p.status in byStatus) byStatus[p.status as PublisherStatus]++;
  }

  const reported = reports.filter((r) => r.participated).length;
  const totalBibleStudies = reports.reduce((a, r) => a + r.bibleStudies, 0);
  const totalHours = reports.reduce((a, r) => a + (r.hours ?? 0), 0);
  const totalPublishers = publishers.length;
  const totalPrecursores =
    byStatus[PUBLISHER_STATUS.PRECURSOR_REGULAR] +
    byStatus[PUBLISHER_STATUS.PRECURSOR_AUXILIAR] +
    byStatus[PUBLISHER_STATUS.PRECURSOR_AUXILIAR_INDEFINIDO];

  return {
    totalPublishers,
    byStatus,
    totalPrecursores,
    reported,
    totalBibleStudies,
    totalHours,
    participationPct:
      totalPublishers > 0
        ? Math.round((reported / totalPublishers) * 100)
        : 0,
  };
}

export type GroupComparison = {
  groupId: string;
  groupName: string;
  stats: PeriodStats;
};

/** Estadísticas congregacionales: totales + comparación por grupo. */
export async function getCongregationStats(
  year: number,
  month: number,
): Promise<{ totals: PeriodStats; perGroup: GroupComparison[] }> {
  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const perGroup: GroupComparison[] = [];
  for (const g of groups) {
    perGroup.push({
      groupId: g.id,
      groupName: g.name,
      stats: await getPeriodStats({ groupId: g.id }, year, month),
    });
  }

  const totals = await getPeriodStats({}, year, month);
  return { totals, perGroup };
}

export type MonthlyPoint = {
  month: number;
  label: string; // nombre del mes abreviado
  reported: number;
  hours: number;
  bibleStudies: number;
};

/** Evolución mes a mes dentro de un año (para gráficos de tendencia). */
export async function getMonthlyEvolution(
  groupId: string | null,
  year: number,
): Promise<MonthlyPoint[]> {
  const reports = await prisma.monthlyReport.findMany({
    where: {
      year,
      ...(groupId ? { publisher: { groupId } } : {}),
    },
    select: {
      month: true,
      participated: true,
      hours: true,
      bibleStudies: true,
    },
  });

  const points: MonthlyPoint[] = [];
  for (let m = 1; m <= 12; m++) {
    const rs = reports.filter((r) => r.month === m);
    points.push({
      month: m,
      label: monthName(m).slice(0, 3),
      reported: rs.filter((r) => r.participated).length,
      hours: rs.reduce((a, r) => a + (r.hours ?? 0), 0),
      bibleStudies: rs.reduce((a, r) => a + r.bibleStudies, 0),
    });
  }
  return points;
}

/** Totales por año (para evolución anual). */
export async function getAnnualEvolution(
  groupId: string | null,
  years: number[],
): Promise<
  Array<{ year: number; reported: number; hours: number; bibleStudies: number }>
> {
  const result = [];
  for (const year of years) {
    const reports = await prisma.monthlyReport.findMany({
      where: { year, ...(groupId ? { publisher: { groupId } } : {}) },
      select: { participated: true, hours: true, bibleStudies: true },
    });
    result.push({
      year,
      reported: reports.filter((r) => r.participated).length,
      hours: reports.reduce((a, r) => a + (r.hours ?? 0), 0),
      bibleStudies: reports.reduce((a, r) => a + r.bibleStudies, 0),
    });
  }
  return result;
}

/** Publicadores SIN informe en el período (pendientes de informar). */
export async function getPendingPublishers(
  groupId: string | null,
  year: number,
  month: number,
): Promise<Array<{ id: string; fullName: string; groupName: string | null }>> {
  const publishers = await prisma.publisher.findMany({
    where: {
      ...(groupId ? { groupId } : {}),
      // Sin ningún informe que coincida con el período.
      reports: { none: { year, month } },
    },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      group: { select: { name: true } },
    },
  });
  return publishers.map((p) => ({
    id: p.id,
    fullName: p.fullName,
    groupName: p.group?.name ?? null,
  }));
}

/** Conteo de pendientes por grupo (para alertas del panel del secretario). */
export async function getPendingCountByGroup(
  year: number,
  month: number,
): Promise<
  Array<{ groupId: string; groupName: string; pending: number; total: number }>
> {
  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      _count: { select: { publishers: true } },
    },
  });

  const result = [];
  for (const g of groups) {
    const pending = await prisma.publisher.count({
      where: { groupId: g.id, reports: { none: { year, month } } },
    });
    result.push({
      groupId: g.id,
      groupName: g.name,
      pending,
      total: g._count.publishers,
    });
  }
  return result;
}

// Reexport util para componentes que muestran nombres de meses.
export { isPioneer };
