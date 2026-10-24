// ============================================================================
//  Lectura de los hermanos disponibles por responsabilidad.
//
//  No es un Server Action a propósito: en un archivo "use server" todo lo
//  exportado queda invocable desde el navegador con cualquier argumento, y
//  estas funciones reciben el id de la congregación.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { RESP_CATEGORY_KEYS } from "@/lib/constants";

export type VolunteerEntry = {
  publisherId: string;
  name: string;
  groupName: string | null;
};

/** Los disponibles de cada categoría, ordenados por nombre. */
export async function getVolunteersByCategory(
  congregationId: string,
): Promise<Record<string, VolunteerEntry[]>> {
  const filas = await prisma.responsibilityVolunteer.findMany({
    where: { congregationId, category: { in: RESP_CATEGORY_KEYS } },
    select: {
      category: true,
      publisherId: true,
      publisher: { select: { fullName: true, group: { select: { name: true } } } },
    },
    orderBy: { publisher: { fullName: "asc" } },
  });

  const out: Record<string, VolunteerEntry[]> = {};
  for (const k of RESP_CATEGORY_KEYS) out[k] = [];
  for (const f of filas) {
    out[f.category]?.push({
      publisherId: f.publisherId,
      name: f.publisher.fullName,
      groupName: f.publisher.group?.name ?? null,
    });
  }
  return out;
}
