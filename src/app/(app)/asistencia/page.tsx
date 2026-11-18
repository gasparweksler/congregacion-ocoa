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
import {
  anioDeServicio,
  etiquetaHoja,
  etiquetaRangoHoja,
  hojasDelS88,
} from "@/lib/asistencia";
import {
  getAsistenciaDelMes,
  getHistorialAnioDeServicio,
  getPrimerAnioConDatos,
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
  searchParams: Promise<{ anio?: string; mes?: string; hoja?: string }>;
}) {
  const user = await requireSecretary();
  const cong = congregationId(user);
  const sp = await searchParams;
  const { year, month } = parsePeriod(sp.anio, sp.mes);

  // El historial sigue siempre al mes que se está mirando.
  const servicio = anioDeServicio(year, month);

  const [mes, historial, days, primeroConDatos] = await Promise.all([
    getAsistenciaDelMes(year, month),
    getHistorialAnioDeServicio(servicio),
    getMeetingDays(cong),
    getPrimerAnioConDatos(),
  ]);

  // La hoja del S-88 lleva dos años de servicio. Se ofrece la del año en
  // curso en adelante (y hacia atrás solo si ya hay algo anotado antes).
  const hojas = hojasDelS88({ desde: primeroConDatos, mirando: servicio });
  const pedida = parseInt(sp.hoja ?? "", 10);
  const hoja = hojas.includes(pedida) ? pedida : servicio;

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
          description={`La hoja lleva dos años de servicio, uno en cada columna, como el formulario de papel. Hoja ${etiquetaHoja(hoja)}: ${etiquetaRangoHoja(hoja).toLowerCase()}.`}
        />
        <CardBody>
          <S88Descarga hoja={hoja} hojas={hojas} />
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
