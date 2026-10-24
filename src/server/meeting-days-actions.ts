"use server";

// ============================================================================
//  Guardar los días de reunión de la congregación.
//
//  Cambiarlos NO mueve ninguna reunión ya creada: afecta a las fechas que se
//  ofrecen de ahí en adelante (responsabilidades del mes, nuevas reuniones).
//  Es configuración de la congregación, así que la cambia el Administrador.
//  La lectura vive en src/lib/meeting-days.ts (no puede ser un Server Action).
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSecretary, congregationId } from "@/lib/access";
import { isMidweekDay, isWeekendDay, weekdayName } from "@/lib/constants";
import { getMeetingDays } from "@/lib/meeting-days";
import { logAudit } from "@/lib/audit";
import { type FormState } from "@/server/actions-shared";

export async function setMeetingDaysAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireSecretary();
  const cong = congregationId(user);

  const midweekDay = Number(formData.get("midweekDay"));
  const weekendDay = Number(formData.get("weekendDay"));

  if (!isMidweekDay(midweekDay)) {
    return {
      error: "Elige un día de lunes a viernes para la reunión de entre semana.",
    };
  }
  if (!isWeekendDay(weekendDay)) {
    return { error: "Elige sábado o domingo para la reunión de fin de semana." };
  }

  const antes = await getMeetingDays(cong);
  if (antes.midweekDay === midweekDay && antes.weekendDay === weekendDay) {
    return { success: "Los días de reunión ya eran esos; no se cambió nada." };
  }

  await prisma.congregation.update({
    where: { id: cong },
    data: { midweekDay, weekendDay },
  });

  await logAudit({
    userId: user.id,
    action: "EDITAR",
    entity: "Congregacion",
    entityId: cong,
    details:
      `Días de reunión: ${weekdayName(antes.midweekDay)} y ${weekdayName(antes.weekendDay)} ` +
      `→ ${weekdayName(midweekDay)} y ${weekdayName(weekendDay)}.`,
  });

  // Varias pantallas calculan las fechas del mes con estos días.
  revalidatePath("/reuniones");
  revalidatePath("/reuniones/responsabilidades");

  return {
    success:
      `Días guardados: ${weekdayName(midweekDay)} (entre semana) y ` +
      `${weekdayName(weekendDay)} (fin de semana). Las reuniones ya creadas no se movieron.`,
  };
}
