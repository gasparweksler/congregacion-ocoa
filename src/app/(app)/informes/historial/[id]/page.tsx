import { notFound } from "next/navigation";
import { requireSecretary } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { monthName, isPioneer } from "@/lib/constants";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody, LinkButton } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { deleteSingleReportAction } from "@/server/report-actions";
import { SingleReportEditor } from "@/components/forms/SingleReportEditor";

export default async function ReporteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSecretary();
  const { id } = await params;

  const report = await prisma.monthlyReport.findUnique({
    where: { id },
    select: {
      id: true,
      year: true,
      month: true,
      participated: true,
      bibleStudies: true,
      hours: true,
      auxiliaryPioneer: true,
      comment: true,
      statusAtReport: true,
      publisher: {
        select: { fullName: true, group: { select: { name: true } } },
      },
    },
  });
  if (!report) notFound();

  return (
    <>
      <PageHeader
        title={`Informe · ${report.publisher.fullName}`}
        description={`${monthName(report.month)} ${report.year}${
          report.publisher.group?.name
            ? ` · ${report.publisher.group.name}`
            : ""
        }`}
        action={
          <LinkButton href="/informes/historial" variant="secondary">
            ← Historial
          </LinkButton>
        }
      />

      <Card>
        <CardHeader
          title="Detalle del informe"
          action={
            <ConfirmButton
              action={deleteSingleReportAction}
              hidden={{ id: report.id }}
              confirmText="¿Eliminar este informe? No se puede deshacer."
            >
              🗑️ Eliminar
            </ConfirmButton>
          }
        />
        <CardBody>
          <SingleReportEditor
            report={{
              id: report.id,
              status: report.statusAtReport,
              isPioneer: isPioneer(report.statusAtReport),
              participated: report.participated,
              bibleStudies: report.bibleStudies,
              hours: report.hours,
              auxiliaryPioneer: report.auxiliaryPioneer,
              comment: report.comment ?? "",
            }}
          />
        </CardBody>
      </Card>
    </>
  );
}
