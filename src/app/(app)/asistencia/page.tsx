// ============================================================================
//  Asistencia a las reuniones (registro S-88)
//
//  Se elige el mes y salen todas las reuniones de ese mes, según los días que
//  la congregación tiene configurados en Reuniones. De cada una se anota si
//  hubo reunión normal, cuánta gente asistió y las observaciones.
//
//  Arriba, los tres promedios del mes y la descarga del registro S-88-S del
//  año de servicio elegido. Abajo, el historial para consultar o corregir
//  cualquier mes anterior.
// ============================================================================

import { requireSecretary, congregationId } from "@/lib/access";
import { parsePeriod } from "@/lib/period";
import { monthName, weekdayName } from "@/lib/constants";
import { anioDeServicio, etiquetaAnioDeServicio } from "@/lib/asistencia";
import {
  getAsistenciaDelMes,
  getHistorialAnioDeServicio,
} from "@/server/asistencia-actions";
import { getMeetingDays } from "@/lib/meeting-days";
import { PageHeader } from "@/components/PageHeader";
import { PeriodSelector } from "@/components/PeriodSelector";
import { Card, CardHeader, CardBody, CollapsibleCard, Alert } from "@/components/ui";
import { AsistenciaMes } from "@/components/forms/AsistenciaMes";
import { HistorialAsistencia } from "@/components/forms/HistorialAsistencia";
import { S88Descarga } from "@/components/forms/S88Descarga";

export default async function AsistenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; mes?: string; servicio?: string }>;
}) {
  const user = await requireSecretary();
  const cong = congregationId(user);
  const sp = await searchParams;
  const { year, month } = parsePeriod(sp.anio, sp.mes);

  // El año de servicio: el del mes que se está mirando, salvo que se elija
  // otro para la descarga y el historial.
  const pedido = parseInt(sp.servicio ?? "", 10);
  const servicio =
    !isNaN(pedido) && pedido >= 2000 && pedido <= 2100
      ? pedido
      : anioDeServicio(year, month);

  const [mes, historial, days] = await Promise.all([
    getAsistenciaDelMes(year, month),
    getHistorialAnioDeServicio(servicio),
    getMeetingDays(cong),
  ]);

  return (
    <>
      <PageHeader
        title="Asistencia a Reuniones"
        description={`Registro de asistencia de ${monthName(month)} de ${year}. Las fechas salen de los días de reunión de tu congregación: ${weekdayName(days.midweekDay)} (entre semana) y ${weekdayName(days.weekendDay)} (fin de semana).`}
      />

      {/* El año de servicio y la descarga del formulario oficial. */}
      <Card className="mb-4">
        <CardHeader
          title="Registro de asistencia S-88-S"
          description={`El año de servicio va de septiembre a agosto. ${etiquetaAnioDeServicio(servicio)}.`}
        />
        <CardBody>
          <S88Descarga anio={servicio} />
        </CardBody>
      </Card>

      <div className="mb-4">
        <PeriodSelector year={year} month={month} />
      </div>

      {/* La llave fuerza empezar de cero al cambiar de mes: si no, se
          quedarían en pantalla las casillas del mes anterior. */}
      <AsistenciaMes key={`${year}-${month}`} filas={mes.filas} />

      <div className="mt-6">
        <CollapsibleCard
          title={`Historial de asistencias · año de servicio ${servicio}`}
          description="Los meses de septiembre a agosto, con sus promedios y observaciones. Desde aquí se abre cualquier mes para corregirlo."
        >
          <HistorialAsistencia anio={servicio} meses={historial} />
        </CollapsibleCard>
      </div>

      {mes.filas.length === 0 ? (
        <Alert tone="warning">
          Este mes no tiene ninguna fecha de reunión. Revisa los días
          configurados en la sección Reuniones.
        </Alert>
      ) : null}
    </>
  );
}
