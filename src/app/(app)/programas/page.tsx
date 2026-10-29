// ============================================================================
//  Programas
//  Tablas que se arman a mano y se descargan en PDF: el aseo, una asamblea,
//  las salidas al servicio… lo que no sale del Excel de la VyMC.
// ============================================================================

import { requireMeetingsAccess } from "@/lib/access";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui";
import { LoadingLinkButton } from "@/components/LoadingLinkButton";

export default async function ProgramasPage() {
  await requireMeetingsAccess();

  return (
    <>
      <PageHeader
        title="Programas"
        description="Arma un programa con las columnas que necesites y descárgalo en PDF."
        action={
          <LoadingLinkButton href="/programas/nuevo">
            ✚ Nuevo programa
          </LoadingLinkButton>
        }
      />

      <Card>
        <CardHeader
          title="¿Para qué sirve?"
          description="Para los programas que no vienen del Excel de la reunión."
        />
        <CardBody className="space-y-3 text-sm text-foreground">
          <p>
            Eliges un título, los meses que abarca y qué reuniones incluir.{" "}
            <strong>Las fechas aparecen solas</strong>: salen de los días de
            reunión de tu congregación, así que si tus reuniones son los jueves
            y los sábados, verás todos los jueves y todos los sábados del mes.
          </p>
          <p>
            Las columnas las pones tú: cuántas quieres y cómo se llama cada una.
            Al rellenarlas, los nombres se autocompletan con los publicadores que
            ya tienes cargados.
          </p>
          <p className="text-muted">
            Sirve igual para el aseo del Salón, los acomodadores de una
            asamblea, las salidas al servicio o cualquier reparto que lleves en
            una tabla.
          </p>
        </CardBody>
      </Card>
    </>
  );
}
