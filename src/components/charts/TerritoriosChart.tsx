"use client";

// ============================================================================
//  Los gráficos de las Estadísticas de Predicación.
//
//  Barras horizontales, no verticales: los territorios se llaman "3 - Vista
//  Hermosa" y así el nombre se lee entero sin girar la cabeza, y en un
//  teléfono la lista crece hacia abajo en vez de apretarse a lo ancho.
//
//  Los colores dicen lo mismo que las etiquetas de la pantalla: rojo =
//  nunca se predicó, ámbar = lleva mucho sin predicarse, azul = al día.
// ============================================================================

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type EstadoTerritorio = "nunca" | "olvidado" | "al-dia";

export type BarraTerritorio = {
  /** "3 - Vista Hermosa" */
  nombre: string;
  veces: number;
  estado: EstadoTerritorio;
};

export const COLOR_ESTADO: Record<EstadoTerritorio, string> = {
  nunca: "#dc2626",
  olvidado: "#f59e0b",
  "al-dia": "#4f46e5",
};

/** Nombres largos recortados, que el eje no se coma media pantalla. */
function corto(valor: string): string {
  return valor.length > 18 ? `${valor.slice(0, 17)}…` : valor;
}

/**
 * El nombre del territorio, en una sola línea.
 *
 * La etiqueta de serie de recharts parte el texto por los espacios cuando no
 * le cabe, y "5 - Vista Hermosa" salía en dos renglones pisando al de abajo.
 * Aquí se dibuja el texto a mano, ya recortado, y cada barra ocupa su línea.
 */
function EtiquetaDeTerritorio({
  x = 0,
  y = 0,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string | number };
}) {
  return (
    <text
      x={x}
      y={y}
      dx={-4}
      dy={4}
      textAnchor="end"
      fontSize={10}
      fill="#475569"
    >
      {corto(String(payload?.value ?? ""))}
    </text>
  );
}

/** Cuántas veces se predicó cada territorio, de más a menos. */
export function TerritoriosFrecuenciaChart({
  data,
}: {
  data: BarraTerritorio[];
}) {
  // Una franja por territorio: con 40 territorios el gráfico se hace alto y
  // se baja con la página, que es más claro que apretarlos hasta no leerse.
  const alto = Math.max(180, data.length * 26 + 28);
  return (
    <div className="w-full" style={{ height: alto }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 30, bottom: 4, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="nombre"
            width={104}
            interval={0}
            tick={<EtiquetaDeTerritorio />}
          />
          <Tooltip formatter={(v) => [String(v ?? 0), "Veces predicado"]} />
          <Bar dataKey="veces" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList
              dataKey="veces"
              position="right"
              style={{ fontSize: 11, fill: "#475569" }}
            />
            {data.map((d) => (
              <Cell key={d.nombre} fill={COLOR_ESTADO[d.estado]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export type BarraMes = {
  /** "Nov 2026" */
  etiqueta: string;
  salidas: number;
};

/** Cuántas salidas tuvo cada programa, del más viejo al más nuevo. */
export function ProgramasPorMesChart({ data }: { data: BarraMes[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 12, right: 8, bottom: 0, left: -16 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="etiqueta"
            tick={{ fontSize: 10 }}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip formatter={(v) => [String(v ?? 0), "Salidas"]} />
          <Bar
            dataKey="salidas"
            fill="#4f46e5"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="salidas"
              position="top"
              style={{ fontSize: 10, fill: "#475569" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
