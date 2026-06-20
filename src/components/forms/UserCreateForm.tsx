"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createUserAction } from "@/server/user-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Label, Input, Select, Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ROLES, ROLE_LABELS, GROUP_ROLES } from "@/lib/constants";

type GroupOption = { id: string; name: string };

export function UserCreateForm({ groups }: { groups: GroupOption[] }) {
  const [state, action] = useActionState(createUserAction, EMPTY_FORM_STATE);
  const [role, setRole] = useState<string>(ROLES.SUPERINTENDENTE);
  const formRef = useRef<HTMLFormElement>(null);

  const needsGroup = GROUP_ROLES.includes(role as never);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setRole(ROLES.SUPERINTENDENTE);
    }
  }, [state.success]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <div>
        <Label htmlFor="name" required>
          Nombre completo
        </Label>
        <Input id="name" name="name" required />
      </div>

      <div>
        <Label htmlFor="username" required>
          Usuario (para ingresar)
        </Label>
        <Input id="username" name="username" autoComplete="off" required />
      </div>

      <div>
        <Label htmlFor="password" required>
          Contraseña inicial
        </Label>
        <Input
          id="password"
          name="password"
          type="text"
          autoComplete="off"
          placeholder="mínimo 6 caracteres"
          required
        />
      </div>

      <div>
        <Label htmlFor="role" required>
          Rol
        </Label>
        <Select
          id="role"
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          {Object.values(ROLES).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </div>

      {needsGroup ? (
        <div>
          <Label htmlFor="groupId" required>
            Grupo
          </Label>
          <Select id="groupId" name="groupId" defaultValue="" required>
            <option value="" disabled>
              Selecciona un grupo
            </option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
          {groups.length === 0 ? (
            <p className="mt-1 text-xs text-amber-600">
              Primero crea un grupo en la sección “Grupos”.
            </p>
          ) : null}
        </div>
      ) : null}

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          name="mustChangePassword"
          defaultChecked
          className="h-4 w-4 rounded border-border"
        />
        Pedir que cambie la contraseña al primer ingreso
      </label>

      <SubmitButton pendingText="Creando…">Crear usuario</SubmitButton>
    </form>
  );
}
