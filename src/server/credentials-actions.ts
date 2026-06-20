"use server";

// ============================================================================
//  Server Action: Ver Credenciales (solo Secretario)
//  Muestra la lista de usuarios con su contraseña, protegida por una pregunta
//  de seguridad. Doble barrera:
//    1) Requiere sesión activa de Secretario (requireSecretary).
//    2) Requiere responder correctamente la pregunta de seguridad.
//  Cada consulta exitosa queda registrada en la auditoría.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { requireSecretary } from "@/lib/access";
import { roleLabel } from "@/lib/constants";
import { logAudit } from "@/lib/audit";

// Respuesta esperada (configurable por variable de entorno; por defecto 9233).
const RESPUESTA_ESPERADA = process.env.CREDENCIALES_RESPUESTA ?? "9233";

export type CredentialRow = {
  name: string;
  username: string;
  roleLabel: string;
  groupName: string | null;
  password: string | null;
  active: boolean;
};

export type CredentialsState = {
  error?: string;
  rows?: CredentialRow[];
};

export async function revealCredentialsAction(
  _prev: CredentialsState,
  formData: FormData,
): Promise<CredentialsState> {
  const actor = await requireSecretary();

  const answer = String(formData.get("answer") ?? "").trim();
  if (!answer) {
    return { error: "Escribe la respuesta a la pregunta de seguridad." };
  }

  // Comparación tolerante (sin distinguir espacios sobrantes).
  if (answer !== RESPUESTA_ESPERADA) {
    await logAudit({
      userId: actor.id,
      action: "VER_CREDENCIALES",
      entity: "Usuario",
      details: "Intento fallido de ver credenciales (respuesta incorrecta).",
    });
    return { error: "Respuesta incorrecta. No se mostraron las credenciales." };
  }

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      name: true,
      username: true,
      role: true,
      active: true,
      plainPassword: true,
      group: { select: { name: true } },
    },
  });

  await logAudit({
    userId: actor.id,
    action: "VER_CREDENCIALES",
    entity: "Usuario",
    details: `Consultó las credenciales de ${users.length} usuario(s).`,
  });

  return {
    rows: users.map((u) => ({
      name: u.name,
      username: u.username,
      roleLabel: roleLabel(u.role),
      groupName: u.group?.name ?? null,
      password: u.plainPassword,
      active: u.active,
    })),
  };
}
