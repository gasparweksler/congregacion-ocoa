import { requireReportsAccess, isSecretary, scopedGroupId } from "@/lib/access";
import { roleLabel, monthName } from "@/lib/constants";
import { previousPeriod } from "@/lib/period";
import {
  getPeriodStats,
  getPendingCountByGroup,
  getPendingPublishers,
} from "@/lib/stats";
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

export default async function PanelPage() {
  const user = await requireReportsAccess();
  const secretary = isSecretary(user);

  // Período "a informar": el mes recién terminado.
  const { year, month } = previousPeriod();
  const periodLabel = `${monthName(month)} ${year}`;

  const scope = scopedGroupId(user); // null si secretario
  const stats = await getPeriodStats(scope ? { groupId: scope } : {}, year, month);

  return (
    <>
      <PageHeader
        title={`Hola, ${user.name ?? user.username}`}
        description={`${roleLabel(user.role)} · Resumen de ${periodLabel}`}
      />

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
  year,
  month,
  periodLabel,
}: {
  year: number;
  month: number;
  periodLabel: string;
}) {
  const [pending, pendingPublishers] = await Promise.all([
    getPendingCountByGroup(year, month),
    getPendingPublishers(null, year, month),
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
