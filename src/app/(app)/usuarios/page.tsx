import { requireSecretary } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody, EmptyState } from "@/components/ui";
import { UserCreateForm } from "@/components/forms/UserCreateForm";
import { UserRow } from "@/components/forms/UserRow";

export default async function UsuariosPage() {
  const actor = await requireSecretary();

  const [groups, users] = await Promise.all([
    prisma.group.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        groupId: true,
        active: true,
        group: { select: { name: true } },
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Administra Administradores, Superintendentes, Auxiliares y Responsables de Confirmaciones y sus accesos."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader title="Nuevo usuario" />
            <CardBody>
              <UserCreateForm groups={groups} />
            </CardBody>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Usuarios del sistema"
              description={`${users.length} usuario(s)`}
            />
            {users.length === 0 ? (
              <EmptyState title="No hay usuarios" />
            ) : (
              <div className="divide-y divide-border">
                {users.map((u) => (
                  <UserRow
                    key={u.id}
                    isSelf={u.id === actor.id}
                    groups={groups}
                    user={{
                      id: u.id,
                      name: u.name,
                      username: u.username,
                      role: u.role,
                      groupId: u.groupId,
                      groupName: u.group?.name ?? null,
                      active: u.active,
                    }}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
