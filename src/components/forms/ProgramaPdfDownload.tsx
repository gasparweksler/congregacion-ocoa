"use client";

// Descarga del programa VyMC del mes en PDF, listo para imprimir.
// Solo se ofrecen los meses que realmente tienen reuniones de Jueves cargadas,
// para no descargar un PDF vacío.

import { useState } from "react";
import { Label, Select } from "@/components/ui";
import { monthName } from "@/lib/constants";

export type ProgramaPeriod = { year: number; month: number; count: number };

export function ProgramaPdfDownload({ periods }: { periods: ProgramaPeriod[] }) {
  const [sel, setSel] = useState(
    periods.length > 0 ? `${periods[0].year}-${periods[0].month}` : "",
  );

  if (periods.length === 0) {
    return (
      <p className="text-xs text-muted">
        El programa en PDF se podrá descargar cuando haya reuniones de Jueves
        cargadas.
      </p>
    );
  }

  const [anio, mes] = sel.split("-");

  return (
    <div className="space-y-2">
      <Label htmlFor="programa-mes">Mes del programa</Label>
      <Select
        id="programa-mes"
        value={sel}
        onChange={(e) => setSel(e.target.value)}
      >
        {periods.map((p) => (
          <option key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>
            {monthName(p.month)} {p.year} ({p.count}{" "}
            {p.count === 1 ? "reunión" : "reuniones"})
          </option>
        ))}
      </Select>
      <a
        href={`/api/programa-pdf?anio=${anio}&mes=${mes}`}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-slate-50"
      >
        🖨️ Descargar PDF
      </a>
      <p className="text-xs text-muted">
        Programa completo de Vida y Ministerio, con todas las semanas del mes y
        el hermano asignado a cada parte.
      </p>
    </div>
  );
}
