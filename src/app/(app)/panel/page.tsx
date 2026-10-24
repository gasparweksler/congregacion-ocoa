import { requireReportsAccess, isSecretary, scopedGroupId,
  congregationId,
} from "@/lib/access";
import { roleLabel, monthName } from "@/lib/constants";
import { previousPeriod } from "@/lib/period";
import {
  getPeriodStats,
  getPendingCountByGroup,
  getPendingPublishers,
} from "@/lib/stats";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import {
  Card,
  CardHeader,
  CardBody,
  Alert,
  LinkButton,
  EmptyState,
} from "@/components/ui";
import { StatsTiles } from "@/components/StatsTiles";
import { LoadingLinkButton } from "@/components/LoadingLinkButton";
import { PendingGroupRow } from "@/components/PendingGroupRow";
import { FirstSteps } from "@/components/FirstSteps";

export default async function PanelPage() {
  const user = await requireReportsAccess();
  const secretary = isSecretary(user);

  // Período "a informar": el mes recién terminado.
  const { year, month } = previousPeriod();
  const periodLabel = `${monthName(month)} ${year}`;

  const scope = scopedGroupId(user); // null si secretario
  const cong = congregationId(user);
  const stats = await getPeriodStats(
    { congregationId: cong, ...(scope ? { groupId: scope } : {}) },
    year,
    month,
  );

  // Primeros pasos: solo para el Administrador, que es quien puede darlos.
  const primerosPasos = secretary
    ? await (async () => {
        const [grupos, publicadores, usuarios] = await Promise.all([
          prisma.group.count({ where: { congregationId: cong } }),
          prisma.publisher.count({ where: { congregationId: cong } }),
          prisma.user.count({ where: { congregationId: cong } }),
        ]);
        return [
          {
            label: "Crear los grupos de predicación",
            description: "Los publicadores se reparten por grupos.",
            href: "/grupos",
            done: grupos > 0,
          },
          {
            label: "Dar de alta a los publicadores",
            description: "Hace falta para registrar informes y asignaciones.",
            href: "/publicadores",
            done: publicadores > 0,
          },
          {
            label: "Crear los usuarios de la congregación",
            description:
              "Para que superintendentes y auxiliares entren con su propia clave.",
            href: "/usuarios",
            // Siempre hay al menos el propio Administrador: hace falta más de uno.
            done: usuarios > 1,
          },
        ];
      })()
    : [];

  return (
    <>
      <PageHeader
        title={`Hola, ${user.name ?? user.username}`}
        description={`${roleLabel(user.role)} · Resumen de ${periodLabel}`}
      />

      {primerosPasos.length > 0 ? (
        <div className="mb-6">
          <FirstSteps steps={primerosPasos} />
        </div>
      ) : null}

      <div className="flex flex-col gap-6">
        {/* Accesos rápidos: primero en celular, segundo en escritorio. */}
        <div className="order-1 lg:order-2">
          <Card>
            <CardHeader title="Accesos rápidos" />
            <CardBody className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <LoadingLinkButton href="/informes" variant="primary">
                📝 Subir informe
              </LoadingLinkButton>
              {secretary ? (
                <>
                  <LoadingLinkButton href="/grupos" variant="secondary">
                    🗂️ Grupos
                  </LoadingLinkButton>
                  <LoadingLinkButton href="/usuarios" variant="secondary">
                    🔑 Usuarios
                  </LoadingLinkButton>
                  <LoadingLinkButton href="/estadisticas" variant="secondary">
                    📊 Estadísticas
                  </LoadingLinkButton>
                  <LoadingLinkButton href="/reuniones" variant="secondary">
                    📅 Reuniones
                  </LoadingLinkButton>
                  <LoadingLinkButton href="/exportar" variant="secondary">
                    ⬇️ Exportar
                  </LoadingLinkButton>
                </>
              ) : (
                <>
                  <LoadingLinkButton href="/publicadores" variant="secondary">
                    👥 Publicadores
                  </LoadingLinkButton>
                  <LoadingLinkButton href="/estadisticas" variant="secondary">
                    📊 Estadísticas
                  </LoadingLinkButton>
                </>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Recuadros de resumen: primero en escritorio, debajo en celular. */}
        <div className="order-2 lg:order-1">
          <StatsTiles stats={stats} variant="panel" />
        </div>

        {/* Solo Administrador: informes pendientes por grupo. */}
        {secretary ? (
          <div className="order-3">
            <PendingByGroup
              congregationId={cong}
              year={year}
              month={month}
              periodLabel={periodLabel}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}

async function PendingByGroup({
  congregationId: cong,
  year,
  month,
  periodLabel,
}: {
  congregationId: string;
  year: number;
  month: number;
  periodLabel: string;
}) {
  const [pending, pendingPublishers] = await Promise.all([
    getPendingCountByGroup(cong, year, month),
    getPendingPublishers(cong, null, year, month),
  ]);
  const groupsWithPending = pending.filter((g) => g.pending > 0);
  const totalGroups = pending.length;

  // Publicadores pendientes (id + nombre), agrupados por nombre de grupo.
  const namesByGroup = new Map<string, { id: string; fullName: string }[]>();
  for (const p of pendingPublishers) {
    const key = p.groupName ?? "—";
    const list = namesByGroup.get(key) ?? [];
    list.push({ id: p.id, fullName: p.fullName });
    namesByGroup.set(key, list);
  }

  return (
    <Card>
      <CardHeader
        title="Informes pendientes por grupo"
        description={`Publicadores sin informe en ${periodLabel}.`}
      />
      <CardBody>
        {totalGroups === 0 ? (
          <EmptyState
            title="Aún no hay grupos"
            description="Crea grupos para comenzar."
            action={<LinkButton href="/grupos">Crear grupos</LinkButton>}
          />
        ) : groupsWithPending.length === 0 ? (
          <Alert tone="success">
            ¡Excelente! Todos los grupos completaron sus informes de{" "}
            {periodLabel}.
          </Alert>
        ) : (
          <ul className="space-y-2">
            {groupsWithPending.map((g) => (
              <PendingGroupRow
                key={g.groupId}
                groupId={g.groupId}
                groupName={g.groupName}
                pending={g.pending}
                total={g.total}
                year={year}
                month={month}
                publishers={namesByGroup.get(g.groupName) ?? []}
              />
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
