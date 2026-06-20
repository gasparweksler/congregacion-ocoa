"use client";

// Gráfico de líneas para la evolución mensual (participación, horas, cursos).
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

type Point = {
  label: string;
  reported: number;
  hours: number;
  bibleStudies: number;
};

export function EvolutionLineChart({ data }: { data: Point[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="reported"
            name="Informaron"
            stroke="#4f46e5"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="bibleStudies"
            name="Cursos bíblicos"
            stroke="#10b981"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="hours"
            name="Horas"
            stroke="#f59e0b"
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
