// ============================================================================
//  Mapas de los territorios
//
//  Se sube UN PDF con los mapas de todos: el navegador lo separa por páginas,
//  dibuja cada una y las reparte en orden entre los territorios. Lo que no
//  calce se corrige a mano antes de guardar.
// ============================================================================

import Link from "next/link";
import { requireServiceAccess, congregationId } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { nombreCompleto, tamanoLegible } from "@/lib/territorios";
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
import { MapasPdf } from "@/components/forms/MapasPdf";

export default async function MapasPage() {
  const user = await requireServiceAccess();
  const cong = congregationId(user);

  const filas = await prisma.territory.findMany({
    where: { congregationId: cong },
    orderBy: [{ order: "asc" }, { number: "asc" }],
    select: {
      id: true,
      number: true,
      name: true,
      order: true,
      map: { select: { bytes: true, updatedAt: true, sourcePage: true } },
    },
  });

  const territorios = filas.map((t) => ({
    id: t.id,
    number: t.number,
    name: t.name,
    order: t.order,
  }));
  const conMapa = filas.filter((t) => t.map);
  const ocupado = conMapa.reduce((n, t) => n + (t.map?.bytes ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Mapas de los territorios"
        description="Sube el PDF con todos los mapas y se reparten solos, uno por territorio."
        action={<BackButton href="/territorios">Volver a Territorios</BackButton>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Territorios" value={territorios.length} />
        <StatTile label="Con mapa" value={conMapa.length} tone="blue" />
        <StatTile
          label="Ocupan en total"
          value={tamanoLegible(ocupado)}
          hint="los mapas guardados"
        />
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Subir el PDF de los mapas"
            description="Una página por territorio, en el mismo orden de la lista."
          />
          <CardBody>
            <MapasPdf territorios={territorios} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Cómo funciona"
            description="Para que no haya sorpresas."
          />
          <CardBody className="space-y-2 text-sm text-foreground">
            <p>
              El PDF <strong>no se guarda en ninguna parte</strong>: se lee en
              tu navegador, que dibuja cada página y sube solo la imagen, ya
              reducida. Por eso puede tardar un momento si trae muchas páginas.
            </p>
            <p>
              El reparto automático es <strong>por orden</strong>: la página 1
              al primer territorio de la lista, la 2 al segundo, y así. Si tu
              PDF viene en otro orden, cámbialo en el desplegable de cada
              página antes de guardar.
            </p>
            <p className="text-muted">
              También puedes subir o cambiar el mapa de un territorio por
              separado: entra a su detalle desde la lista.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Mapas guardados"
            description="Qué territorios ya tienen su mapa."
          />
          <CardBody className="px-0 sm:px-6">
            {territorios.length === 0 ? (
              <EmptyState
                title="Todavía no hay territorios"
                description="Agrégalos primero en la pantalla de Territorios."
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Territorio</Th>
                    <Th>Mapa</Th>
                    <Th>Tamaño</Th>
                    <Th>Guardado</Th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((t) => (
                    <tr key={t.id}>
                      <Td className="font-medium">
                        <Link
                          href={`/territorios/${t.id}`}
                          className="text-foreground underline-offset-2 hover:text-primary hover:underline"
                        >
                          {nombreCompleto(t)}
                        </Link>
                      </Td>
                      <Td>
                        {t.map ? (
                          <Badge tone="green">Sí</Badge>
                        ) : (
                          <Badge tone="slate">Sin mapa</Badge>
                        )}
                      </Td>
                      <Td className="text-muted">
                        {t.map ? tamanoLegible(t.map.bytes) : "—"}
                      </Td>
                      <Td className="text-muted">
                        {t.map ? (
                          <>
                            {formatDate(t.map.updatedAt)}
                            {t.map.sourcePage
                              ? ` · página ${t.map.sourcePage} del PDF`
                              : ""}
                          </>
                        ) : (
                          "—"
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
