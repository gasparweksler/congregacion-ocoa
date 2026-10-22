"use server";

// ============================================================================
//  Administración de la PLATAFORMA (solo Superadministrador)
//  Crear y administrar congregaciones y el primer Administrador de cada una.
//  Ninguna de estas acciones entra a los datos internos de una congregación:
//  publicadores, informes y reuniones siguen siendo cosa de su Administrador.
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSuperadmin } from "@/lib/access";
import { ROLES } from "@/lib/constants";
import { hashPassword } from "@/lib/password";
import { logAudit } from "@/lib/audit";
import { type FormState, isUniqueViolation } from "@/server/actions-shared";

/** Convierte un nombre en identificador corto para enlaces ("Ocoa" -> "ocoa"). */
function toSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Crea una congregación junto con su primer Administrador. */
export async function createCongregationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireSuperadmin();

  const name = String(formData.get("name") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "").trim();
  const adminName = String(formData.get("adminName") ?? "").trim();
  const adminUser = String(formData.get("adminUser") ?? "").trim();
  const adminPass = String(formData.get("adminPass") ?? "");

  if (name.length < 3) return { error: "Escribe el nombre de la congregación." };
  if (adminName.length < 3)
    return { error: "Escribe el nombre del Administrador." };
  if (adminUser.length < 3)
    return { error: "El nombre de usuario debe tener al menos 3 caracteres." };
  if (adminPass.length < 8)
    return { error: "La contraseña debe tener al menos 8 caracteres." };

  const slug = toSlug(slugRaw || name);
  if (!slug) return { error: "El identificador no es válido." };

  // Comprobaciones con mensaje claro (la base también las impide).
  if (await prisma.congregation.findFirst({ where: { OR: [{ name }, { slug }] } })) {
    return { error: "Ya existe una congregación con ese nombre o identificador." };
  }
  if (await prisma.user.findUnique({ where: { username: adminUser } })) {
    return {
      error:
        "Ese nombre de usuario ya está en uso en la plataforma. Elige otro (por ejemplo, con el nombre de la congregación delante).",
    };
  }

  try {
    // Congregación y su Administrador en una sola operación: nunca queda una
    // congregación a la que nadie pueda entrar.
    const congregation = await prisma.congregation.create({
      data: {
        name,
        slug,
        users: {
          create: {
            name: adminName,
            username: adminUser,
            passwordHash: await hashPassword(adminPass),
            plainPassword: adminPass,
            role: ROLES.SECRETARIO,
            mustChangePassword: true, // la cambia en su primer ingreso
          },
        },
      },
    });

    await logAudit({
      userId: actor.id,
      congregationId: congregation.id,
      action: "CREAR",
      entity: "Congregacion",
      entityId: congregation.id,
      details: `Congregación creada: ${name} (${slug}). Administrador: ${adminUser}.`,
    });

    revalidatePath("/plataforma");
    return {
      success: `Congregación "${name}" creada con el administrador "${adminUser}".`,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "Ya existe una congregación o un usuario con esos datos." };
    }
    throw error;
  }
}

/** Activa o desactiva una congregación (sus usuarios no podrán entrar). */
export async function setCongregationActiveAction(
  formData: FormData,
): Promise<void> {
  const actor = await requireSuperadmin();
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "1";
  if (!id) return;

  const congregation = await prisma.congregation.update({
    where: { id },
    data: { active },
    select: { name: true },
  });

  await logAudit({
    userId: actor.id,
    congregationId: id,
    action: "EDITAR",
    entity: "Congregacion",
    entityId: id,
    details: `Congregación ${active ? "activada" : "desactivada"}: ${congregation.name}.`,
  });

  revalidatePath("/plataforma");
}

/** Renombra una congregación (el identificador de los enlaces no cambia). */
export async function renameCongregationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireSuperadmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id) return { error: "Congregación no especificada." };
  if (name.length < 3) return { error: "Escribe el nombre de la congregación." };

  const dup = await prisma.congregation.findFirst({
    where: { name, NOT: { id } },
    select: { id: true },
  });
  if (dup) return { error: "Ya existe otra congregación con ese nombre." };

  await prisma.congregation.update({ where: { id }, data: { name } });

  await logAudit({
    userId: actor.id,
    congregationId: id,
    action: "EDITAR",
    entity: "Congregacion",
    entityId: id,
    details: `Congregación renombrada a: ${name}.`,
  });

  revalidatePath("/plataforma");
  return { success: "Congregación actualizada." };
}

/**
 * Restablece la contraseña del Administrador de una congregación. Pensado para
 * cuando pierde el acceso: se le obliga a cambiarla en el siguiente ingreso.
 */
export async function resetCongregationAdminPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireSuperadmin();
  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!userId) return { error: "Usuario no especificado." };
  if (password.length < 8)
    return { error: "La contraseña debe tener al menos 8 caracteres." };

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, congregationId: true, role: true },
  });
  if (!target) return { error: "Usuario no encontrado." };
  // Solo contraseñas de administradores de congregación, no de cualquiera.
  if (target.role !== ROLES.SECRETARIO) {
    return {
      error:
        "Desde la plataforma solo se restablece la contraseña del Administrador de la congregación.",
    };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(password),
      plainPassword: password,
      mustChangePassword: true,
    },
  });

  await logAudit({
    userId: actor.id,
    congregationId: target.congregationId,
    action: "CAMBIAR_PASSWORD",
    entity: "Usuario",
    entityId: userId,
    details: `Contraseña restablecida desde la plataforma: ${target.username}.`,
  });

  revalidatePath("/plataforma");
  return { success: `Contraseña de "${target.username}" restablecida.` };
}
