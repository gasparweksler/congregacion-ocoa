"use client";

// Panel de exportación: elige período y grupo, y descarga los .xlsx.
import { useState } from "react";
import { Select, Label } from "@/components/ui";
import { MONTH_NAMES } from "@/lib/constants";
import { yearOptions, currentPeriod } from "@/lib/period";
import { useFileDownload } from "@/components/DownloadButton";

export function ExportPanel({
  groups,
}: {
  groups: { id: string; name: string }[];
}) {
  // Generar un Excel tarda: se muestra el avance y se bloquean los tres
  // botones mientras tanto, para no lanzar varias generaciones a la vez.
  const { descargar, pending, error } = useFileDownload();
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
      title: "Informes de todos los publicadores",
      desc: "Detalle de participación, cursos, horas y comentarios del período elegido.",
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
        {downloads.map((d) => {
          const generando = pending === d.href;
          return (
            <button
              key={d.title}
              type="button"
              onClick={() => descargar(d.href)}
              disabled={pending !== null}
              aria-busy={generando}
              className="flex flex-col rounded-xl border border-border bg-surface p-4 text-left shadow-sm transition hover:border-primary hover:shadow disabled:cursor-wait disabled:opacity-70"
            >
              <span className="text-2xl">{d.icon}</span>
              <span className="mt-2 font-semibold text-foreground">{d.title}</span>
              <span className="mt-1 text-sm text-muted">{d.desc}</span>
              <span className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary">
                {generando ? (
                  <>
                    <span
                      aria-hidden
                      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                    />
                    Generando Excel…
                  </>
                ) : (
                  "Descargar Excel ⬇"
                )}
              </span>
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="mt-3 text-sm text-red-600">
          {error} Puedes volver a intentarlo.
        </p>
      ) : null}
    </div>
  );
}
