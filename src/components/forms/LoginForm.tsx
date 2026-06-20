"use client";

import { useActionState } from "react";
import { loginAction, type ActionState } from "@/server/auth-actions";
import { Label, Input, Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

const initial: ActionState = {};

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div>
        <Label htmlFor="username" required>
          Usuario
        </Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          placeholder="ej. secretario"
          autoFocus
          required
        />
      </div>

      <div>
        <Label htmlFor="password" required>
          Contraseña
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
        />
      </div>

      <SubmitButton pendingText="Ingresando…" className="w-full">
        Ingresar
      </SubmitButton>
    </form>
  );
}
