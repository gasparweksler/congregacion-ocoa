// ============================================================================
//  Estadísticas de Asignaciones
//  Historial completo de asignaciones de la congregación, con filtros y aviso
//  por hermanos que llevan tiempo sin una asignación REGISTRADA como realizada.
//
//  Nota importante que se muestra también en pantalla: "realizada" es el
//  registro posterior a la reunión, no la confirmación previa por WhatsApp. Lo
//  que nadie marcó cuenta como "sin registrar", nunca como realizada.
// ============================================================================

import { requireMeetingsAccess } from "@/lib/access";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody, Alert } from "@/components/ui";
import { BackButton } from "@/components/BackButton";
import { AssignmentStatsFilters } from "@/components/forms/AssignmentStatsFilters";
import {
  AssignmentHistory,
  type BrotherRow,
} from "@/components/AssignmentHistory";
import { WithoutAssignmentTile } from "@/components/WithoutAssignmentTile";
import { getAssignmentStats } from "@/server/assignment-stats-actions";

export default async function EstadisticasAsignacionesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    section?: string;
    desde?: string;
    hasta?: string;
    dias?: string;
    resp?: string;
  }>;
}) {
  await requireMeetingsAccess();
  const sp = await searchParams;

  const dias = Math.min(3650, Math.max(1, Number(sp.dias) || 90));
  const incluirResponsabilidades = sp.resp === "1";

  const { brothers, neverAssigned, unmatched, sections, totals } =
    await getAssignmentStats({
    q: sp.q,
    section: sp.section,
    desde: sp.desde,
    hasta: sp.hasta,
    incluirResponsabilidades,
  });

  // Las fechas viajan como texto al componente de cliente.
  const rows: BrotherRow[] = brothers.map((b) => ({
    ...b,
    lastDone: b.lastDone ? b.lastDone.toISOString() : null,
    lastAssigned: b.lastAssigned ? b.lastAssigned.toISOString() : null,
    participations: b.participations.map((p) => ({
      ...p,
      date: p.date.toISOString(),
    })),
  }));

  // Quiénes están detrás del aviso, no solo cuántos (el ojo del recuadro).
  const avisados = rows
    .filter(
      (b) =>
        b.daysSinceAssigned !== null &&
        b.daysSinceAssigned > dias &&
        // Solo publicadores: en las asignaciones hay textos que no son
        // personas ("Grupo 3", "Asamblea Regional"). Esos ya se avisan aparte,
        // en "Sin emparejar".
        b.publisherId !== null,
    )
    .map((b) => ({
      name: b.name,
      groupName: b.groupName,
      days: b.daysSinceAssigned,
    }))
    .sort(
      (a, b) =>
        (b.days ?? 0) - (a.days ?? 0) || a.name.localeCompare(b.name, "es"),
    );
  // Publicadores activos sin ninguna asignación en el período.
  const sinParticipacion = neverAssigned
    .map((p) => ({ name: p.name, groupName: p.groupName, days: null }))
    .sort(
      (a, b) =>
        (a.groupName ?? "").localeCompare(b.groupName ?? "", "es") ||
        a.name.localeCompare(b.name, "es"),
    );
  const sinNinguna = rows.filter((b) => b.lastDone === null).length;

  return (
    <>
      <PageHeader
        title="Estadísticas de Asignaciones"
        description="Historial de asignaciones de cada hermano y aviso por tiempo sin participar."
        action={<BackButton href="/reuniones" />}
      />

      {/* Sin este aviso, los números de abajo se leerían mal. */}
      {totals.sinRegistrar > 0 ? (
        <div className="mb-4">
          <Alert tone="warning">
            ⚠️ Hay <strong>{totals.sinRegistrar}</strong> asignación(es) cuyo
            cumplimiento nadie registró todavía, de un total de{" "}
            {totals.participations}. No se cuentan como realizadas: el sistema no
            da por hecho que lo programado se llevó a cabo. Para registrarlo,
            entra a cada reunión y pulsa <strong>«Marcar reunión como
            realizada»</strong>.
          </Alert>
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted">Realizadas</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">
            {totals.realizadas}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">Sin registrar</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-700">
            {totals.sinRegistrar}
          </p>
        </Card>
        <WithoutAssignmentTile
          dias={dias}
          conAviso={avisados}
          sinParticipacion={sinParticipacion}
        />
        <Card className="p-4">
          {/* Distinto del aviso de al lado: aquí sí se mira el cumplimiento. */}
          <p className="text-sm text-muted">Sin ninguna realizada</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-700">
            {sinNinguna}
          </p>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader
          title="Filtros"
          description={
            totals.primeraReunion && totals.ultimaReunion
              ? `Historial disponible: ${totals.meetings} reunión(es), de ${formatDate(totals.primeraReunion)} a ${formatDate(totals.ultimaReunion)}.`
              : "Todavía no hay reuniones registradas."
          }
        />
        <CardBody>
          <AssignmentStatsFilters
            sections={sections}
            incluirResponsabilidades={incluirResponsabilidades}
          />
        </CardBody>
      </Card>

      {unmatched.length > 0 ? (
        <div className="mb-6">
          <Alert tone="info">
            ℹ️ {unmatched.length} nombre(s) de las asignaciones no coinciden con
            ningún publicador registrado, así que aparecen aparte en vez de
            atribuirse a alguien por parecido:{" "}
            <strong>
              {unmatched
                .slice(0, 8)
                .map((u) => `${u.name} (${u.count})`)
                .join(" · ")}
            </strong>
            {unmatched.length > 8 ? " …" : ""}
          </Alert>
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Hermanos"
          description={`${rows.length} hermano(s) con asignaciones en reuniones ya pasadas. Resaltado en ámbar: más de ${dias} días desde su última asignación.`}
        />
        <CardBody className="px-0 py-0">
          <AssignmentHistory brothers={rows} dias={dias} />
        </CardBody>
      </Card>

      <p className="mt-4 text-xs text-muted">
        El resaltado indica únicamente que el hermano lleva tiempo sin una
        asignación registrada como realizada. No significa que esté inactivo ni
        supone ningún problema.
      </p>
    </>
  );
}
