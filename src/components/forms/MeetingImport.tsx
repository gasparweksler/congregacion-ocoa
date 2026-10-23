"use client";

import { useActionState } from "react";
import { importMeetingsAction } from "@/server/meeting-import-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export function MeetingImport() {
  // Año por defecto: el que viene. Si el archivo trae el año (en el nombre de
  // la hoja o en alguna celda), ese manda y este se ignora.
  const añoActual = new Date().getFullYear();
  const [state, action] = useActionState(
    importMeetingsAction,
    EMPTY_FORM_STATE,
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Sube el Excel del programa <strong>Vida y Ministerio (VyMC)</strong> y se
        crearán las reuniones de Jueves del mes con el título de cada parte ya
        puesto. Los hermanos se asignan después, dentro de cada reunión.
      </p>

      <form action={action} className="space-y-2">
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}

        <label
          htmlFor="vymc-file"
          className="block text-sm font-medium text-foreground"
        >
          Archivo del programa (.xlsx)
        </label>
        <input
          id="vymc-file"
          type="file"
          name="file"
          accept=".xlsx"
          required
          className="block w-full rounded-xl border border-border bg-white text-sm text-foreground file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-slate-200"
        />
        <div>
          <label
            htmlFor="vymc-year"
            className="block text-sm font-medium text-foreground"
          >
            Año del programa
          </label>
          <input
            id="vymc-year"
            type="number"
            name="anio"
            inputMode="numeric"
            min={2000}
            max={2100}
            defaultValue={añoActual}
            required
            className="mt-1 w-32 rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
          <p className="mt-1 text-xs text-muted">
            Se usa solo si el archivo no indica el año. La planilla en blanco no
            lo trae, así que conviene revisarlo.
          </p>
        </div>

        <SubmitButton pendingText="Importando…">
          Crear reuniones desde Excel
        </SubmitButton>
      </form>
    </div>
  );
}
