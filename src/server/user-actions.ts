"use server";

// ============================================================================
//  Server Actions de Usuarios (solo Secretario)
//  Crear, editar y eliminar Secretarios, Superintendentes y Auxiliares.
//  Soporta "designación temporal": basta crear/activar otro usuario en el grupo.
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSecretary } from "@/lib/access";
import { hashPassword } from "@/lib/password";
import { createUserSchema, updateUserSchema } from "@/lib/validations";
import { ROLES, GROUP_ROLES, roleLabel, type Role } from "@/lib/constants";
import { logAudit } from "@/lib/audit";
import { type FormState } from "@/server/actions-shared";

// Normaliza el groupId según el rol: el Secretario nunca tiene grupo.
function resolveGroupId(role: string, groupId: string | null | undefined) {
  if (GROUP_ROLES.includes(role as Role)) return groupId || null;
  return null; // SECRETARIO
}

export async function createUserAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireSecretary();

  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    username: formData.get("username"),
    password: formData.get("password"),
    role: formData.get("role"),
    groupId: formData.get("groupId") || null,
    mustChangePassword: formData.get("mustChangePassword") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const data = parsed.data;

  const exists = await prisma.user.findUnique({
    where: { username: data.username },
  });
  if (exists) return { error: "Ese nombre de usuario ya está en uso." };

  const groupId = resolveGroupId(data.role, data.groupId);
  // Verificar que el grupo exista cuando corresponde.
  if (groupId) {
    const g = await prisma.group.findUnique({ where: { id: groupId } });
    if (!g) return { error: "El grupo seleccionado no existe." };
  }

  const created = await prisma.user.create({
    data: {
      name: data.name,
      username: data.username,
      passwordHash: await hashPassword(data.password),
      role: data.role,
      groupId,
      mustChangePassword: data.mustChangePassword ?? false,
    },
  });

  await logAudit({
    userId: actor.id,
    action: "CREAR",
    entity: "Usuario",
    entityId: created.id,
    details: `Usuario creado: ${created.username} (${roleLabel(created.role)})`,
  });

  revalidatePath("/usuarios");
  return { success: `Usuario "${created.username}" creado.` };
}

export async function updateUserAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireSecretary();

  const parsed = updateUserSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    username: formData.get("username"),
    role: formData.get("role"),
    groupId: formData.get("groupId") || null,
    active: formData.get("active") === "on",
    newPassword: formData.get("newPassword") || "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const data = parsed.data;

  const target = await prisma.user.findUnique({ where: { id: data.id } });
  if (!target) return { error: "Usuario no encontrado." };

  // No permitir que el Secretario se desactive a sí mismo (se quedaría fuera).
  if (target.id === actor.id && !data.active) {
    return { error: "No puedes desactivar tu propia cuenta." };
  }

  // Username único (excepto el propio).
  const dup = await prisma.user.findFirst({
    where: { username: data.username, NOT: { id: data.id } },
  });
  if (dup) return { error: "Ese nombre de usuario ya está en uso." };

  const groupId = resolveGroupId(data.role, data.groupId);
  if (groupId) {
    const g = await prisma.group.findUnique({ where: { id: groupId } });
    if (!g) return { error: "El grupo seleccionado no existe." };
  }

  await prisma.user.update({
    where: { id: data.id },
    data: {
      name: data.name,
      username: data.username,
      role: data.role,
      groupId,
      active: data.active ?? true,
      // Si se ingresó una nueva contraseña, se restablece y se obliga a cambiarla.
      ...(data.newPassword
        ? {
            passwordHash: await hashPassword(data.newPassword),
            mustChangePassword: true,
          }
        : {}),
    },
  });

  await logAudit({
    userId: actor.id,
    action: "EDITAR",
    entity: "Usuario",
    entityId: data.id,
    details: `Usuario actualizado: ${data.username}${
      data.newPassword ? " (contraseña restablecida)" : ""
    }`,
  });

  revalidatePath("/usuarios");
  return { success: "Usuario actualizado." };
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  const actor = await requireSecretary();
  const id = String(formData.get("id") ?? "");
  if (!id || id === actor.id) return; // nunca eliminarse a sí mismo

  const target = await prisma.user.findUnique({
    where: { id },
    select: { username: true, role: true },
  });
  if (!target) return;

  // Evitar eliminar al último Secretario activo del sistema.
  if (target.role === ROLES.SECRETARIO) {
    const secretarios = await prisma.user.count({
      where: { role: ROLES.SECRETARIO },
    });
    if (secretarios <= 1) return;
  }

  await prisma.user.delete({ where: { id } });

  await logAudit({
    userId: actor.id,
    action: "ELIMINAR",
    entity: "Usuario",
    entityId: id,
    details: `Usuario eliminado: ${target.username}`,
  });

  revalidatePath("/usuarios");
}
