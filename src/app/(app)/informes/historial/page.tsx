import Link from "next/link";
import { requireSecretary,
  congregationId,
} from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { monthName, statusLabel } from "@/lib/constants";
import type { Prisma } from "@prisma/client";
import { reportTypeWhere } from "@/lib/report-filters";
import { yearOptions } from "@/lib/period";
import { statusTone } from "@/lib/ui-helpers";
import { PageHeader } from "@/components/PageHeader";
import { LoadingLinkButton } from "@/components/LoadingLinkButton";
import {
  Card,
  CardHeader,
  EmptyState,
  Badge,
  Table,
  Th,
  Td,
} from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { deleteSingleReportAction } from "@/server/report-actions";
import { deleteAllReportsAction } from "@/server/maintenance-actions";
import { HistoryFilters } from "@/components/HistoryFilters";
import { MoveReportsForm } from "@/components/forms/MoveReportsForm";
import { DownloadButton } from "@/components/DownloadButton";

export default async function HistorialInformesPage({
  searchParams,
}: {
  searchParams: Promise<{
    anio?: string;
    mes?: string;
    grupo?: string;
    tipo?: string;
  }>;
}) {
  const user = await requireSecretary();
  const cong = congregationId(user);
  const sp = await searchParams;
  const year = parseInt(sp.anio ?? "", 10);
  const month = parseInt(sp.mes ?? "", 10);
  const grupo = sp.grupo || undefined;
  const tipo = sp.tipo || undefined;

  const where: Prisma.MonthlyReportWhereInput = {
    congregationId: cong,
    ...(!isNaN(year) ? { year } : {}),
    ...(!isNaN(month) ? { month } : {}),
    ...(grupo ? { publisher: { groupId: grupo } } : {}),
    ...reportTypeWhere(tipo),
  };

  const [groups, reports] = await Promise.all([
    prisma.group.findMany({
      where: { congregationId: cong },
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
        title="Informes guardados"
        description="Todos los informes subidos. Filtra, ábrelos, edítalos o elimínalos."
        action={
          <LoadingLinkButton href="/informes" variant="secondary">
            ← Informes
          </LoadingLinkButton>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <HistoryFilters years={yearOptions()} groups={groups} />
        <div className="flex flex-wrap items-center gap-2">
          {/* Descarga lo que muestran los filtros (incluido "todos"). */}
          <DownloadButton
            href={`/api/historial-excel?todos=1${
              !isNaN(year) ? `&anio=${year}` : ""
            }${!isNaN(month) ? `&mes=${month}` : ""}${
              grupo ? `&grupo=${grupo}` : ""
            }${tipo ? `&tipo=${tipo}` : ""}`}
            variant="primary"
            pendingText="Generando Excel…"
          >
            📥 Descargar Historial
          </DownloadButton>
        {reports.length > 0 ? (
          <ConfirmButton
            action={deleteAllReportsAction}
            confirmText="¿Eliminar TODO el historial de informes? Esta acción no se puede deshacer."
          >
            🗑️ Eliminar Historial
          </ConfirmButton>
        ) : null}
        </div>
      </div>

      <div className="mb-4">
        <MoveReportsForm years={yearOptions()} groups={groups} />
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
