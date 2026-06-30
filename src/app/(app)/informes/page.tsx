import { requireReportsAccess, isSecretary, scopedGroupId } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { isPioneer, monthName } from "@/lib/constants";
import { parsePeriod } from "@/lib/period";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody, EmptyState } from "@/components/ui";
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
  const { year, month } = parsePeriod(sp.anio, sp.mes);

  const scope = scopedGroupId(user); // null si secretario
  const groupFilter = secretary ? sp.grupo : (scope ?? undefined);

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
