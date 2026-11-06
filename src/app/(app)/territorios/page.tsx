// ============================================================================
//  Territorios  (Superintendente de Servicio)
//
//  La lista de los territorios de la congregación, con su mapa y lo que se
//  sabe de cada uno: cuándo se predicó por última vez y cuántas veces.
//  Desde aquí se entra a los mapas, a las estadísticas por mes y al programa
//  de predicación.
// ============================================================================

import { requireSecretary, congregationId } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import {
  estadisticas,
  masOlvidados,
  nombreCompleto,
  siguienteNumero,
  type VezPredicado,
} from "@/lib/territorios";
import { PageHeader } from "@/components/PageHeader";
import { LoadingLinkButton } from "@/components/LoadingLinkButton";
import {
  Card,
  CardHeader,
  CardBody,
  CollapsibleCard,
  StatTile,
  Table,
  Th,
  EmptyState,
  Badge,
  LinkButton,
} from "@/components/ui";
import {
  TerritorioCreateForm,
  TerritoriosEnLote,
} from "@/components/forms/TerritorioCreateForm";
import { TerritorioRow } from "@/components/forms/TerritorioRow";

export default async function TerritoriosPage() {
  const user = await requireSecretary();
  const cong = congregationId(user);

  const [filas, visitas, salidas] = await Promise.all([
    prisma.territory.findMany({
      where: { congregationId: cong },
      orderBy: [{ order: "asc" }, { number: "asc" }],
      select: {
        id: true,
        number: true,
        name: true,
        order: true,
        // Solo el tamaño y la fecha: la imagen del mapa no viaja al listar.
        map: { select: { bytes: true, updatedAt: true } },
      },
    }),
    prisma.territoryVisit.findMany({
      where: { congregationId: cong },
      select: { territoryId: true, date: true },
    }),
    prisma.serviceOuting.findMany({
      where: { congregationId: cong, territoryId: { not: null } },
      select: { territoryId: true, date: true },
    }),
  ]);

  const territorios = filas.map((t) => ({
    id: t.id,
    number: t.number,
    name: t.name,
    order: t.order,
  }));

  // Las dos fuentes cuentan igual: lo anotado a mano y las salidas del
  // programa. No se copian de un lado al otro, se suman aquí.
  const veces: VezPredicado[] = [
    ...visitas.map((v) => ({
      territoryId: v.territoryId,
      date: v.date,
      origen: "manual" as const,
    })),
    ...salidas
      .filter((s): s is { territoryId: string; date: Date } =>
        Boolean(s.territoryId),
      )
      .map((s) => ({
        territoryId: s.territoryId,
        date: s.date,
        origen: "programa" as const,
      })),
  ];

  const hoy = new Date();
  const stats = estadisticas(territorios, veces, hoy);
  const porId = new Map(stats.map((s) => [s.territorio.id, s]));

  const conMapa = filas.filter((t) => t.map).length;
  const nunca = stats.filter((s) => s.ultima === null).length;
  const hace6Meses = stats.filter(
    (s) => s.diasSinPredicar !== null && s.diasSinPredicar >= 180,
  ).length;
  const olvidados = masOlvidados(stats, 5);

  return (
    <>
      <PageHeader
        title="Territorios"
        description="Los territorios de la congregación, sus mapas y cuándo se predicó cada uno."
        action={
          <LoadingLinkButton href="/territorios/programa">
            🗓️ Programa de predicación
          </LoadingLinkButton>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Territorios" value={territorios.length} />
        <StatTile
          label="Con mapa"
          value={conMapa}
          hint={
            territorios.length > 0
              ? `faltan ${territorios.length - conMapa}`
              : undefined
          }
          tone="blue"
        />
        <StatTile
          label="Nunca predicados"
          value={nunca}
          tone={nunca > 0 ? "red" : "green"}
        />
        <StatTile
          label="Sin predicar hace 6 meses o más"
          value={hace6Meses}
          tone={hace6Meses > 0 ? "amber" : "green"}
        />
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <LinkButton href="/territorios/importar" variant="secondary">
          📄 Subir territorios en PDF
        </LinkButton>
        <LinkButton href="/territorios/mapas" variant="secondary">
          🗺️ Mapas de los territorios
        </LinkButton>
        <LinkButton href="/territorios/estadisticas" variant="secondary">
          📈 Estadísticas por mes
        </LinkButton>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Agregar un territorio"
            description="El número y el nombre, como se conoce en la congregación."
          />
          <CardBody>
            <TerritorioCreateForm
              siguienteNumero={siguienteNumero(territorios.map((t) => t.number))}
            />
          </CardBody>
        </Card>

        <CollapsibleCard
          title="Agregar varios de una vez"
          description="Pega la lista completa y se cargan todos juntos."
        >
          <TerritoriosEnLote />
        </CollapsibleCard>

        {olvidados.length > 0 && (nunca > 0 || hace6Meses > 0) ? (
          <Card>
            <CardHeader
              title="Llevan más tiempo sin predicarse"
              description="Los primeros de la lista son los que más falta hace visitar."
            />
            <CardBody>
              <ol className="space-y-2">
                {olvidados.map((s) => (
                  <li
                    key={s.territorio.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
                  >
                    <span className="font-medium text-foreground">
                      {nombreCompleto(s.territorio)}
                    </span>
                    {s.ultima === null ? (
                      <Badge tone="red">Nunca se ha predicado</Badge>
                    ) : (
                      <Badge tone={s.diasSinPredicar! >= 180 ? "red" : "amber"}>
                        {s.diasSinPredicar === 0
                          ? "hoy"
                          : `hace ${
                              s.diasSinPredicar! < 60
                                ? `${s.diasSinPredicar} días`
                                : `${Math.round(s.diasSinPredicar! / 30)} meses`
                            }`}
                      </Badge>
                    )}
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title={`Lista de territorios (${territorios.length})`}
            description="Pulsa el nombre para ver su mapa y lo predicado. Las flechas cambian el orden."
          />
          <CardBody className="px-0 sm:px-6">
            {territorios.length === 0 ? (
              <EmptyState
                title="Todavía no hay territorios"
                description="Sube el PDF de las tarjetas y se cargan solos, o agrégalos a mano aquí arriba."
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th className="w-16">N.º</Th>
                    <Th>Nombre</Th>
                    <Th>Mapa</Th>
                    <Th>Última vez</Th>
                    <Th>Veces</Th>
                    <Th className="text-right">Acciones</Th>
                  </tr>
                </thead>
                <tbody>
                  {territorios.map((t, i) => {
                    const s = porId.get(t.id);
                    const fila = filas[i];
                    return (
                      <TerritorioRow
                        key={t.id}
                        t={{
                          id: t.id,
                          number: t.number,
                          name: t.name,
                          mapaBytes: fila?.map?.bytes ?? null,
                          ultima: s?.ultima ? s.ultima.toISOString() : null,
                          diasSinPredicar: s?.diasSinPredicar ?? null,
                          veces: s?.veces ?? 0,
                          primero: i === 0,
                          ultimo: i === territorios.length - 1,
                        }}
                      />
                    );
                  })}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
