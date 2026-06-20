import { requireSecretary } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import {
  Card,
  CardHeader,
  CardBody,
  Table,
  Th,
  EmptyState,
} from "@/components/ui";
import { GroupCreateForm } from "@/components/forms/GroupCreateForm";
import { GroupRow } from "@/components/forms/GroupRow";

export default async function GruposPage() {
  await requireSecretary();

  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      _count: { select: { publishers: true, users: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Grupos de Servicio"
        description="Crea y administra los grupos de la congregación."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader title="Nuevo grupo" />
            <CardBody>
              <GroupCreateForm />
            </CardBody>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Grupos existentes"
              description={`${groups.length} grupo(s)`}
            />
            {groups.length === 0 ? (
              <EmptyState
                title="Aún no hay grupos"
                description="Crea el primer grupo con el formulario de la izquierda."
              />
            ) : (
              <CardBody className="px-0 py-0">
                <Table>
                  <thead>
                    <tr>
                      <Th>Nombre</Th>
                      <Th>Publicadores</Th>
                      <Th>Usuarios</Th>
                      <Th className="text-right">Acciones</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <GroupRow
                        key={g.id}
                        group={{
                          id: g.id,
                          name: g.name,
                          publisherCount: g._count.publishers,
                          userCount: g._count.users,
                        }}
                      />
                    ))}
                  </tbody>
                </Table>
              </CardBody>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
