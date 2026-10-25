import { requireReportsAccess, isSecretary, scopedGroupId,
  congregationId,
} from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { toInputDate } from "@/lib/dates";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody, EmptyState } from "@/components/ui";
import { PublisherCreateForm } from "@/components/forms/PublisherCreateForm";
import { PublishersImport } from "@/components/forms/PublishersImport";
import { PublisherList } from "@/components/forms/PublisherList";
import { GroupFilter } from "@/components/GroupFilter";
import { CardsDownload } from "@/components/forms/CardsDownload";
import { currentServiceYear } from "@/lib/publisher-card";

export default async function PublicadoresPage({
  searchParams,
}: {
  searchParams: Promise<{ grupo?: string }>;
}) {
  const user = await requireReportsAccess();
  const secretary = isSecretary(user);
  const { grupo } = await searchParams;

  // Alcance: super/aux limitados a su grupo; secretario puede filtrar.
  const cong = congregationId(user);
  const scope = scopedGroupId(user); // null si secretario
  const groupFilter = secretary ? grupo : (scope ?? undefined);

  // Años de servicio ofrecidos: el actual y los tres anteriores.
  const serviceYear = currentServiceYear();
  const serviceYears = [0, 1, 2, 3].map((n) => serviceYear - n);

  const groups = secretary
    ? await prisma.group.findMany({
        where: { congregationId: cong },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  const publishers = await prisma.publisher.findMany({
    where: {
      congregationId: cong,
      ...(scope ? { groupId: scope } : {}),
      ...(groupFilter ? { groupId: groupFilter } : {}),
    },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      sex: true,
      birthDate: true,
      baptismDate: true,
      hope: true,
      privilege: true,
      status: true,
      groupId: true,
      group: { select: { name: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Publicadores"
        description={
          secretary
            ? "Administra los publicadores de todos los grupos."
            : "Administra los publicadores de tu grupo."
        }
        action={
          <PublisherCreateForm showGroup={secretary} groups={groups} />
        }
      />

      {/* Alta en bloque desde planilla. Solo el Administrador, que es quien
          puede dar de alta en cualquier grupo. */}
      {secretary ? (
        <Card className="mb-4">
          <CardHeader
            title="Dar de alta varios publicadores"
            description="Descarga la planilla, complétala y súbela. Los grupos de predicación deben estar creados antes."
          />
          <CardBody>
            <PublishersImport />
          </CardBody>
        </Card>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {secretary ? (
          <GroupFilter groups={groups} current={grupo ?? ""} />
        ) : null}
        <CardsDownload
          groups={groups}
          showGroup={secretary}
          serviceYears={serviceYears}
          defaultServiceYear={serviceYear}
        />
      </div>

      <Card>
        <CardHeader
          title="Lista de publicadores"
          description={`${publishers.length} publicador(es)`}
        />
        {publishers.length === 0 ? (
          <EmptyState
            title="No hay publicadores"
            description="Usa el botón “Nuevo publicador” para agregar el primero."
          />
        ) : (
          <PublisherList
            showGroup={secretary}
            groups={groups}
            publishers={publishers.map((p) => ({
              id: p.id,
              fullName: p.fullName,
              sex: p.sex,
              birthDate: toInputDate(p.birthDate),
              baptismDate: toInputDate(p.baptismDate),
              hope: p.hope,
              privilege: p.privilege,
              status: p.status,
              groupId: p.groupId,
              groupName: p.group?.name ?? null,
            }))}
          />
        )}
      </Card>
    </>
  );
}
