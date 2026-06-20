"use client";

// Panel de exportación: elige período y grupo, y descarga los .xlsx.
import { useState } from "react";
import { Select, Label } from "@/components/ui";
import { MONTH_NAMES } from "@/lib/constants";
import { yearOptions, currentPeriod } from "@/lib/period";

export function ExportPanel({
  groups,
}: {
  groups: { id: string; name: string }[];
}) {
  const now = currentPeriod();
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);
  const [grupo, setGrupo] = useState("");

  const q = (tipo: string) => {
    const params = new URLSearchParams({
      tipo,
      anio: String(year),
      mes: String(month),
    });
    if (grupo) params.set("grupo", grupo);
    return `/api/export?${params.toString()}`;
  };

  const downloads = [
    {
      title: "Informes mensuales",
      desc: "Detalle de participación, cursos y horas del período elegido.",
      href: q("informes"),
      icon: "📝",
    },
    {
      title: "Estadísticas generales y por grupo",
      desc: "Resumen congregacional y comparación entre grupos del período.",
      href: q("estadisticas"),
      icon: "📊",
    },
    {
      title: "Listado de publicadores",
      desc: "Todos los publicadores con su estado, grupo y fechas.",
      href: q("publicadores"),
      icon: "👥",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label>Mes</Label>
          <Select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTH_NAMES.map((m, i) => (
              <option key={i + 1} value={i + 1}>
                {m}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Año</Label>
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {yearOptions().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Grupo (opcional)</Label>
          <Select value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            <option value="">Todos los grupos</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {downloads.map((d) => (
          <a
            key={d.title}
            href={d.href}
            className="flex flex-col rounded-xl border border-border bg-surface p-4 shadow-sm transition hover:border-primary hover:shadow"
          >
            <span className="text-2xl">{d.icon}</span>
            <span className="mt-2 font-semibold text-foreground">{d.title}</span>
            <span className="mt-1 text-sm text-muted">{d.desc}</span>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
              Descargar Excel ⬇
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
