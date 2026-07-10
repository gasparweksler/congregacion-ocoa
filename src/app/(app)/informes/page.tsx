import { requireReportsAccess, isSecretary, scopedGroupId } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { isPioneer, monthName } from "@/lib/constants";
import { parsePeriod, previousPeriod } from "@/lib/period";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/PageHeader";
import {
  Card,
  CardHeader,
  CardBody,
  EmptyState,
  LinkButton,
} from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { deleteReportsPeriodAction } from "@/server/report-actions";
import { PeriodSelector } from "@/components/PeriodSelector";
import { GroupFilter } from "@/components/GroupFilter";
import { ReportsForm, type ReportRow } from "@/components/forms/ReportsForm";

export default async function InformesPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; mes?: string; grupo?: string }>;
}) {
  const user = await requireReportsAccess();
  const secretary = isSecretary(user);
  const sp = await searchParams;
  // Por defecto se muestra el mes anterior (el que toca informar). Editable.
  const { year, month } = parsePeriod(sp.anio, sp.mes, previousPeriod());

  const scope = scopedGroupId(user); // null si secretario
  const groupFilter = secretary ? sp.grupo : (scope ?? undefined);

  // Último informe subido dentro del alcance del usuario (para mostrarlo arriba).
  const lastReport = await prisma.monthlyReport.findFirst({
    where: {
      publisher: {
        ...(scope ? { groupId: scope } : {}),
        ...(groupFilter ? { groupId: groupFilter } : {}),
      },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      updatedAt: true,
      year: true,
      month: true,
      submittedBy: { select: { name: true } },
    },
  });

  const groups = secretary
    ? await prisma.group.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  const publishers = await prisma.publisher.findMany({
    where: {
      ...(scope ? { groupId: scope } : {}),
      ...(groupFilter ? { groupId: groupFilter } : {}),
    },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      status: true,
      reports: {
        where: { year, month },
        select: {
          participated: true,
          bibleStudies: true,
          hours: true,
          auxiliaryPioneer: true,
          comment: true,
        },
      },
    },
  });

  const rows: ReportRow[] = publishers.map((p) => {
    const r = p.reports[0];
    return {
      id: p.id,
      fullName: p.fullName,
      status: p.status,
      isPioneer: isPioneer(p.status),
      participated: r?.participated ?? false,
      bibleStudies: r?.bibleStudies ?? 0,
      hours: r?.hours ?? null,
      auxiliaryPioneer: r?.auxiliaryPioneer ?? false,
      comment: r?.comment ?? "",
    };
  });

  // Para el secretario sin filtro de grupo, exigir seleccionar grupo evita
  // formularios gigantescos y confusos.
  const needsGroupChoice = secretary && !groupFilter;

  return (
    <>
      <PageHeader
        title="Informes mensuales"
        description={`Registra la actividad de ${monthName(month)} ${year}.`}
      />

      {secretary ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <LinkButton href="/informes/historial" variant="secondary">
            📋 Historial de informes
          </LinkButton>
          {user.groupId ? (
            <LinkButton
              href={`/informes?grupo=${user.groupId}`}
              variant="primary"
            >
              📝 Subir informes de mi propio grupo
            </LinkButton>
          ) : null}
        </div>
      ) : null}

      {lastReport ? (
        <Card className="mb-4">
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <span className="font-semibold text-foreground">
                📌 Último informe subido:{" "}
              </span>
              {monthName(lastReport.month)} {lastReport.year}
              <span className="text-muted">
                {" "}
                · guardado el {formatDate(lastReport.updatedAt)}
                {lastReport.submittedBy?.name
                  ? ` por ${lastReport.submittedBy.name}`
                  : ""}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <LinkButton
                href={`/informes?anio=${lastReport.year}&mes=${lastReport.month}${
                  sp.grupo ? `&grupo=${sp.grupo}` : ""
                }`}
                variant="secondary"
              >
                ✏️ Editar
              </LinkButton>
              <ConfirmButton
                action={deleteReportsPeriodAction}
                hidden={{
                  year: String(lastReport.year),
                  month: String(lastReport.month),
                  grupo: sp.grupo ?? "",
                }}
                confirmText={`¿Eliminar los informes de ${monthName(
                  lastReport.month,
                )} ${lastReport.year}? Esta acción no se puede deshacer.`}
              >
                🗑️ Eliminar
              </ConfirmButton>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PeriodSelector year={year} month={month} />
        {secretary ? (
          <GroupFilter groups={groups} current={sp.grupo ?? ""} />
        ) : null}
      </div>

      <Card>
        <CardHeader
          title={`${monthName(month)} ${year}`}
          description={
            needsGroupChoice
              ? "Selecciona un grupo para cargar sus informes."
              : `${rows.length} publicador(es). Marca participación, cursos y horas (precursores).`
          }
        />
        {needsGroupChoice ? (
          <EmptyState
            title="Selecciona un grupo"
            description="Usa el filtro de arriba para elegir el grupo cuyos informes deseas cargar."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No hay publicadores"
            description="Agrega publicadores antes de registrar informes."
          />
        ) : (
          <CardBody>
            <ReportsForm year={year} month={month} rows={rows} />
          </CardBody>
        )}
      </Card>
    </>
  );
}
