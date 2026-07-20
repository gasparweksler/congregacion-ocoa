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
  // Por cada estado: cuántos SÍ participaron y cuántos NO.
  participationByStatus: Record<PublisherStatus, { yes: number; no: number }>;
  totalPrecursores: number;
  reported: number; // publicadores que informaron actividad (participaron)
  totalBibleStudies: number;
  // Cursos bíblicos solo de publicadores Bautizados y No Bautizados (sin precursores).
  publisherBibleStudies: number;
  totalHours: number;
  participationPct: number; // reported / totalPublishers * 100
  // Desgloses por categoría de precursor (según estado actual del publicador).
  regularPioneers: {
    count: number;
    hours: number;
    bibleStudies: number;
    names: string[];
  };
  auxiliaryPioneers: {
    count: number;
    hours: number;
    bibleStudies: number;
    names: string[];
  };
};

function emptyByStatus(): Record<PublisherStatus, number> {
  const obj = {} as Record<PublisherStatus, number>;
  for (const s of PUBLISHER_STATUS_VALUES) obj[s] = 0;
  return obj;
}

function emptyParticipation(): Record<PublisherStatus, { yes: number; no: number }> {
  const obj = {} as Record<PublisherStatus, { yes: number; no: number }>;
  for (const s of PUBLISHER_STATUS_VALUES) obj[s] = { yes: 0, no: 0 };
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
    orderBy: { fullName: "asc" },
    select: { id: true, status: true, fullName: true },
  });

  const reports = await prisma.monthlyReport.findMany({
    where: {
      year,
      month,
      ...(where.groupId ? { publisher: { groupId: where.groupId } } : {}),
    },
    select: {
      publisherId: true,
      participated: true,
      bibleStudies: true,
      hours: true,
    },
  });

  // Conjunto de publicadores que SÍ participaron en el período.
  const participatedIds = new Set(
    reports.filter((r) => r.participated).map((r) => r.publisherId),
  );

  const byStatus = emptyByStatus();
  const participationByStatus = emptyParticipation();
  for (const p of publishers) {
    if (p.status in byStatus) {
      const st = p.status as PublisherStatus;
      byStatus[st]++;
      if (participatedIds.has(p.id)) participationByStatus[st].yes++;
      else participationByStatus[st].no++;
    }
  }

  const reported = reports.filter((r) => r.participated).length;
  const totalBibleStudies = reports.reduce((a, r) => a + r.bibleStudies, 0);
  const totalHours = reports.reduce((a, r) => a + (r.hours ?? 0), 0);
  const totalPublishers = publishers.length;

  // Mapa estado actual por publicador (para desgloses por categoría).
  const statusById = new Map(publishers.map((p) => [p.id, p.status]));

  // Cursos bíblicos SOLO de Bautizados y No Bautizados (sin precursores).
  const publisherBibleStudies = reports.reduce((a, r) => {
    const st = statusById.get(r.publisherId);
    return st === PUBLISHER_STATUS.BAUTIZADO ||
      st === PUBLISHER_STATUS.NO_BAUTIZADO
      ? a + r.bibleStudies
      : a;
  }, 0);
  const totalPrecursores =
    byStatus[PUBLISHER_STATUS.PRECURSOR_REGULAR] +
    byStatus[PUBLISHER_STATUS.PRECURSOR_AUXILIAR] +
    byStatus[PUBLISHER_STATUS.PRECURSOR_AUXILIAR_INDEFINIDO];

  // Agregados de horas/cursos por categoría de precursor, según el estado
  // actual del publicador. Los auxiliares agrupan ambos tipos (auxiliar y
  // auxiliar indefinido). Los nombres se listan (orden alfabético) para el modal.
  const regularPioneers = {
    count: byStatus[PUBLISHER_STATUS.PRECURSOR_REGULAR],
    hours: 0,
    bibleStudies: 0,
    names: publishers
      .filter((p) => p.status === PUBLISHER_STATUS.PRECURSOR_REGULAR)
      .map((p) => p.fullName),
  };
  const auxiliaryPioneers = {
    count:
      byStatus[PUBLISHER_STATUS.PRECURSOR_AUXILIAR] +
      byStatus[PUBLISHER_STATUS.PRECURSOR_AUXILIAR_INDEFINIDO],
    hours: 0,
    bibleStudies: 0,
    names: publishers
      .filter(
        (p) =>
          p.status === PUBLISHER_STATUS.PRECURSOR_AUXILIAR ||
          p.status === PUBLISHER_STATUS.PRECURSOR_AUXILIAR_INDEFINIDO,
      )
      .map((p) => p.fullName),
  };
  for (const r of reports) {
    const st = statusById.get(r.publisherId);
    if (st === PUBLISHER_STATUS.PRECURSOR_REGULAR) {
      regularPioneers.hours += r.hours ?? 0;
      regularPioneers.bibleStudies += r.bibleStudies;
    } else if (
      st === PUBLISHER_STATUS.PRECURSOR_AUXILIAR ||
      st === PUBLISHER_STATUS.PRECURSOR_AUXILIAR_INDEFINIDO
    ) {
      auxiliaryPioneers.hours += r.hours ?? 0;
      auxiliaryPioneers.bibleStudies += r.bibleStudies;
    }
  }

  return {
    totalPublishers,
    byStatus,
    participationByStatus,
    totalPrecursores,
    publisherBibleStudies,
    regularPioneers,
    auxiliaryPioneers,
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
