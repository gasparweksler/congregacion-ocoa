import Link from "next/link";
import { requireReportsAccess, isSecretary, scopedGroupId } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { monthName, statusLabel, isPioneer } from "@/lib/constants";
import { parsePeriod, yearOptions } from "@/lib/period";
import { getAnnualEvolution } from "@/lib/stats";
import { PageHeader } from "@/components/PageHeader";
import {
  Card,
  CardHeader,
  CardBody,
  Table,
  Th,
  Td,
  Badge,
  EmptyState,
} from "@/components/ui";
import { statusTone } from "@/lib/ui-helpers";
import { PeriodSelector } from "@/components/PeriodSelector";
import { GroupFilter } from "@/components/GroupFilter";
import { AnnualChart } from "@/components/charts/AnnualChart";

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; mes?: string; grupo?: string }>;
}) {
  const user = await requireReportsAccess();
  const secretary = isSecretary(user);
  const sp = await searchParams;
  const { year, month } = parsePeriod(sp.anio, sp.mes);

  const scope = scopedGroupId(user);
  const targetGroupId = secretary ? sp.grupo || null : scope;

  const groups = secretary
    ? await prisma.group.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  // Snapshot de informes del período (solo lectura).
  const reports = await prisma.monthlyReport.findMany({
    where: {
      year,
      month,
      ...(targetGroupId ? { publisher: { groupId: targetGroupId } } : {}),
    },
    orderBy: { publisher: { fullName: "asc" } },
    select: {
      id: true,
      participated: true,
      bibleStudies: true,
      hours: true,
      statusAtReport: true,
      publisher: {
        select: { id: true, fullName: true, group: { select: { name: true } } },
      },
    },
  });

  // Evolución anual (últimos 4 años).
  const years = yearOptions(new Date().getFullYear() - 3).filter(
    (y) => y <= new Date().getFullYear(),
  );
  const annual = await getAnnualEvolution(targetGroupId, years);

  return (
    <>
      <PageHeader
        title="Historial"
        description="Consulta cualquier mes anterior y la evolución a lo largo de los años."
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PeriodSelector year={year} month={month} />
        {secretary ? (
          <GroupFilter groups={groups} current={sp.grupo ?? ""} />
        ) : null}
      </div>

      <Card className="mb-6">
        <CardHeader
          title={`Informes de ${monthName(month)} ${year}`}
          description={`${reports.length} informe(s) registrados en el período.`}
        />
        {reports.length === 0 ? (
          <EmptyState
            title="No hay informes en este período"
            description="Elige otro mes/año o registra informes desde la sección “Informes”."
          />
        ) : (
          <CardBody className="px-0 py-0">
            <Table>
              <thead>
                <tr>
                  <Th>Publicador</Th>
                  {secretary && !targetGroupId ? <Th>Grupo</Th> : null}
                  <Th>Estado</Th>
                  <Th>Participó</Th>
                  <Th>Cursos</Th>
                  <Th>Horas</Th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <Td className="font-medium">
                      <Link
                        href={`/publicadores/${r.publisher.id}`}
                        className="text-primary hover:underline"
                      >
                        {r.publisher.fullName}
                      </Link>
                    </Td>
                    {secretary && !targetGroupId ? (
                      <Td className="text-muted">
                        {r.publisher.group?.name ?? "—"}
                      </Td>
                    ) : null}
                    <Td>
                      <Badge tone={statusTone(r.statusAtReport)}>
                        {statusLabel(r.statusAtReport)}
                      </Badge>
                    </Td>
                    <Td>{r.participated ? "Sí" : "No"}</Td>
                    <Td>{r.bibleStudies}</Td>
                    <Td>{isPioneer(r.statusAtReport) ? (r.hours ?? 0) : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardBody>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Evolución anual"
          description="Totales por año (informes, cursos bíblicos y horas)."
        />
        <CardBody>
          <AnnualChart data={annual} />
        </CardBody>
      </Card>
    </>
  );
}
