"use server";

// ============================================================================
//  Server Actions de Usuarios (solo Secretario)
//  Crear, editar y eliminar Secretarios, Superintendentes y Auxiliares.
//  Soporta "designación temporal": basta crear/activar otro usuario en el grupo.
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSecretary, targetCongregationId } from "@/lib/access";
import { hashPassword } from "@/lib/password";
import { createUserSchema, updateUserSchema } from "@/lib/validations";
import { ROLES, GROUP_ROLES, roleLabel, type Role } from "@/lib/constants";
import { logAudit } from "@/lib/audit";
import { type FormState, sinDuplicar } from "@/server/actions-shared";

// Normaliza el groupId según el rol. Super/Aux siempre tienen grupo; el
// Administrador PUEDE tener grupo (designación opcional); Responsable no.
function resolveGroupId(role: string, groupId: string | null | undefined) {
  if (GROUP_ROLES.includes(role as Role)) return groupId || null;
  if (role === ROLES.SECRETARIO) return groupId || null;
  return null; // RESPONSABLE_CONFIRMACIONES
}

// Etiqueta secundaria (Superintendente/Auxiliar) solo aplica al Administrador y
// solo si tiene un grupo asignado.
function resolveGroupRoleLabel(
  role: string,
  groupId: string | null,
  label: string | null | undefined,
) {
  if (role !== ROLES.SECRETARIO || !groupId) return null;
  return label === ROLES.SUPERINTENDENTE || label === ROLES.AUXILIAR
    ? label
    : null;
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
    alsoConfirmador: formData.get("alsoConfirmador") === "on",
    groupRoleLabel: formData.get("groupRoleLabel") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const data = parsed.data;

  const exists = await prisma.user.findUnique({
    where: { username: data.username },
  });
  if (exists) return { error: "Ese nombre de usuario ya está en uso." };

  // Congregación destino: la propia, o la que indique el Superadmin desde el
  // panel de Plataforma. targetCongregationId ignora el dato si no lo es.
  const cong = targetCongregationId(actor, String(formData.get("congregacion") ?? ""));
  const groupId = resolveGroupId(data.role, data.groupId);
  // El grupo debe existir Y pertenecer a la misma congregación.
  if (groupId) {
    const g = await prisma.group.findFirst({
      where: { id: groupId, congregationId: cong },
    });
    if (!g) return { error: "El grupo seleccionado no existe." };
  }

  // La capacidad "también Confirmaciones" solo aplica a Super/Aux.
  const alsoConfirmador =
    GROUP_ROLES.includes(data.role as Role) && !!data.alsoConfirmador;
  const groupRoleLabel = resolveGroupRoleLabel(
    data.role,
    groupId,
    data.groupRoleLabel,
  );

  // El usuario es único en toda la plataforma: dos congregaciones pueden
  // intentar el mismo nombre a la vez y las dos verlo libre. Se avisa igual.
  const passwordHash = await hashPassword(data.password);
  const alta = await sinDuplicar(
    () =>
      prisma.user.create({
        data: {
          name: data.name,
          username: data.username,
          passwordHash,
          plainPassword: data.password,
          role: data.role,
          groupId,
          congregationId: cong,
          mustChangePassword: data.mustChangePassword ?? false,
          alsoConfirmador,
          groupRoleLabel,
        },
      }),
    "Ese nombre de usuario ya está en uso.",
  );
  if (!alta.ok) return { error: alta.error };
  const created = alta.valor;

  await logAudit({
    userId: actor.id,
    action: "CREAR",
    entity: "Usuario",
    entityId: created.id,
    details: `Usuario creado: ${created.username} (${roleLabel(created.role)})`,
  });

  revalidatePath("/usuarios");
  revalidatePath("/plataforma");
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
    alsoConfirmador: formData.get("alsoConfirmador") === "on",
    groupRoleLabel: formData.get("groupRoleLabel") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const data = parsed.data;

  const cong = targetCongregationId(actor, String(formData.get("congregacion") ?? ""));
  const target = await prisma.user.findFirst({
    where: { id: data.id, congregationId: cong },
  });
  if (!target) return { error: "Usuario no encontrado." };

  // El usuario no puede desactivarse a sí mismo (se quedaría fuera): su cuenta
  // se mantiene siempre activa al editar su propia ficha.
  const active = target.id === actor.id ? true : (data.active ?? true);

  // Username único (excepto el propio).
  const dup = await prisma.user.findFirst({
    where: { username: data.username, NOT: { id: data.id } },
  });
  if (dup) return { error: "Ese nombre de usuario ya está en uso." };

  const groupId = resolveGroupId(data.role, data.groupId);
  if (groupId) {
    const g = await prisma.group.findFirst({
      where: { id: groupId, congregationId: cong },
    });
    if (!g) return { error: "El grupo seleccionado no existe." };
  }

  const alsoConfirmador =
    GROUP_ROLES.includes(data.role as Role) && !!data.alsoConfirmador;
  const groupRoleLabel = resolveGroupRoleLabel(
    data.role,
    groupId,
    data.groupRoleLabel,
  );

  // La contraseña se cifra antes: dentro del callback no cabe un await suelto.
  const nuevaClave = data.newPassword
    ? {
        passwordHash: await hashPassword(data.newPassword),
        plainPassword: data.newPassword,
        mustChangePassword: true,
      }
    : {};

  // Cambiar el nombre de usuario puede chocar con otro recién creado.
  const cambio = await sinDuplicar(
    () =>
      prisma.user.updateMany({
        where: { id: data.id, congregationId: cong },
        data: {
          name: data.name,
          username: data.username,
          role: data.role,
          groupId,
          active,
          alsoConfirmador,
          groupRoleLabel,
          // Si se ingresó una nueva contraseña, se restablece y se obliga a cambiarla.
          ...nuevaClave,
        },
      }),
    "Ese nombre de usuario ya está en uso.",
  );
  if (!cambio.ok) return { error: cambio.error };

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
  revalidatePath("/plataforma");
  return { success: "Usuario actualizado." };
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  const actor = await requireSecretary();
  const id = String(formData.get("id") ?? "");
  if (!id || id === actor.id) return; // nunca eliminarse a sí mismo

  const cong = targetCongregationId(actor, String(formData.get("congregacion") ?? ""));
  const target = await prisma.user.findFirst({
    where: { id, congregationId: cong },
    select: { username: true, role: true },
  });
  if (!target) return;

  // Evitar eliminar al último Administrador de ESTA congregación.
  if (target.role === ROLES.SECRETARIO) {
    const secretarios = await prisma.user.count({
      where: { role: ROLES.SECRETARIO, congregationId: cong },
    });
    if (secretarios <= 1) return;
  }

  await prisma.user.deleteMany({ where: { id, congregationId: cong } });

  await logAudit({
    userId: actor.id,
    action: "ELIMINAR",
    entity: "Usuario",
    entityId: id,
    details: `Usuario eliminado: ${target.username}`,
  });

  revalidatePath("/usuarios");
  revalidatePath("/plataforma");
}
