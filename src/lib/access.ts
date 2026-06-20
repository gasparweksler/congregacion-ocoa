// ============================================================================
//  Control de acceso (autorización)
//  Helpers que se usan en Server Components y Server Actions para garantizar
//  que cada operación respeta el rol y el grupo del usuario.
//
//  Regla de oro: un Superintendente o Auxiliar SOLO puede ver/editar su propio
//  grupo. El Secretario puede todo.
// ============================================================================

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ROLES, type Role } from "@/lib/constants";

export type SessionUser = {
  id: string;
  name?: string | null;
  username: string;
  role: Role;
  groupId: string | null;
  mustChangePassword: boolean;
};

/** Devuelve el usuario de la sesión o null si no hay sesión. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user) return null;
  return session.user as SessionUser;
}

/**
 * Exige una sesión activa. Si no hay, redirige a /login.
 * Devuelve el usuario autenticado.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Exige rol de Secretario. Si no lo es, redirige al panel. */
export async function requireSecretary(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== ROLES.SECRETARIO) redirect("/panel");
  return user;
}

/** ¿El usuario es Secretario (administrador general)? */
export function isSecretary(user: SessionUser): boolean {
  return user.role === ROLES.SECRETARIO;
}

/**
 * Comprueba si el usuario puede acceder a la información de un grupo concreto.
 * - Secretario: cualquier grupo.
 * - Superintendente/Auxiliar: únicamente su grupo.
 */
export function canAccessGroup(user: SessionUser, groupId: string): boolean {
  if (user.role === ROLES.SECRETARIO) return true;
  return user.groupId === groupId;
}

/**
 * Exige acceso a un grupo; lanza error (403) si no está permitido.
 * Pensado para usarse dentro de Server Actions.
 */
export function assertGroupAccess(user: SessionUser, groupId: string): void {
  if (!canAccessGroup(user, groupId)) {
    throw new Error("No tienes permiso para acceder a este grupo.");
  }
}

/**
 * Devuelve el groupId al que está limitado el usuario para consultas:
 * - Secretario: null (sin límite, ve todo).
 * - Resto: su groupId.
 */
export function scopedGroupId(user: SessionUser): string | null {
  return user.role === ROLES.SECRETARIO ? null : user.groupId;
}
