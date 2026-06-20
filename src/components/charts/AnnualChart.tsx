"use client";

// Gráfico de barras para la evolución anual (totales por año).
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

type Row = {
  year: number;
  reported: number;
  hours: number;
  bibleStudies: number;
};

export function AnnualChart({ data }: { data: Row[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="year" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Bar dataKey="reported" name="Informes" fill="#4f46e5" />
          <Bar dataKey="bibleStudies" name="Cursos bíblicos" fill="#10b981" />
          <Bar dataKey="hours" name="Horas" fill="#f59e0b" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
