// ============================================================================
//  Panel de PLATAFORMA (solo Superadministrador)
//  Lista las congregaciones, permite crear nuevas con su primer Administrador
//  y activarlas o desactivarlas. No muestra datos internos de ninguna
//  congregación: eso es cosa de su propio Administrador.
// ============================================================================

import Link from "next/link";
import { requireSuperadmin } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { ROLES, roleLabel } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/PageHeader";
import {
  Card,
  CardHeader,
  CardBody,
  Table,
  Th,
  Td,
  Badge,
  EmptyState,
} from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CongregationCreateForm } from "@/components/forms/CongregationCreateForm";
import { setCongregationActiveAction } from "@/server/platform-actions";

export default async function PlataformaPage() {
  const user = await requireSuperadmin();

  const congregations = await prisma.congregation.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      active: true,
      createdAt: true,
      _count: {
        select: { users: true, groups: true, publishers: true, reports: true },
      },
      users: {
        where: { role: ROLES.SECRETARIO },
        orderBy: { name: "asc" },
        select: { id: true, name: true, username: true, active: true },
      },
    },
  });

  const totales = congregations.reduce(
    (a, c) => ({
      publicadores: a.publicadores + c._count.publishers,
      informes: a.informes + c._count.reports,
      usuarios: a.usuarios + c._count.users,
    }),
    { publicadores: 0, informes: 0, usuarios: 0 },
  );

  return (
    <>
      <PageHeader
        title="Plataforma"
        description="Congregaciones registradas y sus administradores."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted">Congregaciones</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-primary">
            {congregations.length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">Publicadores</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-700">
            {totales.publicadores}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">Informes</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-700">
            {totales.informes}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">Usuarios</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-700">
            {totales.usuarios}
          </p>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader
          title="Nueva congregación"
          description="Se crea junto con su primer Administrador, para que pueda entrar de inmediato."
        />
        <CardBody>
          <CongregationCreateForm />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Congregaciones"
          description={`${congregations.length} registrada(s).`}
        />
        {congregations.length === 0 ? (
          <EmptyState
            title="Todavía no hay congregaciones"
            description="Crea la primera con el formulario de arriba."
          />
        ) : (
          <CardBody className="px-0 py-0">
            <Table>
              <thead>
                <tr>
                  <Th>Congregación</Th>
                  <Th>Administrador(es)</Th>
                  <Th>Grupos</Th>
                  <Th>Publicadores</Th>
                  <Th>Informes</Th>
                  <Th>Estado</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {congregations.map((c) => (
                  <tr key={c.id}>
                    <Td className="font-medium">
                      {c.name}
                      <span className="block text-xs text-muted">
                        {c.slug} · desde {formatDate(c.createdAt)}
                      </span>
                    </Td>
                    <Td>
                      {c.users.length === 0 ? (
                        <span className="text-sm text-red-600">
                          Sin administrador
                        </span>
                      ) : (
                        c.users.map((u) => (
                          <span key={u.id} className="block text-sm">
                            {u.name}
                            <span className="text-muted"> · {u.username}</span>
                            {u.active ? null : (
                              <span className="text-red-600"> (inactivo)</span>
                            )}
                          </span>
                        ))
                      )}
                    </Td>
                    <Td className="tabular-nums">{c._count.groups}</Td>
                    <Td className="tabular-nums">{c._count.publishers}</Td>
                    <Td className="tabular-nums">{c._count.reports}</Td>
                    <Td>
                      <Badge tone={c.active ? "green" : "red"}>
                        {c.active ? "Activa" : "Desactivada"}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Abre la MISMA pantalla de Usuarios acotada a esta
                            congregación: lo que se haga allí queda en su ficha
                            sin ninguna sincronización aparte. */}
                        <Link
                          href={`/usuarios?congregacion=${c.id}`}
                          className="rounded-md px-2.5 py-1 text-sm font-medium text-primary hover:bg-indigo-50"
                        >
                          👥 Ver Usuarios
                        </Link>
                        {/* Desactivar impide entrar a sus usuarios, pero no borra
                            nada: siempre se puede volver a activar. */}
                        <ConfirmButton
                          action={setCongregationActiveAction}
                          hidden={{ id: c.id, active: c.active ? "0" : "1" }}
                          confirmText={
                            c.active
                              ? `¿Desactivar "${c.name}"? Sus usuarios no podrán iniciar sesión. No se borra ningún dato.`
                              : `¿Volver a activar "${c.name}"?`
                          }
                        >
                          {c.active ? "Desactivar" : "Activar"}
                        </ConfirmButton>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardBody>
        )}
      </Card>

      <p className="mt-6 text-sm text-muted">
        Sesión de {user.name ?? user.username} · {roleLabel(user.role)}.
        {user.congregationName
          ? ` Además administras ${user.congregationName}.`
          : ""}
      </p>
    </>
  );
}
