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
  alsoConfirmador: boolean;
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

/** Exige rol de Administrador (antes "Secretario"). Si no, redirige al inicio. */
export async function requireSecretary(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== ROLES.SECRETARIO) redirect(landingFor(user));
  return user;
}

/** ¿El usuario es Administrador (acceso total)? */
export function isSecretary(user: SessionUser): boolean {
  return user.role === ROLES.SECRETARIO;
}

/**
 * ¿El usuario tiene el rol de Confirmaciones? (rol base Responsable, o cualquier
 * usuario con la capacidad adicional `alsoConfirmador`).
 */
export function isConfirmador(user: SessionUser): boolean {
  return user.role === ROLES.RESPONSABLE_CONFIRMACIONES || user.alsoConfirmador;
}

/** ¿Puede acceder a la sección Reuniones? (Administrador o Confirmaciones). */
export function canAccessMeetings(user: SessionUser): boolean {
  return isSecretary(user) || isConfirmador(user);
}

/** ¿Puede acceder a la sección Informes? (Administrador, Superintendente, Auxiliar). */
export function canAccessReports(user: SessionUser): boolean {
  return user.role !== ROLES.RESPONSABLE_CONFIRMACIONES;
}

/**
 * Página de inicio según el rol:
 * - Quien tiene acceso a Informes (Administrador, Superintendente, Auxiliar,
 *   incluso si además confirma) -> Panel.
 * - Responsable de Confirmaciones "puro" (sin Informes) -> Reuniones.
 */
export function landingFor(user: SessionUser): string {
  return canAccessReports(user) ? "/panel" : "/reuniones";
}

/** Exige acceso a la sección Reuniones; si no, redirige al inicio del rol. */
export async function requireMeetingsAccess(): Promise<SessionUser> {
  const user = await requireUser();
  if (!canAccessMeetings(user)) redirect(landingFor(user));
  return user;
}

/** Exige acceso a la sección Informes; si no, redirige a Reuniones. */
export async function requireReportsAccess(): Promise<SessionUser> {
  const user = await requireUser();
  if (!canAccessReports(user)) redirect(landingFor(user));
  return user;
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
