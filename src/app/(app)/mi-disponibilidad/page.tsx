// ============================================================================
//  "Subir mi disponibilidad de capitán"
//
//  Lo ve quien tenga la casilla Capitán en su usuario (y el Administrador).
//  Entra con su usuario y contraseña de siempre: no hay otro registro ni otra
//  contraseña. Aquí solo está LO SUYO; las respuestas de los demás se ven en
//  la sección Capitanes, que es del Administrador.
// ============================================================================

import { requireCaptain } from "@/lib/access";
import { getMisEncuestas } from "@/server/capitanes-actions";
import { etiquetaDelMes } from "@/lib/capitanes";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody, EmptyState } from "@/components/ui";
import { MiDisponibilidad } from "@/components/forms/MiDisponibilidad";

export default async function MiDisponibilidadPage() {
  const user = await requireCaptain();
  const encuestas = await getMisEncuestas();

  return (
    <>
      <PageHeader
        title="Subir mi disponibilidad de capitán"
        description="Marca en el calendario los días en que puedes acompañar la predicación. Puedes volver cuando quieras y cambiarlo."
      />

      {encuestas.length === 0 ? (
        <EmptyState
          title="No hay ninguna encuesta abierta"
          description="Cuando el Administrador abra la encuesta de un mes, aparecerá aquí."
        />
      ) : (
        <div className="space-y-4">
          {encuestas.map((e) => (
            <Card key={e.id}>
              <CardHeader
                title={`Disponibilidad de ${etiquetaDelMes(e.year, e.month)}`}
                description={
                  e.mia
                    ? "Ya enviaste tu disponibilidad. Puedes cambiarla y volver a guardar."
                    : "Todavía no has enviado tu disponibilidad de este mes."
                }
              />
              <CardBody>
                <MiDisponibilidad
                  surveyId={e.id}
                  year={e.year}
                  month={e.month}
                  horarios={e.horarios}
                  inicial={e.mia}
                  nombre={user.name ?? user.username}
                />
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
