"use client";

// Descarga en PDF del programa del mes, con un único selector de mes para los
// dos: el de entre semana (Vida y Ministerio) y el de fin de semana.
//
// En el desplegable salen los meses que tienen alguna reunión cargada, del tipo
// que sea, y cada botón dice cuántas hay de lo suyo: así no se descarga un PDF
// vacío sin saberlo.

import { useState } from "react";
import { Label, Select } from "@/components/ui";
import { monthName } from "@/lib/constants";
import { DownloadButton } from "@/components/DownloadButton";

export type ProgramaPeriod = {
  year: number;
  month: number;
  /** Reuniones de entre semana de ese mes. */
  count: number;
  /** Reuniones de fin de semana de ese mes. */
  countFinde: number;
};

const plural = (n: number) => (n === 1 ? "reunión" : "reuniones");

export function ProgramaPdfDownload({ periods }: { periods: ProgramaPeriod[] }) {
  const [sel, setSel] = useState(
    periods.length > 0 ? `${periods[0].year}-${periods[0].month}` : "",
  );

  if (periods.length === 0) {
    return (
      <p className="text-xs text-muted">
        Los programas en PDF se podrán descargar cuando haya reuniones
        cargadas.
      </p>
    );
  }

  const [anio, mes] = sel.split("-");
  const elegido =
    periods.find((p) => `${p.year}-${p.month}` === sel) ?? periods[0];

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="programa-mes">Mes del programa</Label>
        <Select
          id="programa-mes"
          value={sel}
          onChange={(e) => setSel(e.target.value)}
        >
          {periods.map((p) => (
            <option key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>
              {monthName(p.month)} {p.year} ({p.count + p.countFinde}{" "}
              {plural(p.count + p.countFinde)})
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-2">
        <DownloadButton
          href={`/api/programa-pdf?anio=${anio}&mes=${mes}`}
          pendingText="Generando PDF…"
        >
          🖨️ PDF de Reunión de Entre Semana
        </DownloadButton>
        <p className="text-xs text-muted">
          Programa completo de Vida y Ministerio, con todas las semanas del mes
          y el hermano asignado a cada parte.{" "}
          {elegido.count === 0 ? (
            <strong>
              Este mes no tiene ninguna reunión de entre semana cargada.
            </strong>
          ) : (
            <>
              {elegido.count} {plural(elegido.count)} en{" "}
              {monthName(elegido.month)}.
            </>
          )}
        </p>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <DownloadButton
          href={`/api/programa-finde-pdf?anio=${anio}&mes=${mes}`}
          pendingText="Generando PDF…"
        >
          🖨️ PDF de Reunión de Fin de Semana
        </DownloadButton>
        <p className="text-xs text-muted">
          Presidente, lector de La Atalaya, oración, orador, tema y
          hospitalidad de cada fin de semana.{" "}
          {elegido.countFinde === 0 ? (
            <strong>
              Este mes no tiene ninguna reunión de fin de semana cargada.
            </strong>
          ) : (
            <>
              {elegido.countFinde} {plural(elegido.countFinde)} en{" "}
              {monthName(elegido.month)}.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
