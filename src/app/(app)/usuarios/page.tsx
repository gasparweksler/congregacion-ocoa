// ============================================================================
//  Usuarios de una congregación.
//  El Administrador ve los de la suya. El Superadministrador puede abrir los de
//  cualquiera con ?congregacion=<id> desde el panel de Plataforma: es la MISMA
//  pantalla y las MISMAS acciones, así que lo que haga allí se refleja aquí sin
//  ninguna sincronización aparte.
// ============================================================================

import { redirect } from "next/navigation";
import Link from "next/link";
import {
  requireUser,
  isSecretary,
  isSuperadmin,
  landingFor,
  targetCongregationId,
} from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody, EmptyState, Alert } from "@/components/ui";
import { UserCreateForm } from "@/components/forms/UserCreateForm";
import { UserRow } from "@/components/forms/UserRow";

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ congregacion?: string }>;
}) {
  const actor = await requireUser();
  if (!isSecretary(actor)) redirect(landingFor(actor));

  const sp = await searchParams;
  // Solo el Superadministrador puede pedir otra congregación; para el resto se
  // ignora y queda la suya.
  const pedida = isSuperadmin(actor) ? (sp.congregacion ?? "") : "";
  if (!pedida && !actor.congregationId) redirect("/plataforma");
  const cong = targetCongregationId(actor, pedida);

  const [congregation, groups, users] = await Promise.all([
    prisma.congregation.findUnique({
      where: { id: cong },
      select: { id: true, name: true, active: true },
    }),
    prisma.group.findMany({
      where: { congregationId: cong },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { congregationId: cong },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        groupId: true,
        active: true,
        alsoConfirmador: true,
        groupRoleLabel: true,
        group: { select: { name: true } },
      },
    }),
  ]);

  if (!congregation) redirect("/plataforma");

  // ¿Se están viendo los usuarios de OTRA congregación? Conviene dejarlo claro
  // para no crear un usuario en la que no era.
  const ajena = congregation.id !== actor.congregationId;
  // Las acciones solo necesitan el dato cuando no es la congregación propia.
  const congregacion = ajena ? congregation.id : undefined;

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Administra Administradores, Superintendentes, Auxiliares y Responsables de Confirmaciones y sus accesos."
        action={
          isSuperadmin(actor) ? (
            <Link
              href="/plataforma"
              className="text-sm font-medium text-primary hover:underline"
            >
              ← Plataforma
            </Link>
          ) : undefined
        }
      />

      {ajena ? (
        <div className="mb-4">
          <Alert tone="warning">
            🌐 Estás administrando los usuarios de{" "}
            <strong>{congregation.name}</strong>
            {congregation.active ? "" : " (congregación desactivada)"}. Lo que
            crees o edites aquí pertenece a esa congregación, no a la tuya.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-1">
          <Card>
            <CardHeader
              title="Nuevo usuario"
              description={ajena ? `Se creará en ${congregation.name}.` : undefined}
            />
            <CardBody>
              <UserCreateForm groups={groups} congregacion={congregacion} />
            </CardBody>
          </Card>
        </div>

        <div className="min-w-0 lg:col-span-2">
          <Card>
            <CardHeader
              title={ajena ? `Usuarios de ${congregation.name}` : "Usuarios del sistema"}
              description={`${users.length} usuario(s)`}
            />
            {users.length === 0 ? (
              <EmptyState
                title="No hay usuarios"
                description="Crea el primero con el formulario de la izquierda."
              />
            ) : (
              <div className="divide-y divide-border">
                {users.map((u) => (
                  <UserRow
                    key={u.id}
                    isSelf={u.id === actor.id}
                    groups={groups}
                    congregacion={congregacion}
                    user={{
                      id: u.id,
                      name: u.name,
                      username: u.username,
                      role: u.role,
                      groupId: u.groupId,
                      groupName: u.group?.name ?? null,
                      active: u.active,
                      alsoConfirmador: u.alsoConfirmador,
                      groupRoleLabel: u.groupRoleLabel,
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
