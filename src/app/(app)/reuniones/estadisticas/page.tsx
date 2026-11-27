// ============================================================================
//  Estadísticas de Asignaciones
//  Historial completo de asignaciones de la congregación, con filtros y aviso
//  por hermanos que llevan tiempo sin que les TOQUE una asignación.
//
//  Todo lo que se cuenta aquí mira la ASIGNACIÓN, nunca la respuesta: una
//  asignación cuenta desde que el hermano está en el programa de una reunión
//  ya celebrada, la haya confirmado, rechazada o no haya contestado. La
//  confirmación se sigue guardando y se ve en el detalle de cada
//  participación, pero no cambia ninguna cifra.
// ============================================================================

import { requireMeetingsAccess, congregationId } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/PageHeader";
import { Card, CollapsibleCard } from "@/components/ui";
import { BackButton } from "@/components/BackButton";
import { AssignmentStatsFilters } from "@/components/forms/AssignmentStatsFilters";
import {
  AssignmentHistory,
  type BrotherRow,
} from "@/components/AssignmentHistory";
import { WithoutAssignmentTile } from "@/components/WithoutAssignmentTile";
import { AsignacionesLineChart } from "@/components/charts/AsignacionesLineChart";
import { desdeDelGrafico, serieMensual } from "@/lib/assignment-series";
import { getAssignmentStats } from "@/server/assignment-stats-actions";
import { NombresSinEmparejar } from "@/components/NombresSinEmparejar";
import {
  deleteUnmatchedNameAction,
  mergeUnmatchedNameAction,
} from "@/server/assignment-names-actions";

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
  const user = await requireMeetingsAccess();
  const cong = congregationId(user);
  const sp = await searchParams;

  const dias = Math.min(3650, Math.max(1, Number(sp.dias) || 90));
  const incluirResponsabilidades = sp.resp === "1";

  // Si hay algún filtro puesto, la tarjeta se abre sola: si no, se perdería de
  // vista por qué la lista de abajo está recortada.
  const hayFiltros =
    !!sp.q || !!sp.section || !!sp.desde || !!sp.hasta || incluirResponsabilidades || dias !== 90;

  // El gráfico va aparte: es del PERÍODO, no de la búsqueda. Solo lo
  // delimitan "Desde" y "Hasta" y, si no se ponen, el tramo de "Avisar tras …
  // días" (en meses enteros). Buscar a un hermano o elegir un tipo de
  // asignación recorta los recuadros y la lista, pero no la línea.
  const desdeGrafico = sp.desde || desdeDelGrafico(dias);

  const [
    { brothers, neverAssigned, unmatched, sections, totals },
    { brothers: hermanosDelGrafico },
  ] = await Promise.all([
    getAssignmentStats({
      q: sp.q,
      section: sp.section,
      desde: sp.desde,
      hasta: sp.hasta,
      incluirResponsabilidades,
    }),
    getAssignmentStats({ desde: desdeGrafico, hasta: sp.hasta }),
  ]);

  // Para poder fusionar un nombre suelto con el hermano que de verdad es:
  // la lista de hermanos inscritos, que es la que se ofrece en el selector.
  const hermanosInscritos =
    unmatched.length > 0
      ? (
          await prisma.publisher.findMany({
            where: { congregationId: cong },
            orderBy: { fullName: "asc" },
            select: {
              id: true,
              fullName: true,
              group: { select: { name: true } },
            },
          })
        ).map((p) => ({
          id: p.id,
          fullName: p.fullName,
          groupName: p.group?.name ?? null,
        }))
      : [];

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
  // Asignaciones contadas, sin mirar si el hermano respondió.
  const asignaciones = totals.participations;
  const promedio =
    rows.length > 0 ? Math.round((asignaciones / rows.length) * 10) / 10 : 0;

  // La serie sale de su propia consulta, la del período entero.
  const serie = serieMensual(
    hermanosDelGrafico.map((b) => ({
      name: b.name,
      participations: b.participations.map((p) => ({
        date: p.date.toISOString(),
        done: p.done,
      })),
    })),
  );

  return (
    <>
      <PageHeader
        title="Estadísticas de Asignaciones"
        description="Cuántas veces le ha tocado a cada hermano, haya confirmado, rechazado o no haya contestado, y aviso por tiempo sin participar."
        action={<BackButton href="/reuniones" />}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card className="p-4">
          {/* Todas: confirmadas, rechazadas y sin contestar cuentan igual. */}
          <p className="text-sm text-muted">Asignaciones</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-primary">
            {asignaciones}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Haya confirmado o no el hermano
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">Hermanos asignados</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-700">
            {rows.length}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {rows.length > 0 ? `${promedio} asignación(es) de media` : "—"}
          </p>
        </Card>
        <WithoutAssignmentTile
          dias={dias}
          conAviso={avisados}
          sinParticipacion={sinParticipacion}
        />
        <Card className="p-4">
          {/* Publicadores activos que no aparecen en ningún programa. */}
          <p className="text-sm text-muted">Sin ninguna asignación</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-700">
            {sinParticipacion.length}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Publicadores activos, en el período mirado
          </p>
        </Card>
      </div>

      <CollapsibleCard
        className="mb-6"
        defaultOpen={hayFiltros}
        title={hayFiltros ? "Filtros (activos)" : "Filtros"}
        description={
          totals.primeraReunion && totals.ultimaReunion
            ? `Historial disponible: ${totals.meetings} reunión(es), de ${formatDate(totals.primeraReunion)} a ${formatDate(totals.ultimaReunion)}.`
            : "Todavía no hay reuniones registradas."
        }
      >
        <AssignmentStatsFilters
          sections={sections}
          incluirResponsabilidades={incluirResponsabilidades}
        />
      </CollapsibleCard>

      {unmatched.length > 0 ? (
        <CollapsibleCard
          className="mb-6"
          defaultOpen
          title={`Nombres que no coinciden (${unmatched.length})`}
          description="Están escritos en alguna asignación pero no son ningún hermano inscrito, así que cuentan aparte en vez de atribuirse a alguien por parecido. Aquí se pueden quitar del historial o fusionar con el hermano que de verdad son."
          bodyClassName="px-0 py-0"
        >
          <NombresSinEmparejar
            nombres={unmatched}
            hermanos={hermanosInscritos}
            eliminarAction={deleteUnmatchedNameAction}
            fusionarAction={mergeUnmatchedNameAction}
          />
        </CollapsibleCard>
      ) : null}

      {/* --- El gráfico ------------------------------------------------
          Va antes del detalle a propósito: primero la forma del año, y
          después los nombres. Sale de las mismas participaciones ya
          filtradas que la lista de abajo, así que los dos cuentan lo
          mismo y cambian juntos al tocar un filtro. */}
      <Card className="mb-6 p-5">
        <h2 className="text-base font-semibold text-foreground">
          Asignaciones mes a mes
        </h2>
        <p className="mt-0.5 text-sm text-muted">
          {serie.length > 0
            ? `${serie.length} mes(es), de ${serie[0].etiquetaLarga} a ${serie[serie.length - 1].etiquetaLarga}. Pasa el dedo o el ratón por un mes para ver sus cifras.`
            : "Cuando haya asignaciones en reuniones ya pasadas, aquí se verá cómo se reparten mes a mes."}
        </p>
        <p className="mt-0.5 mb-4 text-xs text-muted">
          {sp.desde || sp.hasta
            ? "Toda la congregación entre las fechas puestas. Buscar un hermano, elegir un tipo de asignación o incluir las responsabilidades cambia los recuadros y la lista, pero no esta línea."
            : `Toda la congregación en los últimos ${dias} días, en meses enteros. Solo lo cambian «Desde», «Hasta» y «Avisar tras … días sin asignación».`}
        </p>
        {serie.length > 0 ? (
          <AsignacionesLineChart data={serie} />
        ) : (
          <p className="py-8 text-center text-sm text-muted">
            No hay ninguna asignación en ese período.
          </p>
        )}
      </Card>

      {/* Plegada de entrada: son muchos nombres y, abiertos siempre, tapaban
          los recuadros de arriba, que es lo que se mira primero. */}
      <CollapsibleCard
        title="Detalle por hermanos"
        description={`${rows.length} hermano(s) con asignaciones en reuniones ya pasadas. Resaltado en ámbar: más de ${dias} días desde su última asignación.`}
        bodyClassName="px-0 py-0"
      >
        <AssignmentHistory brothers={rows} dias={dias} />
      </CollapsibleCard>

      <p className="mt-4 text-xs text-muted">
        Cada asignación cuenta desde que el hermano aparece en el programa de
        una reunión ya celebrada: confirmarla o rechazarla no cambia ninguna
        cifra de esta pantalla. El resaltado indica únicamente que no le ha
        tocado ninguna asignación en ese tiempo; no significa que esté inactivo
        ni supone ningún problema.
      </p>
    </>
  );
}
