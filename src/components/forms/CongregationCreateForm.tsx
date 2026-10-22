"use client";

// Alta de una congregación junto con su primer Administrador. Se crean juntos
// a propósito: así nunca queda una congregación a la que nadie pueda entrar.

import { useActionState, useState } from "react";
import { createCongregationAction } from "@/server/platform-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Alert, Button, Label, Input } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { PasswordInput } from "@/components/PasswordInput";

/** Sugiere el identificador corto a partir del nombre ("Ocoa" -> "ocoa"). */
function toSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function CongregationCreateForm() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    createCongregationAction,
    EMPTY_FORM_STATE,
  );
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTocado, setSlugTocado] = useState(false);

  // Al guardar con éxito se cierra el formulario (la lista se revalida sola).
  if (state.success && open) setOpen(false);

  const sugerido = slugTocado ? slug : toSlug(name);

  if (!open) {
    return (
      <div className="space-y-2">
        {state.success ? <Alert tone="success">✅ {state.success}</Alert> : null}
        <Button variant="primary" onClick={() => setOpen(true)}>
          ➕ Nueva congregación
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label required>Nombre de la congregación</Label>
          <Input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Por ejemplo: Quillota Norte"
            required
          />
        </div>

        <div className="sm:col-span-2">
          <Label>Identificador para enlaces</Label>
          <Input
            name="slug"
            value={sugerido}
            onChange={(e) => {
              setSlugTocado(true);
              setSlug(e.target.value);
            }}
            placeholder="quillota-norte"
          />
          <p className="mt-1 text-xs text-muted">
            Se usa en el enlace público de inscripción de Precursores
            Auxiliares. Si lo dejas así, se arma solo con el nombre.
          </p>
        </div>

        <div className="sm:col-span-2 border-t border-border pt-3">
          <p className="text-sm font-semibold text-foreground">
            Administrador de la congregación
          </p>
          <p className="text-xs text-muted">
            Será quien administre sus grupos, publicadores e informes. Se le
            pedirá cambiar la contraseña en su primer ingreso.
          </p>
        </div>

        <div>
          <Label required>Nombre y apellido</Label>
          <Input name="adminName" placeholder="Pedro Pérez" required />
        </div>

        <div>
          <Label required>Usuario</Label>
          <Input
            name="adminUser"
            placeholder="quillota.pedro"
            autoComplete="off"
            required
          />
          <p className="mt-1 text-xs text-muted">
            Único en toda la plataforma. Conviene anteponer la congregación.
          </p>
        </div>

        <div className="sm:col-span-2">
          <Label required>Contraseña provisional</Label>
          <PasswordInput name="adminPass" minLength={8} required />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingText="Creando…">Crear congregación</SubmitButton>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
