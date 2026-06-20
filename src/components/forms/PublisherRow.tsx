"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  updatePublisherAction,
  deletePublisherAction,
} from "@/server/publisher-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Alert, Badge, Button } from "@/components/ui";
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

  useEffect(() => {
    if (state.success) setEditing(false);
  }, [state.success]);

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
        {showGroup && publisher.groupName ? (
          <p className="text-sm text-muted">{publisher.groupName}</p>
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
