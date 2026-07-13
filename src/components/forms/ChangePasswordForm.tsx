"use client";

import { useActionState, useEffect } from "react";
import {
  changePasswordAction,
  logoutAction,
  type ActionState,
} from "@/server/auth-actions";
import { Label, Input, Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

const initial: ActionState = {};

export function ChangePasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, initial);

  // Al cambiarla con éxito: mostrar confirmación y volver al inicio de sesión.
  useEffect(() => {
    if (state.success) {
      const t = setTimeout(() => {
        logoutAction();
      }, 2500);
      return () => clearTimeout(t);
    }
  }, [state.success]);

  if (state.success) {
    return (
      <Alert tone="success">
        ✅ {state.success} Te llevaremos al inicio de sesión para entrar con tu
        nueva contraseña…
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div>
        <Label htmlFor="currentPassword" required>
          Contraseña actual
        </Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <div>
        <Label htmlFor="newPassword" required>
          Nueva contraseña
        </Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
        />
        <p className="mt-1 text-xs text-muted">Mínimo 6 caracteres.</p>
      </div>
      <div>
        <Label htmlFor="confirmPassword" required>
          Repetir nueva contraseña
        </Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>

      <SubmitButton pendingText="Actualizando…">
        Cambiar contraseña
      </SubmitButton>
    </form>
  );
}
