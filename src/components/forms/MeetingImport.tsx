"use client";

import { useActionState } from "react";
import { importMeetingsAction } from "@/server/meeting-import-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export function MeetingImport() {
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

        <label className="block text-sm font-medium text-foreground">
          Archivo del programa (.xlsx)
        </label>
        <input
          type="file"
          name="file"
          accept=".xlsx"
          required
          className="block w-full rounded-xl border border-border bg-white text-sm text-foreground file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-slate-200"
        />
        <SubmitButton pendingText="Importando…">
          Crear reuniones desde Excel
        </SubmitButton>
      </form>
    </div>
  );
}
