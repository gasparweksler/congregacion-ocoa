"use client";

import { useActionState, useEffect, useState } from "react";
import { updateGroupAction, deleteGroupAction } from "@/server/group-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Input, Button } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Td } from "@/components/ui";

export type GroupRowData = {
  id: string;
  name: string;
  publisherCount: number;
  userCount: number;
};

export function GroupRow({ group }: { group: GroupRowData }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState(updateGroupAction, EMPTY_FORM_STATE);

  // Cierra el modo edición cuando guarda con éxito.
  useEffect(() => {
    if (state.success) setEditing(false);
  }, [state.success]);

  if (editing) {
    return (
      <tr>
        <Td className="align-top">
          <form action={action} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={group.id} />
            <Input name="name" defaultValue={group.name} required autoFocus />
            {state.error ? (
              <span className="text-xs text-red-600">{state.error}</span>
            ) : null}
            <div className="flex gap-2">
              <SubmitButton pendingText="Guardando…">Guardar</SubmitButton>
              <Button variant="secondary" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Td>
        <Td className="align-top text-muted">{group.publisherCount}</Td>
        <Td className="align-top text-muted">{group.userCount}</Td>
        <Td />
      </tr>
    );
  }

  return (
    <tr>
      <Td className="font-medium">{group.name}</Td>
      <Td className="text-muted">{group.publisherCount}</Td>
      <Td className="text-muted">{group.userCount}</Td>
      <Td>
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md px-2.5 py-1 text-sm font-medium text-primary hover:bg-indigo-50"
          >
            Editar
          </button>
          <ConfirmButton
            action={deleteGroupAction}
            hidden={{ id: group.id }}
            confirmText={
              group.publisherCount > 0
                ? `El grupo "${group.name}" tiene ${group.publisherCount} publicador(es). Al eliminarlo se borrarán TODOS sus publicadores e informes. ¿Continuar?`
                : `¿Eliminar el grupo "${group.name}"?`
            }
          >
            Eliminar
          </ConfirmButton>
        </div>
      </Td>
    </tr>
  );
}
