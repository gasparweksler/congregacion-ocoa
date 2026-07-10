import Link from "next/link";
import { requireSecretary } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { monthName, statusLabel } from "@/lib/constants";
import { yearOptions } from "@/lib/period";
import { statusTone } from "@/lib/ui-helpers";
import { PageHeader } from "@/components/PageHeader";
import {
  Card,
  CardHeader,
  EmptyState,
  Badge,
  LinkButton,
  Table,
  Th,
  Td,
} from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { deleteSingleReportAction } from "@/server/report-actions";
import { deleteAllReportsAction } from "@/server/maintenance-actions";
import { HistoryFilters } from "@/components/HistoryFilters";

export default async function HistorialInformesPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; mes?: string; grupo?: string }>;
}) {
  await requireSecretary();
  const sp = await searchParams;
  const year = parseInt(sp.anio ?? "", 10);
  const month = parseInt(sp.mes ?? "", 10);
  const grupo = sp.grupo || undefined;

  const where = {
    ...(!isNaN(year) ? { year } : {}),
    ...(!isNaN(month) ? { month } : {}),
    ...(grupo ? { publisher: { groupId: grupo } } : {}),
  };

  const [groups, reports] = await Promise.all([
    prisma.group.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.monthlyReport.findMany({
      where,
      orderBy: [
        { year: "desc" },
        { month: "desc" },
        { publisher: { fullName: "asc" } },
      ],
      take: 1000,
      select: {
        id: true,
        year: true,
        month: true,
        participated: true,
        bibleStudies: true,
        hours: true,
        statusAtReport: true,
        publisher: {
          select: { fullName: true, group: { select: { name: true } } },
        },
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Historial de informes"
        description="Todos los informes subidos. Filtra, ábrelos, edítalos o elimínalos."
        action={
          <LinkButton href="/informes" variant="secondary">
            ← Informes
          </LinkButton>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <HistoryFilters years={yearOptions()} groups={groups} />
        {reports.length > 0 ? (
          <ConfirmButton
            action={deleteAllReportsAction}
            confirmText="¿Eliminar TODO el historial de informes? Esta acción no se puede deshacer."
          >
            🗑️ Eliminar Historial
          </ConfirmButton>
        ) : null}
      </div>

      <Card>
        <CardHeader
          title="Informes"
          description={`${reports.length} informe(s)`}
        />
        {reports.length === 0 ? (
          <EmptyState
            title="No hay informes"
            description="No se encontraron informes con esos filtros."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Período</Th>
                <Th>Publicador</Th>
                <Th>Grupo</Th>
                <Th className="text-center">Participó</Th>
                <Th className="text-center">Cursos</Th>
                <Th className="text-center">Horas</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap">
                    {monthName(r.month)} {r.year}
                  </Td>
                  <Td>
                    <div className="font-medium text-foreground">
                      {r.publisher.fullName}
                    </div>
                    <Badge tone={statusTone(r.statusAtReport)}>
                      {statusLabel(r.statusAtReport)}
                    </Badge>
                  </Td>
                  <Td>{r.publisher.group?.name ?? "—"}</Td>
                  <Td className="text-center">
                    {r.participated ? "Sí" : "No"}
                  </Td>
                  <Td className="text-center">{r.bibleStudies}</Td>
                  <Td className="text-center">{r.hours ?? "—"}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/informes/historial/${r.id}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Ver
                      </Link>
                      <ConfirmButton
                        action={deleteSingleReportAction}
                        hidden={{ id: r.id }}
                        confirmText="¿Eliminar este informe? No se puede deshacer."
                      >
                        Eliminar
                      </ConfirmButton>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
