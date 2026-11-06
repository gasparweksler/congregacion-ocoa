"use client";

// Alta de territorios: uno a uno, o muchos de una vez pegando una lista.
// Las dos formas conviven porque las dos hacen falta: al empezar se cargan
// cincuenta de golpe, y después se agrega uno suelto de vez en cuando.

import { useActionState, useEffect, useRef } from "react";
import {
  createTerritorioAction,
  createTerritoriosEnLoteAction,
} from "@/server/territorio-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Input, Label, Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export function TerritorioCreateForm({
  siguienteNumero,
}: {
  siguienteNumero: number;
}) {
  const [state, action] = useActionState(
    createTerritorioAction,
    EMPTY_FORM_STATE,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Al guardar, el formulario queda limpio para seguir agregando.
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-28">
          <Label htmlFor="territorio-numero" required>
            Número
          </Label>
          <Input
            id="territorio-numero"
            name="number"
            type="number"
            min={1}
            max={9999}
            // Se propone el siguiente libre, pero se puede cambiar.
            key={siguienteNumero}
            defaultValue={siguienteNumero}
            required
          />
        </div>
        <div className="min-w-[14rem] flex-1">
          <Label htmlFor="territorio-nombre" required>
            Nombre
          </Label>
          <Input
            id="territorio-nombre"
            name="name"
            placeholder="Camino al Túnel"
            maxLength={120}
            required
          />
        </div>
        <SubmitButton pendingText="Agregando…">✚ Agregar</SubmitButton>
      </div>

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
    </form>
  );
}

export function TerritoriosEnLote() {
  const [state, action] = useActionState(
    createTerritoriosEnLoteAction,
    EMPTY_FORM_STATE,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <div>
        <Label htmlFor="territorios-lista">
          Un territorio por línea
        </Label>
        <textarea
          id="territorios-lista"
          name="lista"
          rows={8}
          placeholder={
            "1 - Camino al Túnel\n2 - La Febre 1\n3 - Vista Hermosa"
          }
          className="w-full rounded-[10px] border border-border bg-white px-3.5 py-2.5 text-sm text-foreground placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
        />
        <p className="mt-1 text-xs text-muted">
          Vale escribirlo de cualquier forma: <code>1 - Nombre</code>,{" "}
          <code>1. Nombre</code>, <code>1) Nombre</code> o solo{" "}
          <code>Nombre</code> (entonces se le pone el siguiente número libre).
          Los que ya existan se saltan y se avisa.
        </p>
      </div>

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <SubmitButton pendingText="Agregando…">
        ✚ Agregar la lista
      </SubmitButton>
    </form>
  );
}
