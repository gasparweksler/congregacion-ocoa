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
      // Integrantes y usuarios, para desplegarlos con el "ojo" de cada fila.
      publishers: {
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true, status: true },
      },
      users: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, role: true, active: true },
      },
    },
  });

  return (
    <>
      <PageHeader
        title="Grupos de Servicio"
        description="Crea y administra los grupos de la congregación."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-1">
          <Card>
            <CardHeader title="Nuevo grupo" />
            <CardBody>
              <GroupCreateForm />
            </CardBody>
          </Card>
        </div>

        <div className="min-w-0 lg:col-span-2">
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
                          publishers: g.publishers.map((p) => ({
                            id: p.id,
                            name: p.fullName,
                            status: p.status,
                          })),
                          users: g.users.map((u) => ({
                            id: u.id,
                            name: u.name,
                            role: u.role,
                            active: u.active,
                          })),
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
