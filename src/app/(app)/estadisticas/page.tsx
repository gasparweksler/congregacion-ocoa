import { requireReportsAccess, isSecretary, scopedGroupId } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { monthName } from "@/lib/constants";
import { parsePeriod } from "@/lib/period";
import {
  getPeriodStats,
  getCongregationStats,
  getMonthlyEvolution,
} from "@/lib/stats";
import { PageHeader } from "@/components/PageHeader";
import {
  Card,
  CardHeader,
  CardBody,
  Table,
  Th,
  Td,
  EmptyState,
} from "@/components/ui";
import { PeriodSelector } from "@/components/PeriodSelector";
import { GroupFilter } from "@/components/GroupFilter";
import { StatsTiles } from "@/components/StatsTiles";
import { EvolutionLineChart } from "@/components/charts/EvolutionLineChart";
import { GroupBarChart } from "@/components/charts/GroupBarChart";

export default async function EstadisticasPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; mes?: string; grupo?: string }>;
}) {
  const user = await requireReportsAccess();
  const secretary = isSecretary(user);
  const sp = await searchParams;
  const { year, month } = parsePeriod(sp.anio, sp.mes);

  const scope = scopedGroupId(user); // null si secretario
  // Grupo objetivo: super/aux -> el suyo; secretario -> filtro opcional.
  const targetGroupId = secretary ? sp.grupo || null : scope;

  const groups = secretary
    ? await prisma.group.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  // Estadísticas principales del período.
  const stats = await getPeriodStats(
    targetGroupId ? { groupId: targetGroupId } : {},
    year,
    month,
  );

  // Comparación entre grupos (solo secretario, vista congregacional).
  const congregation =
    secretary && !targetGroupId
      ? await getCongregationStats(year, month)
      : null;

  // Evolución mensual del año.
  const evolution = await getMonthlyEvolution(targetGroupId, year);

  const scopeLabel = targetGroupId
    ? (groups.find((g) => g.id === targetGroupId)?.name ??
      "Grupo seleccionado")
    : "Toda la congregación";

  return (
    <>
      <PageHeader
        title="Estadísticas"
        description={`${scopeLabel} · ${monthName(month)} ${year}`}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PeriodSelector year={year} month={month} />
        {secretary ? (
          <GroupFilter groups={groups} current={sp.grupo ?? ""} />
        ) : null}
      </div>

      {/* Mosaicos */}
      <div className="mb-6">
        <StatsTiles stats={stats} />
      </div>

      {/* Comparación entre grupos (congregacional) */}
      {congregation ? (
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Comparación entre grupos" />
            <CardBody>
              {congregation.perGroup.length === 0 ? (
                <EmptyState title="No hay grupos" />
              ) : (
                <GroupBarChart
                  data={congregation.perGroup.map((g) => ({
                    groupName: g.groupName,
                    totalPublishers: g.stats.totalPublishers,
                    reported: g.stats.reported,
                  }))}
                />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Detalle por grupo" />
            <CardBody className="px-0 py-0">
              <Table>
                <thead>
                  <tr>
                    <Th>Grupo</Th>
                    <Th>Public.</Th>
                    <Th>Inform.</Th>
                    <Th>Cursos</Th>
                    <Th>Horas</Th>
                    <Th>%</Th>
                  </tr>
                </thead>
                <tbody>
                  {congregation.perGroup.map((g) => (
                    <tr key={g.groupId}>
                      <Td className="font-medium">{g.groupName}</Td>
                      <Td>{g.stats.totalPublishers}</Td>
                      <Td>{g.stats.reported}</Td>
                      <Td>{g.stats.totalBibleStudies}</Td>
                      <Td>{g.stats.totalHours}</Td>
                      <Td>{g.stats.participationPct}%</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {/* Evolución mensual */}
      <Card>
        <CardHeader
          title={`Evolución mensual ${year}`}
          description="Publicadores que informaron, cursos bíblicos y horas por mes."
        />
        <CardBody>
          <EvolutionLineChart data={evolution} />
        </CardBody>
      </Card>
    </>
  );
}
