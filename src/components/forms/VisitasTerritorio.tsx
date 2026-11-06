"use client";

// Anotar cada vez que se predicó un territorio, y borrar lo que se anote por
// error. Las salidas del programa del mes aparecen en la misma lista, pero no
// se borran de aquí: se quitan desde el programa, que es su sitio.

import { useActionState, useEffect, useRef } from "react";
import { addVisitaAction, deleteVisitaAction } from "@/server/territorio-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Input, Label, Alert, Badge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { formatDate } from "@/lib/dates";

export type VezEnPantalla = {
  /** Id del registro si se anotó a mano; null si viene del programa. */
  id: string | null;
  fecha: string;
  origen: "manual" | "programa";
  detalle: string | null;
};

export function VisitasTerritorio({
  territoryId,
  hoyISO,
  veces,
}: {
  territoryId: string;
  hoyISO: string;
  veces: VezEnPantalla[];
}) {
  const [state, action] = useActionState(addVisitaAction, EMPTY_FORM_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <div className="space-y-4">
      <form ref={formRef} action={action} className="space-y-3">
        <input type="hidden" name="territoryId" value={territoryId} />
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="visita-fecha" required>
              Se predicó el
            </Label>
            <Input
              id="visita-fecha"
              name="date"
              type="date"
              defaultValue={hoyISO}
              max="2100-12-31"
              required
              className="w-44"
            />
          </div>
          <div className="min-w-[12rem] flex-1">
            <Label htmlFor="visita-nota">Nota (opcional)</Label>
            <Input
              id="visita-nota"
              name="note"
              placeholder="Salida de la mañana"
              maxLength={200}
            />
          </div>
          <SubmitButton pendingText="Anotando…">✚ Anotar</SubmitButton>
        </div>
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      </form>

      {veces.length === 0 ? (
        <p className="text-sm text-muted">
          Todavía no hay ninguna vez anotada en este territorio.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {veces.map((v, i) => (
            <li
              key={v.id ?? `programa-${i}`}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <div className="min-w-0">
                <span className="text-sm font-medium text-foreground">
                  {formatDate(new Date(v.fecha))}
                </span>
                {v.detalle ? (
                  <span className="ml-2 text-sm text-muted">{v.detalle}</span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {v.origen === "programa" ? (
                  <Badge tone="blue">Del programa</Badge>
                ) : (
                  <Badge tone="slate">Anotado a mano</Badge>
                )}
                {v.id ? (
                  <ConfirmButton
                    action={deleteVisitaAction}
                    hidden={{ id: v.id }}
                    confirmText={`¿Borrar el registro del ${formatDate(
                      new Date(v.fecha),
                    )}?`}
                  >
                    Borrar
                  </ConfirmButton>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
