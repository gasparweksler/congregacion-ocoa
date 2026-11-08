// ============================================================================
//  Estadísticas de Predicación: la vista
//
//  Todo lo que la congregación ha predicado, en una sola pantalla:
//
//   · el historial de programas, para volver a bajar cualquiera en PDF o
//     borrar los que ya no hagan falta;
//   · cuántas veces se trabajó cada territorio y cuándo fue la última;
//   · los más trabajados, los menos trabajados y los que llevan más tiempo
//     sin predicarse, con un gráfico de barras para verlo de un golpe.
//
//  Todo sale de la base: las salidas guardadas de los programas
//  (ServiceOuting) y las veces anotadas a mano (TerritoryVisit). No hay
//  números inventados ni copias por usuario: dos personas con el permiso
//  "Sup. de Servicio - Territorios" ven exactamente lo mismo, y lo que una
//  borra desaparece para la otra.
// ============================================================================

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  diasEntre,
  estadisticas,
  etiquetaDeMes,
  historialDeProgramas,
  masOlvidados,
  nombreCompleto,
  ultimosMeses,
  type EstadisticaTerritorio,
  type VezPredicado,
} from "@/lib/territorios";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/PageHeader";
import { BackButton } from "@/components/BackButton";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  CollapsibleCard,
  EmptyState,
  StatTile,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { HistorialProgramas } from "@/components/forms/HistorialProgramas";
import { TerritoriosFrecuenciaChart } from "@/components/charts/TerritoriosChart";

const OPCIONES_MESES = [6, 12, 24];

/**
 * A partir de cuántos días se avisa de que un territorio lleva mucho sin
 * predicarse. Cuatro meses: con una veintena de territorios y las salidas de
 * un mes normal, a cada uno le toca cada dos meses más o menos, así que el
 * doble de eso ya es para mirarlo.
 */
const DIAS_OLVIDADO = 120;

/** Cómo está un territorio, para pintarlo igual en el gráfico y en las listas. */
function estadoDe(s: EstadisticaTerritorio): "nunca" | "olvidado" | "al-dia" {
  if (s.ultima === null) return "nunca";
  if ((s.diasSinPredicar ?? 0) > DIAS_OLVIDADO) return "olvidado";
  return "al-dia";
}

export async function EstadisticasDePredicacion({
  cong,
  mesesParam,
}: {
  /** La congregación de la que se cuentan los programas. */
  cong: string;
  /** Cuántos meses enseña la tabla del final (6, 12 o 24). */
  mesesParam?: string;
}) {

  const cuantosMeses = OPCIONES_MESES.includes(Number(mesesParam))
    ? Number(mesesParam)
    : 12;

  const hoy = new Date();

  // Todo el historial de la congregación. Las estadísticas de "cuántas veces"
  // y "cuánto lleva sin predicarse" no tienen sentido recortadas a un año:
  // justo los territorios olvidados son los que no aparecerían.
  const [territorios, salidas, visitas] = await Promise.all([
    prisma.territory.findMany({
      where: { congregationId: cong },
      orderBy: [{ order: "asc" }, { number: "asc" }],
      select: { id: true, number: true, name: true, order: true },
    }),
    prisma.serviceOuting.findMany({
      where: { congregationId: cong },
      orderBy: { date: "asc" },
      select: { date: true, territoryId: true, groups: true },
    }),
    prisma.territoryVisit.findMany({
      where: { congregationId: cong },
      select: { territoryId: true, date: true },
    }),
  ]);

  // --- Las veces que se predicó cada territorio ----------------------------
  // Cuentan igual las salidas de los programas y las anotadas a mano.
  const veces: VezPredicado[] = [
    ...visitas.map((v) => ({
      territoryId: v.territoryId,
      date: v.date,
      origen: "manual" as const,
    })),
    ...salidas
      .filter((s): s is { date: Date; territoryId: string; groups: string } =>
        Boolean(s.territoryId),
      )
      .map((s) => ({
        territoryId: s.territoryId,
        date: s.date,
        origen: "programa" as const,
      })),
  ];

  const stats = estadisticas(territorios, veces, hoy);

  // --- El historial: un programa es el mes entero de salidas ---------------
  const programas = historialDeProgramas(salidas);

  // --- Los números de arriba ----------------------------------------------
  const conAlguna = stats.filter((s) => s.veces > 0);
  const nunca = stats.filter((s) => s.ultima === null);
  const olvidados = stats.filter((s) => estadoDe(s) === "olvidado");
  const esperaMedia =
    conAlguna.length > 0
      ? Math.round(
          conAlguna.reduce((suma, s) => suma + (s.diasSinPredicar ?? 0), 0) /
            conAlguna.length,
        )
      : null;

  // --- Las listas ordenadas por frecuencia --------------------------------
  const porFrecuencia = [...stats].sort(
    (a, b) => b.veces - a.veces || a.territorio.number - b.territorio.number,
  );
  const masTrabajados = porFrecuencia.filter((s) => s.veces > 0).slice(0, 5);
  // Entre dos que salieron las mismas veces, primero el de número más bajo:
  // así la lista no cambia de orden sola y se lee igual cada mes.
  const menosTrabajados = [...stats]
    .sort((a, b) => a.veces - b.veces || a.territorio.number - b.territorio.number)
    .slice(0, 5);
  const esperando = masOlvidados(stats, 5);

  const barras = porFrecuencia.map((s) => ({
    nombre: nombreCompleto(s.territorio),
    veces: s.veces,
    estado: estadoDe(s),
  }));

  // --- La tabla mes a mes (el detalle, para quien lo quiera) --------------
  const columnas = ultimosMeses(cuantosMeses, hoy).reverse();

  return (
    <>
      <PageHeader
        title="Estadísticas de Predicación"
        description="El historial de programas y cuánto se trabajó cada territorio. Todo sale de los programas guardados: es la misma información para todos los que tienen el permiso."
        action={<BackButton href="/territorios">Volver a Territorios</BackButton>}
      />

      {territorios.length === 0 ? (
        <Alert tone="warning">
          Todavía no hay territorios cargados, así que no hay nada que contar.
          Agrégalos en la pantalla de Territorios y vuelve aquí.
        </Alert>
      ) : (
        <div className="space-y-6">
          {/* --- 1. Los totales, de un vistazo -------------------------- */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile
              label="Programas guardados"
              value={programas.length}
              hint={
                programas.length > 0
                  ? `El último, ${programas[0].etiqueta}`
                  : "Ninguno todavía"
              }
            />
            <StatTile
              label="Veces que se predicó"
              value={veces.length}
              hint="Sumando todos los programas"
              tone="blue"
            />
            <StatTile label="Territorios" value={territorios.length} />
            <StatTile
              label="Nunca predicados"
              value={nunca.length}
              tone={nunca.length > 0 ? "red" : "green"}
              hint={
                nunca.length > 0
                  ? "No aparecen en ningún programa"
                  : "Todos salieron al menos una vez"
              }
            />
            <StatTile
              label={`Más de ${DIAS_OLVIDADO} días sin predicarse`}
              value={olvidados.length}
              tone={olvidados.length > 0 ? "amber" : "green"}
              hint={
                esperaMedia === null
                  ? undefined
                  : `De media, ${esperaMedia} ${esperaMedia === 1 ? "día" : "días"} desde la última vez`
              }
            />
          </div>

          {/* --- 2. El gráfico ------------------------------------------ */}
          <Card>
            <CardHeader
              title="Cuántas veces se trabajó cada territorio"
              description="Una barra por territorio, de más trabajado a menos. Así se ve enseguida cuáles se repiten y cuáles se quedan atrás."
            />
            <CardBody className="space-y-3">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#4f46e5]" />
                  Al día
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#f59e0b]" />
                  Lleva más de {DIAS_OLVIDADO} días
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#dc2626]" />
                  Nunca se predicó
                </span>
              </div>
              {veces.length === 0 ? (
                <EmptyState
                  title="Todavía no hay nada predicado"
                  description="Cuando guardes el primer programa, aquí se verá cuántas veces salió cada territorio."
                />
              ) : (
                <TerritoriosFrecuenciaChart data={barras} />
              )}
            </CardBody>
          </Card>

          {/* --- 3. Las tres listas ------------------------------------- */}
          <div className="grid gap-4 lg:grid-cols-3">
            <ListaTerritorios
              titulo="Los más trabajados"
              descripcion="Los que más veces salieron en los programas."
              vacio="Todavía no se predicó ninguno."
              items={masTrabajados}
              hoy={hoy}
              modo="veces"
            />
            <ListaTerritorios
              titulo="Los menos trabajados"
              descripcion="Los que menos veces salieron. Conviene tenerlos a mano al armar el programa."
              vacio="Todavía no hay territorios."
              items={menosTrabajados}
              hoy={hoy}
              modo="veces"
            />
            <ListaTerritorios
              titulo="Más tiempo sin predicarse"
              descripcion="Empezando por los que no salieron nunca."
              vacio="Todavía no hay territorios."
              items={esperando}
              hoy={hoy}
              modo="espera"
            />
          </div>

          {/* --- 4. El historial de programas --------------------------- */}
          <HistorialProgramas programas={programas} />

          {/* --- 5. El detalle mes a mes -------------------------------- */}
          <CollapsibleCard
            title="Detalle mes a mes"
            description="La tabla de siempre: cada casilla es cuántas veces se predicó ese territorio ese mes."
          >
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted">Enseñar:</span>
              {OPCIONES_MESES.map((n) => (
                <Link
                  key={n}
                  href={`/territorios/estadisticas?meses=${n}`}
                  scroll={false}
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

            <Table>
              <thead>
                <tr>
                  <Th>Territorio</Th>
                  {columnas.map((c) => (
                    <Th key={c} className="text-center">
                      {etiquetaDeMes(c)}
                    </Th>
                  ))}
                  <Th className="text-center">Total</Th>
                  <Th>Última vez</Th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
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
                    <Td className="text-center font-semibold tabular-nums">
                      {s.veces}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {s.ultima ? (
                        formatDate(s.ultima)
                      ) : (
                        <Badge tone="red">Nunca</Badge>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <p className="mt-3 text-xs text-muted">
              La columna «Total» cuenta todo el historial, no solo los meses
              que se están enseñando.
            </p>
          </CollapsibleCard>
        </div>
      )}
    </>
  );
}

/**
 * Una de las tres listas: el territorio, su número y lo que toca destacar
 * (las veces, o cuánto lleva esperando).
 *
 * Sin tabla a propósito: en un teléfono una lista se lee sin mover nada a los
 * lados, y aquí solo hay dos datos por fila.
 */
function ListaTerritorios({
  titulo,
  descripcion,
  vacio,
  items,
  hoy,
  modo,
}: {
  titulo: string;
  descripcion: string;
  vacio: string;
  items: EstadisticaTerritorio[];
  hoy: Date;
  modo: "veces" | "espera";
}) {
  return (
    <Card>
      <CardHeader title={titulo} description={descripcion} />
      <CardBody>
        {items.length === 0 ? (
          <p className="text-sm text-muted">{vacio}</p>
        ) : (
          <ol className="space-y-2">
            {items.map((s, i) => {
              const estado = estadoDe(s);
              const dias =
                s.ultima === null ? null : Math.max(0, diasEntre(s.ultima, hoy));
              return (
                <li
                  key={s.territorio.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <Link
                      href={`/territorios/${s.territorio.id}`}
                      className="block truncate text-sm font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
                    >
                      {nombreCompleto(s.territorio)}
                    </Link>
                    <span className="block text-xs text-muted">
                      {s.ultima
                        ? `Última vez: ${formatDate(s.ultima)}`
                        : "Nunca se predicó"}
                    </span>
                  </span>
                  <span className="shrink-0">
                    {modo === "veces" ? (
                      <Badge
                        tone={
                          s.veces === 0
                            ? "red"
                            : estado === "olvidado"
                              ? "amber"
                              : "blue"
                        }
                      >
                        {s.veces} {s.veces === 1 ? "vez" : "veces"}
                      </Badge>
                    ) : (
                      <Badge tone={dias === null ? "red" : "amber"}>
                        {dias === null
                          ? "Nunca"
                          : `${dias} ${dias === 1 ? "día" : "días"}`}
                      </Badge>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
