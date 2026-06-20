"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPublisherAction } from "@/server/publisher-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Alert, Button } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import {
  PublisherFields,
  type GroupOption,
} from "@/components/forms/PublisherFields";

export function PublisherCreateForm({
  showGroup,
  groups,
}: {
  showGroup: boolean;
  groups: GroupOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    createPublisherAction,
    EMPTY_FORM_STATE,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>+ Nuevo publicador</Button>
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="space-y-4 rounded-xl border border-border bg-surface p-4 shadow-sm"
    >
      <h3 className="font-semibold text-foreground">Nuevo publicador</h3>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <PublisherFields showGroup={showGroup} groups={groups} />

      <div className="flex gap-2">
        <SubmitButton pendingText="Guardando…">Guardar publicador</SubmitButton>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cerrar
        </Button>
      </div>
    </form>
  );
}
