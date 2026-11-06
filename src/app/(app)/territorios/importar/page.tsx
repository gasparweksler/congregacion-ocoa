// ============================================================================
//  Subir territorios en PDF
//
//  Se sube el PDF de las tarjetas de territorio y la pantalla lo analiza:
//  saca el número y el nombre de cada tarjeta, los muestra para revisarlos y
//  crea los territorios de una vez. Si cada tarjeta ocupa una página, esa
//  misma página se puede guardar como el mapa del territorio.
// ============================================================================

import { requireSecretary, congregationId } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import { BackButton } from "@/components/BackButton";
import { Card, CardHeader, CardBody, StatTile } from "@/components/ui";
import { ImportarTarjetasPdf } from "@/components/forms/ImportarTarjetasPdf";

export default async function ImportarTerritoriosPage() {
  const user = await requireSecretary();
  const cong = congregationId(user);

  const filas = await prisma.territory.findMany({
    where: { congregationId: cong },
    orderBy: [{ order: "asc" }, { number: "asc" }],
    select: { number: true, name: true, map: { select: { bytes: true } } },
  });

  const existentes = filas.map((t) => ({ numero: t.number, nombre: t.name }));
  const conMapa = filas.filter((t) => t.map).length;

  return (
    <>
      <PageHeader
        title="Subir territorios en PDF"
        description="El PDF de las tarjetas se lee solo: de cada tarjeta salen el número y el nombre."
        action={<BackButton href="/territorios">Volver a Territorios</BackButton>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Territorios cargados" value={filas.length} />
        <StatTile label="Con mapa" value={conMapa} tone="blue" />
        <StatTile
          label="Máximo por PDF"
          value={300}
          hint="tarjetas de una vez"
        />
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Elegir el PDF"
            description="Después se revisa lo leído y recién ahí se crean los territorios."
          />
          <CardBody>
            <ImportarTarjetasPdf existentes={existentes} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Qué PDF sirve"
            description="Para que no haya sorpresas."
          />
          <CardBody className="space-y-2 text-sm text-foreground">
            <p>
              Sirven los tres formatos que se usan normalmente:{" "}
              <strong>las tarjetas oficiales</strong> (una por página, con los
              rótulos “TARJETA DEL MAPA DEL TERRITORIO” y “TERR. NÚM.”),{" "}
              <strong>las hojas con varias tarjetas</strong> (cuatro por hoja,
              por ejemplo) y <strong>una lista escrita</strong> del estilo “1 -
              Camino al Túnel”.
            </p>
            <p>
              El PDF <strong>no se guarda en ninguna parte</strong>: se lee en
              tu navegador y solo viajan el número y el nombre que apruebes.
            </p>
            <p>
              Un número que <strong>ya existe</strong> no se duplica ni se
              pisa: ese territorio se queda como está.
            </p>
            <p>
              Si marcas que se guarden también los mapas, cada página se
              dibuja en tu navegador: tarda alrededor de un{" "}
              <strong>minuto cada veinte páginas</strong>. Deja la pestaña
              abierta y a la vista hasta que termine.
            </p>
            <p className="text-muted">
              Si el PDF es un <strong>escaneo</strong> (una foto de la hoja),
              no tiene texto que leer y no se podrá reconocer nada. En ese caso
              carga los territorios a mano y sube las imágenes desde “Mapas de
              los territorios”.
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
