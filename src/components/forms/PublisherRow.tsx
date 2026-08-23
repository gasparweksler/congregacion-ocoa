"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  updatePublisherAction,
  deletePublisherAction,
  changePublisherGroupAction,
} from "@/server/publisher-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Alert, Badge, Button, Select } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import {
  PublisherFields,
  type GroupOption,
  type PublisherDefaults,
} from "@/components/forms/PublisherFields";
import { statusLabel } from "@/lib/constants";
import { statusTone } from "@/lib/ui-helpers";

export type PublisherRowData = PublisherDefaults & {
  id: string;
  fullName: string;
  status: string;
  groupName?: string | null;
};

export function PublisherRow({
  publisher,
  showGroup,
  groups,
}: {
  publisher: PublisherRowData;
  showGroup: boolean;
  groups: GroupOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState(
    updatePublisherAction,
    EMPTY_FORM_STATE,
  );

  // Cambio rápido de grupo (sin abrir el formulario completo de "Editar").
  const [changingGroup, setChangingGroup] = useState(false);
  const [groupState, groupAction] = useActionState(
    changePublisherGroupAction,
    EMPTY_FORM_STATE,
  );

  useEffect(() => {
    if (state.success) setEditing(false);
  }, [state.success]);

  useEffect(() => {
    if (groupState.success) setChangingGroup(false);
  }, [groupState.success]);

  if (editing) {
    return (
      <div className="border-l-4 border-primary bg-slate-50 px-5 py-4">
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={publisher.id} />
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <PublisherFields
            defaults={publisher}
            showGroup={showGroup}
            groups={groups}
          />
          <div className="flex gap-2">
            <SubmitButton pendingText="Guardando…">
              Guardar cambios
            </SubmitButton>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">
            {publisher.fullName}
          </span>
          <Badge tone={statusTone(publisher.status)}>
            {statusLabel(publisher.status)}
          </Badge>
        </div>
        {showGroup ? (
          changingGroup ? (
            // Cambio rápido: elegir grupo y guardar.
            <form
              action={groupAction}
              className="mt-1.5 flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="id" value={publisher.id} />
              <Select
                name="groupId"
                defaultValue={publisher.groupId ?? ""}
                aria-label={`Nuevo grupo de ${publisher.fullName}`}
                className="w-auto min-w-0 py-1.5 text-sm"
              >
                <option value="" disabled>
                  — Elegir grupo —
                </option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
              <SubmitButton pendingText="Guardando…" className="px-3 py-1.5 text-sm">
                Guardar
              </SubmitButton>
              <button
                type="button"
                onClick={() => setChangingGroup(false)}
                className="rounded-md px-2.5 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-muted">
                {publisher.groupName ?? "Sin grupo"}
              </p>
              <button
                type="button"
                onClick={() => setChangingGroup(true)}
                className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted transition-colors hover:bg-slate-50 hover:text-foreground"
              >
                🔄 Cambiar Grupo
              </button>
            </div>
          )
        ) : null}
        {groupState.error ? (
          <p className="mt-1 text-xs text-red-600">{groupState.error}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <Link
          href={`/publicadores/${publisher.id}`}
          className="rounded-md px-2.5 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Historial
        </Link>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-md px-2.5 py-1 text-sm font-medium text-primary hover:bg-indigo-50"
        >
          Editar
        </button>
        <ConfirmButton
          action={deletePublisherAction}
          hidden={{ id: publisher.id }}
          confirmText={`¿Eliminar a "${publisher.fullName}"? Se borrarán también todos sus informes e historial.`}
        >
          Eliminar
        </ConfirmButton>
      </div>
    </div>
  );
}
