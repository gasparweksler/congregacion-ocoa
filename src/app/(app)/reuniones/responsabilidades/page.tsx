import { requireMeetingsAccess,
  congregationId,
} from "@/lib/access";
import { prisma } from "@/lib/prisma";
import {
  monthName,
  RESP_CATEGORIES,
  RESP_MANAGED_CATEGORIES,
} from "@/lib/constants";
import { getVolunteersByCategory } from "@/lib/resp-volunteers";
import { parsePeriod } from "@/lib/period";
import { getMonthlyResponsibilities } from "@/server/monthly-resp-actions";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui";
import { PeriodSelector } from "@/components/PeriodSelector";
import { BackButton } from "@/components/BackButton";
import { MonthlyResponsibilities } from "@/components/forms/MonthlyResponsibilities";
import { RespVolunteers } from "@/components/forms/RespVolunteers";
import { AutoAssignButton } from "@/components/forms/AutoAssignButton";
import { RespPdfDownload } from "@/components/forms/RespPdfDownload";

export default async function ResponsabilidadesMensualPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; mes?: string }>;
}) {
  const user = await requireMeetingsAccess();
  const cong = congregationId(user);
  const sp = await searchParams;
  const { year, month } = parsePeriod(sp.anio, sp.mes);

  const [publishersRaw, groupsRaw, rows, volunteers, ajustes] = await Promise.all([
    prisma.publisher.findMany({
      where: { congregationId: cong },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
    prisma.group.findMany({
      where: { congregationId: cong },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
    getMonthlyResponsibilities(year, month),
    getVolunteersByCategory(cong),
    prisma.congregation.findUnique({
      where: { id: cong },
      select: { videoSameAsAudio: true },
    }),
  ]);

  const publishers = publishersRaw.map((p) => p.fullName);
  // Para los desplegables de la ventana de disponibles (hace falta el id).
  const publisherOptions = publishersRaw.map((p) => ({ id: p.id, name: p.fullName }));
  const groups = groupsRaw.map((g) => g.name);
  const videoSameAsAudio = ajustes?.videoSameAsAudio ?? false;
  // Cuántos hermanos hay apuntados en total (sin contar la Atalaya, que no es
  // una responsabilidad que se reparta).
  const totalDisponibles = RESP_CATEGORIES.reduce(
    (n, c) => n + (volunteers[c.key]?.length ?? 0),
    0,
  );

  return (
    <>
      <PageHeader
        title="Todas las Responsabilidades del mes"
        description={`Planifica las responsabilidades de todas las reuniones de ${monthName(month)} ${year} desde una sola pantalla.`}
        action={<BackButton href="/reuniones" />}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PeriodSelector year={year} month={month} />
        <RespPdfDownload year={year} month={month} />
      </div>

      {/* Quién puede hacer cada responsabilidad, y el reparto automático que
          se apoya en esas listas. */}
      <Card className="mb-4">
        <CardHeader
          title="Hermanos disponibles por responsabilidad"
          description="Los nombres se eligen de los publicadores de la congregación. Un hermano puede estar en varias categorías."
        />
        <CardBody className="space-y-4">
          <RespVolunteers
            categories={RESP_MANAGED_CATEGORIES}
            videoSameAsAudio={videoSameAsAudio}
            byCategory={volunteers}
            publishers={publisherOptions}
          />
          <div className="border-t border-border pt-4">
            <AutoAssignButton
              year={year}
              month={month}
              disponibles={totalDisponibles}
            />
          </div>
        </CardBody>
      </Card>

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

      {/* El selector se repite al final: con un mes entero de fechas, volver
          arriba para cambiar de mes obliga a un scroll largo. */}
      <div className="mt-4 flex justify-center">
        <PeriodSelector year={year} month={month} />
      </div>
    </>
  );
}
