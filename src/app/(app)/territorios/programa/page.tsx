// ============================================================================
//  Programa de predicación del mes
//
//  Se elige el mes, la modalidad (solo mañana, solo tarde o las dos) y los
//  días, y la pantalla propone las salidas. Cada una lleva fecha, horario,
//  lugar de encuentro, territorio y capitán. Al guardar cuentan para las
//  estadísticas de los territorios, y se puede descargar en PDF con o sin
//  los mapas.
// ============================================================================

import { requireSecretary, congregationId } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parsePeriod } from "@/lib/period";
import { monthName } from "@/lib/constants";
import { congregationLabelOf } from "@/lib/congregation-label";
import {
  estadisticas,
  isoDeFecha,
  masOlvidados,
  TURNOS,
  type SalidaBorrador,
  type Turno,
  type VezPredicado,
  type PlanSemanal,
  PRESET_KINDS,
  PRESET_LISTAS,
  TURNOS_ORDEN,
  planDeFilas,
  planPorDefecto,
} from "@/lib/territorios";
import { deletePresetAction } from "@/server/territorio-actions";
import { PageHeader } from "@/components/PageHeader";
import { BackButton } from "@/components/BackButton";
import { PeriodSelector } from "@/components/PeriodSelector";
import { ConfirmButton } from "@/components/ConfirmButton";
import {
  Card,
  CardHeader,
  CardBody,
  CollapsibleCard,
  Alert,
  Badge,
} from "@/components/ui";
import { ProgramaPredicacion } from "@/components/forms/ProgramaPredicacion";

export default async function ProgramaPredicacionPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; mes?: string }>;
}) {
  const user = await requireSecretary();
  const cong = congregationId(user);
  const { anio: anioParam, mes: mesParam } = await searchParams;
  const { year: anio, month: mes } = parsePeriod(anioParam, mesParam);

  const desde = new Date(anio, mes - 1, 1, 0, 0, 0);
  const hasta = new Date(anio, mes, 1, 0, 0, 0);

  const [
    territorios,
    salidasDelMes,
    presets,
    visitas,
    todasLasSalidas,
    congregacion,
    planFilas,
  ] = await Promise.all([
      prisma.territory.findMany({
        where: { congregationId: cong },
        orderBy: [{ order: "asc" }, { number: "asc" }],
        select: { id: true, number: true, name: true, order: true },
      }),
      prisma.serviceOuting.findMany({
        where: { congregationId: cong, date: { gte: desde, lt: hasta } },
        orderBy: [{ date: "asc" }, { turno: "asc" }],
        select: {
          id: true,
          date: true,
          turno: true,
          time: true,
          place: true,
          captainName: true,
          territoryId: true,
        },
      }),
      // Solo las listas de sugerencias: el plan de la semana vive en una
      // fila aparte y no se enseña como un "guardado" más.
      prisma.servicePreset.findMany({
        where: { congregationId: cong, kind: { in: PRESET_LISTAS } },
        orderBy: { value: "asc" },
        select: { id: true, kind: true, value: true },
      }),
      prisma.territoryVisit.findMany({
        where: { congregationId: cong },
        select: { territoryId: true, date: true },
      }),
      prisma.serviceOuting.findMany({
        where: { congregationId: cong, territoryId: { not: null } },
        select: { territoryId: true, date: true },
      }),
      congregationLabelOf(cong),
      // El plan de la semana: una fila por día.
      prisma.servicePreset.findMany({
        where: { congregationId: cong, kind: PRESET_KINDS.PLAN },
        select: { value: true },
      }),
    ]);

  // Qué territorios conviene proponer primero: los más olvidados.
  const veces: VezPredicado[] = [
    ...visitas.map((v) => ({
      territoryId: v.territoryId,
      date: v.date,
      origen: "manual" as const,
    })),
    ...todasLasSalidas
      .filter((s): s is { territoryId: string; date: Date } => Boolean(s.territoryId))
      .map((s) => ({
        territoryId: s.territoryId,
        date: s.date,
        origen: "programa" as const,
      })),
  ];
  const stats = estadisticas(territorios, veces, new Date());
  const sugeridos = masOlvidados(stats, territorios.length).map(
    (s) => s.territorio.id,
  );

  const guardadas: SalidaBorrador[] = salidasDelMes.map((s) => ({
    key: s.id,
    iso: isoDeFecha(s.date),
    turno: (s.turno === TURNOS.TARDE ? TURNOS.TARDE : TURNOS.MANANA) as Turno,
    time: s.time,
    place: s.place,
    territoryId: s.territoryId ?? "",
    captainName: s.captainName,
  }));

  const capitanes = presets
    .filter((p) => p.kind === PRESET_KINDS.CAPITAN)
    .map((p) => p.value);
  const lugares = presets
    .filter((p) => p.kind === PRESET_KINDS.LUGAR)
    .map((p) => p.value);

  // El plan de la semana que se usó la última vez. Si no hay ninguno (o el
  // guardado ya no se entiende), se propone el de siempre: sábado y domingo
  // por la mañana. Un territorio fijo que ya no existe se deja en blanco.
  const guardado = planDeFilas(planFilas.map((f) => f.value));
  const idsValidos = new Set(territorios.map((t) => t.id));
  const planInicial: PlanSemanal = (
    guardado ?? planPorDefecto(lugares[0] ?? "Salón del Reino")
  ).map((dia) => {
    const copia = { ...dia };
    for (const turno of TURNOS_ORDEN) {
      copia[turno] = {
        ...dia[turno],
        territoryId: idsValidos.has(dia[turno].territoryId)
          ? dia[turno].territoryId
          : "",
      };
    }
    return copia;
  });

  return (
    <>
      <PageHeader
        title="Programa de predicación"
        description="Las salidas del mes: fecha, horario, lugar de encuentro, territorio y capitán."
        action={<BackButton href="/territorios">Volver a Territorios</BackButton>}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <PeriodSelector year={anio} month={mes} />
        {guardadas.length > 0 ? (
          <Badge tone="green">
            {guardadas.length === 1
              ? "1 salida guardada"
              : `${guardadas.length} salidas guardadas`}
          </Badge>
        ) : (
          <Badge tone="slate">Este mes no tiene programa todavía</Badge>
        )}
      </div>

      <div className="space-y-6">
        {territorios.length === 0 ? (
          <Alert tone="warning">
            Todavía no hay territorios cargados. Puedes armar el programa igual,
            pero las salidas quedarán sin territorio y no contarán para las
            estadísticas.
          </Alert>
        ) : null}

        <Card>
          <CardHeader
            title={`Salidas de ${monthName(mes)} de ${anio}`}
            description="Se guarda el mes completo: lo que quites también se quita al guardar."
          />
          <CardBody>
            {/* La llave fuerza empezar de nuevo al cambiar de mes: si no, se
                quedaría en pantalla el programa del mes anterior. */}
            <ProgramaPredicacion
              key={`${anio}-${mes}`}
              anio={anio}
              mes={mes}
              territorios={territorios}
              sugeridos={sugeridos}
              capitanes={capitanes}
              lugares={lugares}
              salidasGuardadas={guardadas}
              planInicial={planInicial}
              congregacion={congregacion}
            />
          </CardBody>
        </Card>

        <CollapsibleCard
          title={`Capitanes y lugares guardados (${presets.length})`}
          description="Se guardan solos al guardar un programa, para elegirlos rápido después."
        >
          {presets.length === 0 ? (
            <p className="text-sm text-muted">
              Todavía no hay ninguno. Al guardar el primer programa, los
              capitanes y los lugares que escribas quedan aquí y luego aparecen
              como sugerencia al escribir.
            </p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              {[
                { kind: PRESET_KINDS.CAPITAN, titulo: "Capitanes" },
                { kind: PRESET_KINDS.LUGAR, titulo: "Lugares de encuentro" },
              ].map(({ kind, titulo }) => {
                const lista = presets.filter((p) => p.kind === kind);
                return (
                  <div key={kind}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
                      {titulo} ({lista.length})
                    </p>
                    {lista.length === 0 ? (
                      <p className="text-sm text-muted">Ninguno todavía.</p>
                    ) : (
                      <ul className="divide-y divide-border rounded-xl border border-border">
                        {lista.map((p) => (
                          <li
                            key={p.id}
                            className="flex items-center justify-between gap-2 px-3 py-2"
                          >
                            <span className="min-w-0 truncate text-sm text-foreground">
                              {p.value}
                            </span>
                            <ConfirmButton
                              action={deletePresetAction}
                              hidden={{ id: p.id }}
                              confirmText={`¿Quitar "${p.value}" de los guardados? No cambia ningún programa ya guardado.`}
                            >
                              Quitar
                            </ConfirmButton>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CollapsibleCard>
      </div>
    </>
  );
}
