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
  const isAdmin = role === ROLES.SECRETARIO;

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

      {needsGroup || isAdmin ? (
        <div>
          <Label htmlFor="groupId" required={needsGroup}>
            {needsGroup ? "Grupo" : "Grupo (opcional)"}
          </Label>
          <Select
            id="groupId"
            name="groupId"
            defaultValue=""
            required={needsGroup}
          >
            <option value="">
              {needsGroup ? "Selecciona un grupo" : "Sin grupo"}
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

      {isAdmin ? (
        <div>
          <Label htmlFor="groupRoleLabel">
            Etiqueta en el grupo (opcional)
          </Label>
          <Select id="groupRoleLabel" name="groupRoleLabel" defaultValue="">
            <option value="">— Ninguna —</option>
            <option value={ROLES.SUPERINTENDENTE}>Superintendente de Grupo</option>
            <option value={ROLES.AUXILIAR}>Auxiliar de Grupo</option>
          </Select>
          <p className="mt-1 text-xs text-muted">
            Solo es una designación visible; el Administrador conserva acceso
            total.
          </p>
        </div>
      ) : null}

      {needsGroup ? (
        <label className="flex items-start gap-2 rounded-lg border border-border bg-slate-50 p-2.5 text-sm text-foreground">
          <input
            type="checkbox"
            name="alsoConfirmador"
            className="mt-0.5 h-4 w-4 rounded border-border"
          />
          <span>
            También <strong>Encargado de Confirmaciones</strong>
            <span className="block text-xs text-muted">
              Le da acceso a la sección Reuniones además de Informes.
            </span>
          </span>
        </label>
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
