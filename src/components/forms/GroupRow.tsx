"use client";

import { useActionState, useEffect, useState } from "react";
import { updateGroupAction, deleteGroupAction } from "@/server/group-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Input, Button, Badge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Td } from "@/components/ui";
import { statusLabel, roleLabel } from "@/lib/constants";
import { statusTone } from "@/lib/ui-helpers";

export type GroupRowData = {
  id: string;
  name: string;
  publisherCount: number;
  userCount: number;
  publishers: { id: string; name: string; status: string }[];
  users: { id: string; name: string; role: string; active: boolean }[];
};

// Celda con el número y un ojo para desplegar la lista correspondiente.
function CountCell({
  count,
  open,
  onToggle,
  label,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <Td className="text-muted">
      <div className="flex items-center gap-2">
        <span className="tabular-nums">{count}</span>
        {count > 0 ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={open ? `Ocultar ${label}` : `Ver ${label}`}
            title={open ? `Ocultar ${label}` : `Ver ${label}`}
            className="rounded-md border border-border px-1.5 py-0.5 text-xs transition-colors hover:bg-slate-50 hover:text-foreground"
          >
            <span aria-hidden>{open ? "🙈" : "👁️"}</span>
          </button>
        ) : null}
      </div>
    </Td>
  );
}

export function GroupRow({ group }: { group: GroupRowData }) {
  const [editing, setEditing] = useState(false);
  // Lista desplegada bajo la fila: integrantes o usuarios (o ninguna).
  const [open, setOpen] = useState<null | "publishers" | "users">(null);
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
    <>
      <tr>
        <Td className="font-medium">{group.name}</Td>
        <CountCell
          count={group.publisherCount}
          open={open === "publishers"}
          onToggle={() =>
            setOpen(open === "publishers" ? null : "publishers")
          }
          label={`integrantes de ${group.name}`}
        />
        <CountCell
          count={group.userCount}
          open={open === "users"}
          onToggle={() => setOpen(open === "users" ? null : "users")}
          label={`usuarios de ${group.name}`}
        />
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

      {open ? (
        <tr>
          <Td className="bg-slate-50 px-3 py-3" colSpan={4}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
              {open === "publishers"
                ? `Integrantes de ${group.name} (${group.publisherCount})`
                : `Usuarios de ${group.name} (${group.userCount})`}
            </p>
            <ol className="space-y-1">
              {(open === "publishers" ? group.publishers : group.users).map(
                (item, i) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center gap-2 text-sm"
                  >
                    <span className="w-6 shrink-0 text-right tabular-nums text-muted">
                      {i + 1}.
                    </span>
                    <span className="font-medium text-foreground">
                      {item.name}
                    </span>
                    {open === "publishers" ? (
                      <Badge
                        tone={statusTone((item as { status: string }).status)}
                      >
                        {statusLabel((item as { status: string }).status)}
                      </Badge>
                    ) : (
                      <>
                        <Badge tone="blue">
                          {roleLabel((item as { role: string }).role)}
                        </Badge>
                        {!(item as { active: boolean }).active ? (
                          <Badge tone="slate">Inactivo</Badge>
                        ) : null}
                      </>
                    )}
                  </li>
                ),
              )}
            </ol>
          </Td>
        </tr>
      ) : null}
    </>
  );
}
