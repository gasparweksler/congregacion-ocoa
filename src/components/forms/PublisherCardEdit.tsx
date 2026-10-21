"use client";

// Edición de los datos de la tarjeta desde la propia ficha del publicador
// ("Ver Tarjeta"): nombre, fechas, sexo, esperanza, privilegio, estado y grupo.
// Reutiliza los mismos campos y la misma acción que "Editar" en la lista, así
// que valida y audita igual. No toca el historial de informes.

import { useActionState, useState } from "react";
import { updatePublisherAction } from "@/server/publisher-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Alert, Button } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import {
  PublisherFields,
  type GroupOption,
  type PublisherDefaults,
} from "@/components/forms/PublisherFields";

export function PublisherCardEdit({
  id,
  defaults,
  showGroup,
  groups,
}: {
  id: string;
  defaults: PublisherDefaults;
  showGroup: boolean;
  groups: GroupOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState(
    updatePublisherAction,
    EMPTY_FORM_STATE,
  );

  // Al guardar con éxito la página se revalida sola; solo hay que cerrar.
  if (state.success && editing) setEditing(false);

  if (!editing) {
    return (
      <div className="space-y-2">
        {state.success ? (
          <Alert tone="success">✅ {state.success}</Alert>
        ) : null}
        <Button variant="secondary" onClick={() => setEditing(true)}>
          ✏️ Editar datos de la tarjeta
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <PublisherFields
        defaults={defaults}
        showGroup={showGroup}
        groups={groups}
      />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingText="Guardando…">Guardar cambios</SubmitButton>
        <Button variant="secondary" onClick={() => setEditing(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
