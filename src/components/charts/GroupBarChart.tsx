"use client";

// Gráfico de barras para comparar grupos (publicadores vs. informaron).
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
  groupName: string;
  totalPublishers: number;
  reported: number;
};

export function GroupBarChart({ data }: { data: Row[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="groupName" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Bar dataKey="totalPublishers" name="Publicadores" fill="#cbd5e1" />
          <Bar dataKey="reported" name="Informaron" fill="#4f46e5" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
