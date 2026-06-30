"use server";

// ============================================================================
//  Server Actions de Reuniones de la Congregación
//  Crear/editar reuniones (Jueves/Sábado), guardar asignaciones con sus
//  hermanos (Responsable/Auxiliar), notas y tokens de confirmación.
//  Acceso: Administrador o Responsable de Confirmaciones.
// ============================================================================

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMeetingsAccess } from "@/lib/access";
import { slotsForDay, MEETING_DAYS, CONFIRM_STATUS } from "@/lib/constants";
import { logAudit } from "@/lib/audit";
import { type FormState } from "@/server/actions-shared";

function newToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export async function createMeetingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireMeetingsAccess();

  const dateStr = String(formData.get("date") ?? "").trim();
  const day = String(formData.get("day") ?? "").trim();
  if (!dateStr) return { error: "Selecciona una fecha." };
  if (day !== MEETING_DAYS.JUEVES && day !== MEETING_DAYS.SABADO) {
    return { error: "Selecciona el día (Jueves o Sábado)." };
  }
  const date = new Date(`${dateStr}T12:00:00`);
  if (isNaN(date.getTime())) return { error: "Fecha inválida." };

  const slots = slotsForDay(day);
  const meeting = await prisma.meeting.create({
    data: {
      date,
      day,
      createdById: user.id,
      assignments: {
        create: slots.map((s, i) => ({
          slotKey: s.key,
          section: s.section,
          label: s.label,
          order: i,
        })),
      },
    },
  });

  await logAudit({
    userId: user.id,
    action: "CREAR",
    entity: "Reunion",
    entityId: meeting.id,
    details: `Reunión ${day} creada.`,
  });

  redirect(`/reuniones/${meeting.id}`);
}

export async function saveMeetingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireMeetingsAccess();

  const meetingId = String(formData.get("meetingId") ?? "");
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { assignments: true },
  });
  if (!meeting) return { error: "Reunión no encontrada." };

  const confirmadorName =
    String(formData.get("confirmadorName") ?? "").trim() || null;

  for (const a of meeting.assignments) {
    const pName = String(formData.get(`p_${a.id}`) ?? "").trim() || null;
    const sName = String(formData.get(`s_${a.id}`) ?? "").trim() || null;
    const note = String(formData.get(`n_${a.id}`) ?? "").trim() || null;

    // Token y estado del hermano principal.
    let primaryToken = a.primaryToken;
    let primaryStatus = a.primaryStatus;
    if (!pName) {
      primaryToken = null;
      primaryStatus = CONFIRM_STATUS.PENDIENTE;
    } else if (pName !== a.primaryName) {
      primaryToken = newToken();
      primaryStatus = CONFIRM_STATUS.PENDIENTE;
    } else if (!primaryToken) {
      primaryToken = newToken();
    }

    // Token y estado del hermano secundario (Auxiliar).
    let secondaryToken = a.secondaryToken;
    let secondaryStatus = a.secondaryStatus;
    if (!sName) {
      secondaryToken = null;
      secondaryStatus = CONFIRM_STATUS.PENDIENTE;
    } else if (sName !== a.secondaryName) {
      secondaryToken = newToken();
      secondaryStatus = CONFIRM_STATUS.PENDIENTE;
    } else if (!secondaryToken) {
      secondaryToken = newToken();
    }

    await prisma.meetingAssignment.update({
      where: { id: a.id },
      data: {
        primaryName: pName,
        primaryToken,
        primaryStatus,
        secondaryName: sName,
        secondaryToken,
        secondaryStatus,
        note,
      },
    });
  }

  await prisma.meeting.update({
    where: { id: meetingId },
    data: { confirmadorName },
  });

  await logAudit({
    userId: user.id,
    action: "EDITAR",
    entity: "Reunion",
    entityId: meetingId,
    details: "Reunión actualizada (asignaciones).",
  });

  revalidatePath(`/reuniones/${meetingId}`);
  revalidatePath("/reuniones");
  return { success: "Reunión guardada correctamente." };
}

export async function deleteMeetingAction(formData: FormData): Promise<void> {
  const user = await requireMeetingsAccess();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.meeting.delete({ where: { id } });
  await logAudit({
    userId: user.id,
    action: "ELIMINAR",
    entity: "Reunion",
    entityId: id,
    details: "Reunión eliminada.",
  });
  revalidatePath("/reuniones");
  redirect("/reuniones");
}
