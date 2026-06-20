"use server";

// ============================================================================
//  Server Actions de autenticación
//  - loginAction: valida credenciales e inicia sesión (NextAuth).
//  - logoutAction: cierra sesión.
//  - changePasswordAction: cambia la contraseña del usuario en sesión.
// ============================================================================

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/access";
import { hashPassword, verifyPassword } from "@/lib/password";
import { loginSchema, changePasswordSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

export type ActionState = { error?: string; success?: string };

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  try {
    await signIn("credentials", {
      username: parsed.data.username,
      password: parsed.data.password,
      redirectTo: "/panel",
    });
  } catch (error) {
    // NextAuth lanza un redirect en caso de éxito: debe propagarse.
    if (error instanceof AuthError) {
      return { error: "Usuario o contraseña incorrectos." };
    }
    throw error;
  }
  return {};
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return { error: "Usuario no encontrado." };

  const ok = await verifyPassword(
    parsed.data.currentPassword,
    dbUser.passwordHash,
  );
  if (!ok) return { error: "La contraseña actual no es correcta." };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(parsed.data.newPassword),
      mustChangePassword: false,
    },
  });

  await logAudit({
    userId: user.id,
    action: "CAMBIAR_PASSWORD",
    entity: "Usuario",
    entityId: user.id,
    details: "El usuario cambió su propia contraseña.",
  });

  return { success: "Contraseña actualizada correctamente." };
}
