// ============================================================================
//  Estadísticas de predicación por territorio
//
//  Una tabla con los territorios en las filas y los meses en las columnas:
//  de un vistazo se ve cuántas veces se predicó cada uno y cuándo fue la
//  última. Cuentan igual las veces anotadas a mano y las salidas del programa.
// ============================================================================

import Link from "next/link";
import { requireSecretary, congregationId } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import {
  estadisticas,
  etiquetaDeMes,
  nombreCompleto,
  ultimosMeses,
  type VezPredicado,
} from "@/lib/territorios";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/PageHeader";
import { BackButton } from "@/components/BackButton";
import {
  Card,
  CardHeader,
  CardBody,
  Table,
  Th,
  Td,
  Badge,
  EmptyState,
  StatTile,
} from "@/components/ui";

const OPCIONES_MESES = [6, 12, 24];

export default async function EstadisticasTerritoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ meses?: string }>;
}) {
  const user = await requireSecretary();
  const cong = congregationId(user);
  const { meses: mesesParam } = await searchParams;

  const cuantosMeses = OPCIONES_MESES.includes(Number(mesesParam))
    ? Number(mesesParam)
    : 12;

  const hoy = new Date();
  // Solo se consulta desde el primer día del mes más antiguo que se enseña.
  const desde = new Date(
    hoy.getFullYear(),
    hoy.getMonth() - (cuantosMeses - 1),
    1,
    0,
    0,
    0,
  );

  const [territorios, visitas, salidas] = await Promise.all([
    prisma.territory.findMany({
      where: { congregationId: cong },
      orderBy: [{ order: "asc" }, { number: "asc" }],
      select: { id: true, number: true, name: true, order: true },
    }),
    prisma.territoryVisit.findMany({
      where: { congregationId: cong, date: { gte: desde } },
      select: { territoryId: true, date: true },
    }),
    prisma.serviceOuting.findMany({
      where: {
        congregationId: cong,
        territoryId: { not: null },
        date: { gte: desde },
      },
      select: { territoryId: true, date: true },
    }),
  ]);

  // Para "la última vez" hace falta mirar más atrás del período enseñado:
  // un territorio puede llevar dos años sin predicarse.
  const [ultimasManual, ultimasPrograma] = await Promise.all([
    prisma.territoryVisit.groupBy({
      by: ["territoryId"],
      where: { congregationId: cong },
      _max: { date: true },
    }),
    prisma.serviceOuting.groupBy({
      by: ["territoryId"],
      where: { congregationId: cong, territoryId: { not: null } },
      _max: { date: true },
    }),
  ]);

  const ultimaDe = new Map<string, Date>();
  for (const g of [...ultimasManual, ...ultimasPrograma]) {
    if (!g.territoryId || !g._max.date) continue;
    const previa = ultimaDe.get(g.territoryId);
    if (!previa || g._max.date > previa) ultimaDe.set(g.territoryId, g._max.date);
  }

  const veces: VezPredicado[] = [
    ...visitas.map((v) => ({
      territoryId: v.territoryId,
      date: v.date,
      origen: "manual" as const,
    })),
    ...salidas
      .filter((s): s is { territoryId: string; date: Date } => Boolean(s.territoryId))
      .map((s) => ({
        territoryId: s.territoryId,
        date: s.date,
        origen: "programa" as const,
      })),
  ];

  const stats = estadisticas(territorios, veces, hoy);
  const columnas = ultimosMeses(cuantosMeses, hoy).reverse(); // del más viejo al más nuevo
  const totalVeces = veces.length;
  const sinNada = stats.filter((s) => s.veces === 0).length;

  return (
    <>
      <PageHeader
        title="Estadísticas por mes"
        description="Cuántas veces se predicó cada territorio, mes a mes."
        action={<BackButton href="/territorios">Volver a Territorios</BackButton>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile
          label={`Veces predicado (${cuantosMeses} meses)`}
          value={totalVeces}
        />
        <StatTile label="Territorios" value={territorios.length} />
        <StatTile
          label="Sin predicar en el período"
          value={sinNada}
          tone={sinNada > 0 ? "amber" : "green"}
        />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Período:</span>
        {OPCIONES_MESES.map((n) => (
          <Link
            key={n}
            href={`/territorios/estadisticas?meses=${n}`}
            className={
              n === cuantosMeses
                ? "rounded-[10px] bg-primary px-3 py-1.5 text-sm font-semibold text-white"
                : "rounded-[10px] border border-border bg-white px-3 py-1.5 text-sm font-medium text-foreground hover:bg-slate-50"
            }
          >
            {n} meses
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Territorios por mes"
          description="Cada casilla es la cantidad de veces que se predicó ese territorio ese mes."
        />
        <CardBody className="px-0 sm:px-6">
          {territorios.length === 0 ? (
            <EmptyState
              title="Todavía no hay territorios"
              description="Agrégalos en la pantalla de Territorios y vuelve aquí."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Territorio</Th>
                  {columnas.map((c) => (
                    <Th key={c} className="text-center">
                      {etiquetaDeMes(c).replace(" ", " ")}
                    </Th>
                  ))}
                  <Th className="text-center">Total</Th>
                  <Th>Última vez</Th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => {
                  const ultima = ultimaDe.get(s.territorio.id) ?? null;
                  return (
                    <tr key={s.territorio.id}>
                      <Td className="whitespace-nowrap font-medium">
                        <Link
                          href={`/territorios/${s.territorio.id}`}
                          className="text-foreground underline-offset-2 hover:text-primary hover:underline"
                        >
                          {nombreCompleto(s.territorio)}
                        </Link>
                      </Td>
                      {columnas.map((c) => {
                        const n = s.porMes[c] ?? 0;
                        return (
                          <Td key={c} className="text-center tabular-nums">
                            {n === 0 ? (
                              <span className="text-slate-300">·</span>
                            ) : (
                              <span className="font-semibold text-foreground">
                                {n}
                              </span>
                            )}
                          </Td>
                        );
                      })}
                      <Td className="text-center tabular-nums font-semibold">
                        {s.veces}
                      </Td>
                      <Td className="whitespace-nowrap">
                        {ultima ? (
                          formatDate(ultima)
                        ) : (
                          <Badge tone="red">Nunca</Badge>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </>
  );
}
