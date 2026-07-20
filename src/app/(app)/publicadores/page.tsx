import { requireReportsAccess, isSecretary, scopedGroupId } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { toInputDate } from "@/lib/dates";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { PublisherCreateForm } from "@/components/forms/PublisherCreateForm";
import { PublisherList } from "@/components/forms/PublisherList";
import { GroupFilter } from "@/components/GroupFilter";

export default async function PublicadoresPage({
  searchParams,
}: {
  searchParams: Promise<{ grupo?: string }>;
}) {
  const user = await requireReportsAccess();
  const secretary = isSecretary(user);
  const { grupo } = await searchParams;

  // Alcance: super/aux limitados a su grupo; secretario puede filtrar.
  const scope = scopedGroupId(user); // null si secretario
  const groupFilter = secretary ? grupo : (scope ?? undefined);

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
      sex: true,
      birthDate: true,
      baptismDate: true,
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

      {secretary ? (
        <div className="mb-4">
          <GroupFilter groups={groups} current={grupo ?? ""} />
        </div>
      ) : null}

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
