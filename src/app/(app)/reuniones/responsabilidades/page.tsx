import { requireMeetingsAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { monthName } from "@/lib/constants";
import { parsePeriod } from "@/lib/period";
import { getMonthlyResponsibilities } from "@/server/monthly-resp-actions";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui";
import { PeriodSelector } from "@/components/PeriodSelector";
import { BackButton } from "@/components/BackButton";
import { MonthlyResponsibilities } from "@/components/forms/MonthlyResponsibilities";

export default async function ResponsabilidadesMensualPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; mes?: string }>;
}) {
  await requireMeetingsAccess();
  const sp = await searchParams;
  const { year, month } = parsePeriod(sp.anio, sp.mes);

  const [publishersRaw, groupsRaw, rows] = await Promise.all([
    prisma.publisher.findMany({
      orderBy: { fullName: "asc" },
      select: { fullName: true },
    }),
    prisma.group.findMany({
      orderBy: { name: "asc" },
      select: { name: true },
    }),
    getMonthlyResponsibilities(year, month),
  ]);

  const publishers = publishersRaw.map((p) => p.fullName);
  const groups = groupsRaw.map((g) => g.name);

  return (
    <>
      <PageHeader
        title="Todas las Responsabilidades del mes"
        description={`Planifica las responsabilidades de todas las reuniones de ${monthName(month)} ${year} desde una sola pantalla.`}
        action={<BackButton href="/reuniones" />}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PeriodSelector year={year} month={month} />
        <a
          href={`/api/responsabilidades-pdf?anio=${year}&mes=${month}`}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--primary-hover)]"
        >
          📄 Descargar PDF
        </a>
      </div>

      <Card>
        <CardHeader
          title={`Responsabilidades · ${monthName(month)} ${year}`}
          description="Cada cambio se guarda automáticamente y se refleja en la reunión."
        />
        <CardBody>
          <MonthlyResponsibilities
            rows={rows}
            publishers={publishers}
            groups={groups}
          />
        </CardBody>
      </Card>
    </>
  );
}
