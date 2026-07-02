"use client";

import { useActionState, useEffect, useState } from "react";
import { updateUserAction, deleteUserAction } from "@/server/user-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Label, Input, Select, Button, Badge, Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ROLES, ROLE_LABELS, GROUP_ROLES, roleLabel } from "@/lib/constants";

type GroupOption = { id: string; name: string };
export type UserRowData = {
  id: string;
  name: string;
  username: string;
  role: string;
  groupId: string | null;
  groupName: string | null;
  active: boolean;
  alsoConfirmador: boolean;
  groupRoleLabel: string | null;
};

export function UserRow({
  user,
  groups,
  isSelf,
}: {
  user: UserRowData;
  groups: GroupOption[];
  isSelf: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState(updateUserAction, EMPTY_FORM_STATE);
  const [role, setRole] = useState(user.role);

  useEffect(() => {
    if (state.success) setEditing(false);
  }, [state.success]);

  const needsGroup = GROUP_ROLES.includes(role as never);
  const isAdmin = role === ROLES.SECRETARIO;

  if (!editing) {
    return (
      <div className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{user.name}</span>
            {!user.active ? <Badge tone="red">Inactivo</Badge> : null}
            {isSelf ? <Badge tone="blue">Tú</Badge> : null}
          </div>
          <p className="text-sm text-muted">
            Usuario: <span className="font-mono">{user.username}</span> ·{" "}
            {roleLabel(user.role)}
            {user.groupName ? ` · ${user.groupName}` : ""}
          </p>
          {user.alsoConfirmador ? (
            <span className="mt-1 inline-block">
              <Badge tone="violet">+ Encargado de Confirmaciones</Badge>
            </span>
          ) : null}
          {user.role === ROLES.SECRETARIO &&
          user.groupRoleLabel &&
          user.groupName ? (
            <span className="mt-1 inline-block">
              <Badge tone="slate">
                {roleLabel(user.groupRoleLabel)} · {user.groupName}
              </Badge>
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md px-2.5 py-1 text-sm font-medium text-primary hover:bg-indigo-50"
          >
            Editar
          </button>
          {!isSelf ? (
            <ConfirmButton
              action={deleteUserAction}
              hidden={{ id: user.id }}
              confirmText={`¿Eliminar al usuario "${user.username}"? Esta acción no se puede deshacer.`}
            >
              Eliminar
            </ConfirmButton>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="border-l-4 border-primary bg-slate-50 px-5 py-4">
      <form action={action} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="id" value={user.id} />
        {state.error ? (
          <div className="sm:col-span-2">
            <Alert tone="error">{state.error}</Alert>
          </div>
        ) : null}

        <div>
          <Label required>Nombre completo</Label>
          <Input name="name" defaultValue={user.name} required />
        </div>
        <div>
          <Label required>Usuario</Label>
          <Input name="username" defaultValue={user.username} required />
        </div>
        <div>
          <Label required>Rol</Label>
          <Select
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
        <div>
          <Label>
            Grupo{" "}
            {needsGroup ? "" : isAdmin ? "(opcional)" : "(no aplica)"}
          </Label>
          <Select
            name="groupId"
            defaultValue={user.groupId ?? ""}
            disabled={!needsGroup && !isAdmin}
          >
            <option value="">— Sin grupo —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </div>

        {isAdmin ? (
          <div>
            <Label>Etiqueta en el grupo (opcional)</Label>
            <Select
              name="groupRoleLabel"
              defaultValue={user.groupRoleLabel ?? ""}
            >
              <option value="">— Ninguna —</option>
              <option value={ROLES.SUPERINTENDENTE}>
                Superintendente de Grupo
              </option>
              <option value={ROLES.AUXILIAR}>Auxiliar de Grupo</option>
            </Select>
          </div>
        ) : null}
        <div>
          <Label>Restablecer contraseña (opcional)</Label>
          <Input
            name="newPassword"
            type="text"
            autoComplete="off"
            placeholder="Dejar vacío para no cambiar"
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              name="active"
              defaultChecked={user.active}
              disabled={isSelf}
              className="h-4 w-4 rounded border-border"
            />
            Cuenta activa
          </label>
        </div>

        {needsGroup ? (
          <label className="flex items-start gap-2 text-sm text-foreground sm:col-span-2">
            <input
              type="checkbox"
              name="alsoConfirmador"
              defaultChecked={user.alsoConfirmador}
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

        <div className="flex gap-2 sm:col-span-2">
          <SubmitButton pendingText="Guardando…">Guardar cambios</SubmitButton>
          <Button variant="secondary" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
