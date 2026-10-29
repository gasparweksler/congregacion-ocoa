// ============================================================================
//  El nombre de la congregación tal como sale impreso.
//
//  Todos los PDF que genera la aplicación lo llevan debajo del título, para
//  que un programa impreso se sepa de quién es: la misma plataforma la usan
//  varias congregaciones y los papeles se mezclan.
//
//  En la base el nombre va a secas ("Ocoa", "Tornagaleones"), así que aquí se
//  le antepone "Congregación". Si alguien ya lo guardó con esa palabra, no se
//  repite.
// ============================================================================

import { prisma } from "@/lib/prisma";

/** "Ocoa" → "Congregación Ocoa". Vacío si no hay nombre. */
export function congregationLabel(name: string | null | undefined): string {
  const limpio = (name ?? "").replace(/\s+/g, " ").trim();
  if (!limpio) return "";
  // Sin tildes y en minúsculas, para reconocer "CONGREGACION OCOA" igual.
  const plano = limpio
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  return plano.startsWith("congregacion ") ? limpio : `Congregación ${limpio}`;
}

/**
 * Lo mismo, leyendo el nombre de la base.
 *
 * Se lee en vez de tomarlo de la sesión porque el nombre de la sesión se fija
 * al entrar: si la congregación se renombra, quien ya estaba dentro seguiría
 * imprimiendo el nombre viejo hasta volver a entrar. En un papel que se
 * reparte, eso confunde.
 */
export async function congregationLabelOf(
  congregationId: string,
): Promise<string> {
  const c = await prisma.congregation.findUnique({
    where: { id: congregationId },
    select: { name: true },
  });
  return congregationLabel(c?.name);
}
