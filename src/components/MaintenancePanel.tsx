"use client";

// Panel de mantenimiento de datos (acciones destructivas con confirmación).
import { useState } from "react";
import { Select, Label, Alert } from "@/components/ui";
import {
  deleteReportsByYearAction,
  deleteAllReportsAction,
} from "@/server/maintenance-actions";
import { yearOptions } from "@/lib/period";

export function MaintenancePanel() {
  const [year, setYear] = useState(new Date().getFullYear());

  return (
    <div className="space-y-5">
      <Alert tone="warning">
        Estas acciones eliminan informes de forma permanente y no se pueden
        deshacer. Los publicadores, grupos y usuarios NO se eliminan.
      </Alert>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div>
          <Label>Eliminar informes de un año</Label>
          <Select
            className="w-32"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {yearOptions(2020).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
        <form
          action={deleteReportsByYearAction}
          onSubmit={(e) => {
            if (
              !confirm(
                `¿Eliminar TODOS los informes del año ${year}? Esta acción no se puede deshacer.`,
              )
            )
              e.preventDefault();
          }}
        >
          <input type="hidden" name="year" value={year} />
          <button
            type="submit"
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Eliminar año {year}
          </button>
        </form>
      </div>

      <div className="border-t border-border pt-4">
        <form
          action={deleteAllReportsAction}
          onSubmit={(e) => {
            if (
              !confirm(
                "¿Eliminar TODOS los informes de TODOS los años? Esta acción no se puede deshacer.",
              )
            )
              e.preventDefault();
          }}
        >
          <button
            type="submit"
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Eliminar todos los informes históricos
          </button>
        </form>
      </div>
    </div>
  );
}
