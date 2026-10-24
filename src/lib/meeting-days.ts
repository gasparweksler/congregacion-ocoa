// ============================================================================
//  Días de reunión de una congregación.
//
//  Cada congregación tiene los suyos: una reunión entre semana (lunes a
//  viernes) y una de fin de semana (sábado o domingo). Antes estaban fijos en
//  el código (jueves y sábado).
//
//  No es un Server Action a propósito: en un archivo "use server" todo lo
//  exportado queda invocable desde el navegador con cualquier argumento, y
//  esta función recibe el id de la congregación.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { DEFAULT_MEETING_DAYS, type MeetingDays } from "@/lib/constants";

export async function getMeetingDays(
  congregationId: string,
): Promise<MeetingDays> {
  const c = await prisma.congregation.findUnique({
    where: { id: congregationId },
    select: { midweekDay: true, weekendDay: true },
  });
  // Sin congregación (no debería ocurrir dentro de la app) se usan los de
  // siempre, para no dejar la pantalla sin fechas.
  return c
    ? { midweekDay: c.midweekDay, weekendDay: c.weekendDay }
    : DEFAULT_MEETING_DAYS;
}
