import Link from "next/link";
import { requireReportsAccess, isSecretary, scopedGroupId } from "@/lib/access";
import { prisma } from "@/lib/prisma";
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

      <div className="mb-6">
        <StatsTiles stats={stats} />
      </div>

      {secretary ? (
        <SecretaryDashboard year={year} month={month} periodLabel={periodLabel} />
      ) : (
        <GroupDashboard
          groupId={scope!}
          year={year}
          month={month}
          periodLabel={periodLabel}
        />
      )}
    </>
  );
}

// --- Panel del Secretario ---------------------------------------------------
async function SecretaryDashboard({
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
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
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

      <Card>
        <CardHeader title="Accesos rápidos" />
        <CardBody className="flex flex-col gap-2">
          <LinkButton href="/informes" variant="primary">
            📝 Subir informe
          </LinkButton>
          <LinkButton href="/grupos" variant="secondary">
            🗂️ Grupos
          </LinkButton>
          <LinkButton href="/usuarios" variant="secondary">
            🔑 Usuarios
          </LinkButton>
          <LinkButton href="/estadisticas" variant="secondary">
            📊 Estadísticas
          </LinkButton>
          <LinkButton href="/exportar" variant="secondary">
            ⬇️ Exportar a Excel
          </LinkButton>
        </CardBody>
      </Card>
    </div>
  );
}

// --- Panel de Superintendente / Auxiliar ------------------------------------
async function GroupDashboard({
  groupId,
  year,
  month,
  periodLabel,
}: {
  groupId: string;
  year: number;
  month: number;
  periodLabel: string;
}) {
  const pending = await getPendingPublishers(groupId, year, month);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader
          title="Publicadores pendientes de informar"
          description={`Sin informe en ${periodLabel}.`}
        />
        <CardBody>
          {pending.length === 0 ? (
            <Alert tone="success">
              ¡Tu grupo completó todos los informes de {periodLabel}!
            </Alert>
          ) : (
            <ul className="divide-y divide-border">
              {pending.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between py-2"
                >
                  <span className="text-foreground">{p.fullName}</span>
                  <Link
                    href="/informes"
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Subir →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Accesos rápidos" />
        <CardBody className="flex flex-col gap-2">
          <LinkButton href="/informes" variant="primary">
            📝 Subir informe
          </LinkButton>
          <LinkButton href="/publicadores" variant="secondary">
            👥 Publicadores
          </LinkButton>
          <LinkButton href="/estadisticas" variant="secondary">
            📊 Estadísticas
          </LinkButton>
        </CardBody>
      </Card>
    </div>
  );
}
