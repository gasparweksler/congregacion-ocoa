// ============================================================================
//  Capitanes de predicación (dentro de Territorios).
//
//  Es la pantalla del Administrador: configura los horarios de su
//  congregación, abre la encuesta de un mes, la reparte por WhatsApp y
//  gestiona lo que va llegando. Todo acotado a su congregación.
//
//  La pantalla se pone al día sola mientras está abierta, así que las
//  respuestas van apareciendo sin tocar nada.
// ============================================================================

import { requireSecretary } from "@/lib/access";
import { parsePeriod } from "@/lib/period";
import { etiquetaDelMes } from "@/lib/capitanes";
import {
  getCapitanes,
  getEncuesta,
  getHistorial,
  getHorarios,
  getRespuestas,
} from "@/server/capitanes-actions";
import { PageHeader } from "@/components/PageHeader";
import { PeriodSelector } from "@/components/PeriodSelector";
import { AutoRefresco } from "@/components/AutoRefresco";
import { BackButton } from "@/components/BackButton";
import {
  Card,
  CardHeader,
  CardBody,
  CollapsibleCard,
  Alert,
} from "@/components/ui";
import { HorariosCapitanes } from "@/components/forms/HorariosCapitanes";
import { InvitacionCapitanes } from "@/components/forms/InvitacionCapitanes";
import { RespuestasCapitanes } from "@/components/forms/RespuestasCapitanes";
import { HistorialCapitanes } from "@/components/forms/HistorialCapitanes";

export default async function CapitanesPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; mes?: string }>;
}) {
  const user = await requireSecretary();
  const sp = await searchParams;
  const { year, month } = parsePeriod(sp.anio, sp.mes);

  const [horarios, encuesta, historial, capitanes] = await Promise.all([
    getHorarios(),
    getEncuesta(year, month),
    getHistorial(),
    getCapitanes(),
  ]);
  const respuestas = encuesta ? await getRespuestas(encuesta.id) : [];
  const etiquetasHorarios = horarios.map((h) => h.label);

  return (
    <>
      {/* Mientras la pestaña está a la vista, la página se refresca sola. */}
      <AutoRefresco segundos={15} />

      <div className="mb-4">
        <BackButton href="/territorios">← Volver a Territorios</BackButton>
      </div>

      <PageHeader
        title="Capitanes de predicación"
        description="Pregunta a los hermanos qué días pueden ser capitanes, con qué horario y en qué modalidad. Las respuestas llegan aquí solas, desde el enlace o desde su propia cuenta."
      />

      <div className="mb-4">
        <PeriodSelector year={year} month={month} />
      </div>

      {/* 1. Enviar la encuesta del mes.
          Va plegada: el enlace se reparte una vez y después estorba. Si el
          mes todavía no tiene encuesta, se abre sola para crearla. */}
      <div className="mb-4">
        <CollapsibleCard
          title={`Encuesta de ${etiquetaDelMes(year, month)}`}
          description={
            encuesta
              ? `${encuesta.open ? "Abierta" : "Cerrada"} · aquí está el enlace para repartir por WhatsApp.`
              : "Todavía no has creado la encuesta de este mes."
          }
          defaultOpen={!encuesta}
        >
          <InvitacionCapitanes year={year} month={month} encuesta={encuesta} />
        </CollapsibleCard>
      </div>

      {/* 2. Las respuestas */}
      {encuesta ? (
        <Card className="mb-4">
          <CardHeader
            title="Respuestas recibidas"
            description="Filtra por día, horario o modalidad; abre a cualquier hermano para corregir lo suyo."
          />
          <CardBody>
            <RespuestasCapitanes
              surveyId={encuesta.id}
              year={year}
              month={month}
              horarios={etiquetasHorarios}
              respuestas={respuestas}
              capitanes={capitanes}
              miId={user.id}
              miNombre={user.name ?? user.username}
            />
          </CardBody>
        </Card>
      ) : (
        <Alert tone="info">
          Crea la encuesta de {etiquetaDelMes(year, month)} para empezar a
          recibir disponibilidades.
        </Alert>
      )}

      {/* 3. Los horarios de la congregación */}
      <div className="mt-4">
        <CollapsibleCard
          title="Horarios disponibles"
          description="Los que salen en la encuesta para que cada hermano elija los suyos."
        >
          <HorariosCapitanes horarios={horarios} />
        </CollapsibleCard>
      </div>

      {/* 4. Las encuestas anteriores */}
      <div className="mt-4">
        <CollapsibleCard
          title="Historial de encuestas"
          description="Los meses anteriores, con las respuestas que recibió cada uno."
        >
          <HistorialCapitanes historial={historial} actual={encuesta?.id ?? null} />
        </CollapsibleCard>
      </div>
    </>
  );
}
