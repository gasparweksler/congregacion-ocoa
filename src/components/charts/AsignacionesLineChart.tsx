"use client";

// ============================================================================
//  El gráfico de líneas de las Estadísticas de Asignaciones.
//
//  Un punto por mes, con los mismos datos que ya filtró la pantalla: al
//  cambiar cualquier filtro se vuelve a pintar solo, porque los filtros viven
//  en la dirección y la página entera se rehace.
//
//  Cuatro líneas, que son las cuatro cifras de los recuadros de arriba:
//  el total de asignaciones del mes y cómo quedaron (confirmadas, rechazadas
//  y sin respuesta). La quinta cifra, cuántos hermanos distintos participaron,
//  va en el globo: como línea se confundiría con el total.
// ============================================================================

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PuntoDeLaSerie } from "@/lib/assignment-series";

const COLORES = {
  total: "#4f46e5",
  confirmadas: "#059669",
  rechazadas: "#dc2626",
  sinRespuesta: "#f59e0b",
} as const;

/** El globo: el mes entero escrito, y cada cifra con su nombre. */
function Globo({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: PuntoDeLaSerie }[];
}) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-foreground">{p.etiquetaLarga}</p>
      <ul className="space-y-0.5">
        <li style={{ color: COLORES.total }}>
          Asignaciones: <strong>{p.total}</strong>
        </li>
        <li style={{ color: COLORES.confirmadas }}>
          Confirmadas: <strong>{p.confirmadas}</strong>
        </li>
        <li style={{ color: COLORES.rechazadas }}>
          Rechazadas: <strong>{p.rechazadas}</strong>
        </li>
        <li style={{ color: COLORES.sinRespuesta }}>
          Sin respuesta: <strong>{p.sinRespuesta}</strong>
        </li>
        <li className="border-t border-border pt-0.5 text-muted">
          Hermanos distintos: <strong>{p.hermanos}</strong>
        </li>
      </ul>
    </div>
  );
}

export function AsignacionesLineChart({ data }: { data: PuntoDeLaSerie[] }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="etiqueta"
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip content={<Globo />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="total"
            name="Asignaciones"
            stroke={COLORES.total}
            strokeWidth={2.5}
            dot={{ r: 2.5 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="confirmadas"
            name="Confirmadas"
            stroke={COLORES.confirmadas}
            strokeWidth={2}
            dot={{ r: 2 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="rechazadas"
            name="Rechazadas"
            stroke={COLORES.rechazadas}
            strokeWidth={2}
            dot={{ r: 2 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="sinRespuesta"
            name="Sin respuesta"
            stroke={COLORES.sinRespuesta}
            strokeWidth={2}
            dot={{ r: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
