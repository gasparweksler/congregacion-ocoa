// ============================================================================
//  Detalle de un territorio
//
//  Su mapa (que se puede ampliar y cambiar), todas las veces que se predicó
//  —las anotadas a mano y las salidas del programa— y el resumen por mes.
// ============================================================================

import { notFound } from "next/navigation";
import { requireSecretary, congregationId } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { formatDate, toInputDate } from "@/lib/dates";
import {
  claveDeMes,
  diasEntre,
  etiquetaDeMes,
  nombreCompleto,
  turnoLabel,
  ultimosMeses,
} from "@/lib/territorios";
import { PageHeader } from "@/components/PageHeader";
import { BackButton } from "@/components/BackButton";
import {
  Card,
  CardHeader,
  CardBody,
  StatTile,
  Table,
  Th,
  Td,
} from "@/components/ui";
import { MapaTerritorio } from "@/components/forms/MapaTerritorio";
import {
  VisitasTerritorio,
  type VezEnPantalla,
} from "@/components/forms/VisitasTerritorio";

export default async function TerritorioDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireSecretary();
  const cong = congregationId(user);
  const { id } = await params;

  const territorio = await prisma.territory.findFirst({
    where: { id, congregationId: cong },
    select: {
      id: true,
      number: true,
      name: true,
      map: { select: { bytes: true, updatedAt: true, sourcePage: true } },
      visits: {
        orderBy: { date: "desc" },
        select: { id: true, date: true, note: true },
      },
      outings: {
        orderBy: { date: "desc" },
        select: {
          id: true,
          date: true,
          turno: true,
          time: true,
          captainName: true,
        },
      },
    },
  });
  if (!territorio) notFound();

  const titulo = nombreCompleto(territorio);

  // Las dos fuentes, en una sola lista: lo anotado a mano y el programa.
  const veces: VezEnPantalla[] = [
    ...territorio.visits.map((v) => ({
      id: v.id,
      fecha: v.date.toISOString(),
      origen: "manual" as const,
      detalle: v.note,
    })),
    ...territorio.outings.map((s) => ({
      id: null,
      fecha: s.date.toISOString(),
      origen: "programa" as const,
      detalle:
        `${turnoLabel(s.turno)} · ${s.time}` +
        (s.captainName ? ` · ${s.captainName}` : ""),
    })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));

  const hoy = new Date();
  const ultima = veces.length > 0 ? new Date(veces[0].fecha) : null;
  const dias = ultima ? Math.max(0, diasEntre(ultima, hoy)) : null;

  // Resumen de los últimos doce meses.
  const columnas = ultimosMeses(12, hoy);
  const porMes = new Map<string, number>();
  for (const v of veces) {
    const k = claveDeMes(new Date(v.fecha));
    porMes.set(k, (porMes.get(k) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader
        title={titulo}
        description="Mapa, veces que se predicó y resumen por mes."
        action={<BackButton href="/territorios">Volver a Territorios</BackButton>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Veces predicado" value={veces.length} />
        <StatTile
          label="Última vez"
          value={ultima ? formatDate(ultima) : "Nunca"}
          tone={ultima ? "slate" : "red"}
        />
        <StatTile
          label="Sin predicarse"
          value={
            dias === null
              ? "—"
              : dias === 0
                ? "hoy"
                : dias === 1
                  ? "1 día"
                  : `${dias} días`
          }
          tone={dias !== null && dias >= 180 ? "red" : dias !== null && dias >= 90 ? "amber" : "green"}
        />
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Mapa"
            description={
              territorio.map
                ? "Pulsa la imagen para verla en grande."
                : "Sube una imagen o un PDF de una página."
            }
          />
          <CardBody>
            <MapaTerritorio
              territoryId={territorio.id}
              titulo={titulo}
              version={territorio.map?.updatedAt.getTime() ?? null}
              bytes={territorio.map?.bytes ?? null}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={`Veces que se predicó (${veces.length})`}
            description="Las salidas del programa aparecen solas; aquí se anota lo que se hizo fuera del programa."
          />
          <CardBody>
            <VisitasTerritorio
              territoryId={territorio.id}
              hoyISO={toInputDate(hoy)}
              veces={veces}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Últimos doce meses"
            description="Cuántas veces se predicó cada mes."
          />
          <CardBody className="px-0 sm:px-6">
            <Table>
              <thead>
                <tr>
                  <Th>Mes</Th>
                  <Th className="text-right">Veces</Th>
                </tr>
              </thead>
              <tbody>
                {columnas.map((c) => (
                  <tr key={c}>
                    <Td>{etiquetaDeMes(c)}</Td>
                    <Td className="text-right tabular-nums">
                      {porMes.get(c) ? (
                        <span className="font-semibold text-foreground">
                          {porMes.get(c)}
                        </span>
                      ) : (
                        <span className="text-slate-300">·</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
