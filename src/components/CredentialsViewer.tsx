"use client";

// ============================================================================
//  Visor de Credenciales (cliente)
//  Pide la pregunta de seguridad y, si la respuesta es correcta, muestra la
//  tabla de usuarios con su contraseña. La lista solo se obtiene del servidor
//  tras responder bien (nunca viaja al navegador antes).
// ============================================================================

import { useActionState, useState } from "react";
import {
  revealCredentialsAction,
  type CredentialsState,
} from "@/server/credentials-actions";
import { Label, Input, Alert, Badge, Table, Th, Td, Button } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

const initial: CredentialsState = {};

export function CredentialsViewer() {
  const [state, formAction] = useActionState(revealCredentialsAction, initial);
  const [hidden, setHidden] = useState(false);

  const revealed = state.rows && !hidden;

  if (revealed) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Alert tone="warning">
            Información confidencial. No la compartas ni la dejes visible.
          </Alert>
        </div>

        <Table>
          <thead>
            <tr>
              <Th>Nombre</Th>
              <Th>Usuario</Th>
              <Th>Rol</Th>
              <Th>Grupo</Th>
              <Th>Contraseña</Th>
            </tr>
          </thead>
          <tbody>
            {state.rows!.map((r) => (
              <tr key={r.username} className={r.active ? "" : "opacity-50"}>
                <Td>{r.name}</Td>
                <Td className="font-mono">{r.username}</Td>
                <Td>
                  <Badge>{r.roleLabel}</Badge>
                </Td>
                <Td>{r.groupName ?? "—"}</Td>
                <Td className="font-mono font-semibold">
                  {r.password ?? (
                    <span className="font-sans text-xs font-normal text-muted">
                      (no registrada — se verá al próximo cambio)
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>

        <Button variant="secondary" onClick={() => setHidden(true)}>
          Ocultar credenciales
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="max-w-md space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <p className="text-sm text-muted">
        Por seguridad, responde la siguiente pregunta para ver los usuarios y
        sus contraseñas.
      </p>

      <div>
        <Label htmlFor="answer" required>
          ¿Cuál es el N.º de la Congregación Ocoa?
        </Label>
        <Input
          id="answer"
          name="answer"
          type="password"
          autoComplete="off"
          inputMode="numeric"
          placeholder="Escribe la respuesta"
          required
        />
      </div>

      <SubmitButton pendingText="Verificando…">Ver credenciales</SubmitButton>
    </form>
  );
}
