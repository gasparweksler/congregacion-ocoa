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
      // Responsable de Confirmación por defecto: quien crea la reunión.
      confirmadorName: user.name ?? null,
      assignments: {
        create: slots.map((s, i) => ({
          slotKey: s.key,
          section: s.section,
          label: s.label,
          order: i,
          allowTwo: s.allowTwo,
          equalPair: !!s.equalPair,
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
  const weekLabel = String(formData.get("weekLabel") ?? "").trim() || null;
  const dateStr = String(formData.get("date") ?? "").trim();
  const parsedDate = dateStr ? new Date(`${dateStr}T12:00:00`) : null;
  const newDate = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : null;

  const keys = String(formData.get("keys") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const existingById = new Map(meeting.assignments.map((a) => [a.id, a]));
  const submittedIds = new Set<string>();

  for (let idx = 0; idx < keys.length; idx++) {
    const key = keys[idx];
    const id = String(formData.get(`id_${key}`) ?? "").trim();
    const label =
      String(formData.get(`lbl_${key}`) ?? "").trim() || "Asignación";
    const section =
      String(formData.get(`sec_${key}`) ?? "").trim() || "ASIGNACIONES";
    const allowTwo = formData.get(`two_${key}`) === "1";
    const equalPair = formData.get(`eq_${key}`) === "1";
    const note = String(formData.get(`n_${key}`) ?? "").trim() || null;
    const pName = String(formData.get(`p_${key}`) ?? "").trim() || null;
    const sName = allowTwo
      ? String(formData.get(`s_${key}`) ?? "").trim() || null
      : null;

    const prev = id ? existingById.get(id) : undefined;

    // Token/estado: se conserva la confirmación salvo que cambie el nombre.
    let primaryToken = prev?.primaryToken ?? null;
    let primaryStatus = prev?.primaryStatus ?? CONFIRM_STATUS.PENDIENTE;
    if (!pName) {
      primaryToken = null;
      primaryStatus = CONFIRM_STATUS.PENDIENTE;
    } else if (pName !== prev?.primaryName) {
      primaryToken = newToken();
      primaryStatus = CONFIRM_STATUS.PENDIENTE;
    } else if (!primaryToken) {
      primaryToken = newToken();
    }

    let secondaryToken = prev?.secondaryToken ?? null;
    let secondaryStatus = prev?.secondaryStatus ?? CONFIRM_STATUS.PENDIENTE;
    if (!sName) {
      secondaryToken = null;
      secondaryStatus = CONFIRM_STATUS.PENDIENTE;
    } else if (sName !== prev?.secondaryName) {
      secondaryToken = newToken();
      secondaryStatus = CONFIRM_STATUS.PENDIENTE;
    } else if (!secondaryToken) {
      secondaryToken = newToken();
    }

    const fields = {
      section, label, order: idx, note, allowTwo, equalPair,
      primaryName: pName, primaryToken, primaryStatus,
      secondaryName: sName, secondaryToken, secondaryStatus,
    };

    if (prev) {
      await prisma.meetingAssignment.update({
        where: { id: prev.id },
        data: fields,
      });
      submittedIds.add(prev.id);
    } else {
      await prisma.meetingAssignment.create({
        data: {
          ...fields,
          meetingId,
          slotKey: `custom_${newToken().slice(0, 12)}`,
        },
      });
    }
  }

  // Eliminar las asignaciones que se quitaron en la pantalla.
  const toDelete = meeting.assignments
    .filter((a) => !submittedIds.has(a.id))
    .map((a) => a.id);
  if (toDelete.length) {
    await prisma.meetingAssignment.deleteMany({
      where: { id: { in: toDelete } },
    });
  }

  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      confirmadorName,
      weekLabel,
      ...(newDate ? { date: newDate } : {}),
    },
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

/**
 * Resetea el estado de confirmación de un hermano (principal o secundario) de
 * una asignación, devolviéndolo a PENDIENTE. Sirve para corregir confirmaciones
 * hechas por error. Persiste de inmediato y revalida (sincroniza a todos).
 */
export async function resetConfirmationAction(
  assignmentId: string,
  who: "p" | "s",
): Promise<void> {
  const user = await requireMeetingsAccess();
  const assignment = await prisma.meetingAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, meetingId: true },
  });
  if (!assignment) return;

  await prisma.meetingAssignment.update({
    where: { id: assignmentId },
    data:
      who === "p"
        ? { primaryStatus: CONFIRM_STATUS.PENDIENTE }
        : { secondaryStatus: CONFIRM_STATUS.PENDIENTE },
  });

  await logAudit({
    userId: user.id,
    action: "EDITAR",
    entity: "Reunion",
    entityId: assignment.meetingId,
    details: "Confirmación reseteada a Pendiente.",
  });

  revalidatePath(`/reuniones/${assignment.meetingId}`);
  revalidatePath("/reuniones");
}

/**
 * Guarda el nuevo orden de las asignaciones (drag & drop). Recibe los IDs ya
 * existentes en el orden deseado y actualiza su campo `order`. Las asignaciones
 * nuevas (sin id) conservan su orden al guardar la reunión completa.
 */
export async function reorderAssignmentsAction(
  meetingId: string,
  orderedIds: string[],
): Promise<void> {
  const user = await requireMeetingsAccess();
  const ids = orderedIds.filter(Boolean);
  if (ids.length === 0) return;

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.meetingAssignment.updateMany({
        where: { id, meetingId },
        data: { order: index },
      }),
    ),
  );

  await logAudit({
    userId: user.id,
    action: "EDITAR",
    entity: "Reunion",
    entityId: meetingId,
    details: "Asignaciones reordenadas.",
  });

  revalidatePath(`/reuniones/${meetingId}`);
}

/**
 * Asigna el Responsable de Confirmación de una reunión (desde el desplegable de
 * la lista de reuniones). Guarda automáticamente y sincroniza.
 */
export async function setMeetingConfirmadorAction(
  meetingId: string,
  name: string,
): Promise<void> {
  const user = await requireMeetingsAccess();
  const clean = name.trim() || null;
  await prisma.meeting.update({
    where: { id: meetingId },
    data: { confirmadorName: clean },
  });

  await logAudit({
    userId: user.id,
    action: "EDITAR",
    entity: "Reunion",
    entityId: meetingId,
    details: `Responsable de Confirmación: ${clean ?? "(ninguno)"}.`,
  });

  revalidatePath("/reuniones");
  revalidatePath(`/reuniones/${meetingId}`);
}

export async function deleteAllMeetingsAction(): Promise<void> {
  const user = await requireMeetingsAccess();
  const res = await prisma.meeting.deleteMany({});
  await logAudit({
    userId: user.id,
    action: "ELIMINAR",
    entity: "Reunion",
    details: `Se eliminaron TODAS las reuniones (${res.count}).`,
  });
  revalidatePath("/reuniones");
  redirect("/reuniones");
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
