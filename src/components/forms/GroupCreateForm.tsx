"use client";

import { useActionState, useEffect, useRef } from "react";
import { createGroupAction } from "@/server/group-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Label, Input, Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export function GroupCreateForm() {
  const [state, action] = useActionState(createGroupAction, EMPTY_FORM_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  // Limpia el campo tras crear con éxito.
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
      <div>
        <Label htmlFor="name" required>
          Nombre del grupo
        </Label>
        <Input id="name" name="name" placeholder="ej. Grupo 2" required />
      </div>
      <SubmitButton pendingText="Creando…">Crear grupo</SubmitButton>
    </form>
  );
}
