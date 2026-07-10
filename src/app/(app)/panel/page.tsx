import { requireReportsAccess, isSecretary, scopedGroupId } from "@/lib/access";
import { roleLabel, monthName } from "@/lib/constants";
import { previousPeriod } from "@/lib/period";
import { getPeriodStats, getPendingCountByGroup } from "@/lib/stats";
import { PageHeader } from "@/components/PageHeader";
import {
  Card,
  CardHeader,
  CardBody,
  Alert,
  LinkButton,
  EmptyState,
  Badge,
} from "@/components/ui";
import { StatsTiles } from "@/components/StatsTiles";

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
              <LinkButton href="/informes" variant="primary">
                📝 Subir informe
              </LinkButton>
              {secretary ? (
                <>
                  <LinkButton href="/grupos" variant="secondary">
                    🗂️ Grupos
                  </LinkButton>
                  <LinkButton href="/usuarios" variant="secondary">
                    🔑 Usuarios
                  </LinkButton>
                  <LinkButton href="/estadisticas" variant="secondary">
                    📊 Estadísticas
                  </LinkButton>
                  <LinkButton href="/reuniones" variant="secondary">
                    📅 Reuniones
                  </LinkButton>
                  <LinkButton href="/exportar" variant="secondary">
                    ⬇️ Exportar
                  </LinkButton>
                </>
              ) : (
                <>
                  <LinkButton href="/publicadores" variant="secondary">
                    👥 Publicadores
                  </LinkButton>
                  <LinkButton href="/estadisticas" variant="secondary">
                    📊 Estadísticas
                  </LinkButton>
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
  const pending = await getPendingCountByGroup(year, month);
  const groupsWithPending = pending.filter((g) => g.pending > 0);
  const totalGroups = pending.length;

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
              <li
                key={g.groupId}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-2"
              >
                <span className="font-medium text-foreground">
                  {g.groupName}
                </span>
                <Badge tone="amber">
                  {g.pending} de {g.total} pendientes
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
