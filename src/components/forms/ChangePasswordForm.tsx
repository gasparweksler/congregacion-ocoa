"use client";

import { useActionState } from "react";
import {
  changePasswordAction,
  type ActionState,
} from "@/server/auth-actions";
import { Label, Input, Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

const initial: ActionState = {};

export function ChangePasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

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
