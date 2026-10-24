"use server";

// ============================================================================
//  Server Actions de Reuniones de la Congregación
//  Crear/editar reuniones (Jueves/Sábado), guardar asignaciones con sus
//  hermanos (Responsable/Auxiliar), notas y tokens de confirmación.
//  Acceso: Administrador o Responsable de Confirmaciones.
// ============================================================================

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMeetingsAccess, congregationId } from "@/lib/access";
import {
  slotsForDay,
  MEETING_DAYS,
  CONFIRM_STATUS,
  MONTHLY_RESP_KEYS,
  sectionAllowsSecondary,
} from "@/lib/constants";
import { logAudit } from "@/lib/audit";
import { type FormState, isUniqueViolation } from "@/server/actions-shared";

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

  // Si ya existe una reunión de ese día, se abre en vez de crear una segunda
  // (la base lo impide, pero así el usuario va directo a la que corresponde).
  const cong = congregationId(user);
  const already = await prisma.meeting.findUnique({
    where: { congregationId_date_day: { congregationId: cong, date, day } },
    select: { id: true },
  });
  if (already) redirect(`/reuniones/${already.id}`);

  const slots = slotsForDay(day);
  let meeting;
  try {
    meeting = await prisma.meeting.create({
    data: {
      date,
      day,
      congregationId: cong,
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
  } catch (error) {
    // Carrera: otra persona creó la misma reunión entre la comprobación y el
    // alta. Se abre la que ya existe en lugar de mostrar un error.
    if (isUniqueViolation(error)) {
      const existing = await prisma.meeting.findUnique({
        where: { congregationId_date_day: { congregationId: cong, date, day } },
        select: { id: true },
      });
      if (existing) redirect(`/reuniones/${existing.id}`);
    }
    throw error;
  }

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
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, congregationId: congregationId(user) },
    include: { assignments: true },
  });
  if (!meeting) return { error: "Reunión no encontrada." };

  // Edición simultánea: la pantalla envía la marca de tiempo con la que cargó
  // la reunión. Si ya no coincide, otra persona guardó mientras tanto y sus
  // cambios no se pisan: se le pide recargar para no perder lo que ya guardó.
  const loadedAt = String(formData.get("loadedAt") ?? "").trim();
  if (loadedAt && loadedAt !== meeting.updatedAt.toISOString()) {
    return {
      error:
        "Otra persona guardó cambios en esta reunión mientras la editabas. " +
        "Recarga la página para ver lo que hay ahora y vuelve a aplicar tus cambios.",
    };
  }

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
    // "Nuestra Vida Cristiana" nunca lleva Auxiliar, aunque venga del
    // formulario o de una reunión antigua creada con Auxiliar.
    const allowTwo =
      formData.get(`two_${key}`) === "1" && sectionAllowsSecondary(section);
    const equalPair = formData.get(`eq_${key}`) === "1" && allowTwo;
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

  // Eliminar SOLO las asignaciones que el usuario quitó explícitamente en
  // pantalla. Antes se borraba todo lo que no viniera en el formulario, y eso
  // hacía que, si dos personas editaban la misma reunión a la vez, el segundo
  // guardado borrara en silencio lo que había agregado el primero.
  // Las RESPONSABILIDADES nunca se tocan aquí (se administran desde la vista
  // mensual "Todas las Responsabilidades del mes").
  const isResponsibility = (a: { section: string; slotKey: string }) =>
    a.section === "RESPONSABILIDADES" ||
    a.section === "SAB_RESPONSABILIDADES" ||
    MONTHLY_RESP_KEYS.includes(a.slotKey);
  const removed = new Set(
    String(formData.get("removed") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const toDelete = meeting.assignments
    .filter(
      (a) => removed.has(a.id) && !submittedIds.has(a.id) && !isResponsibility(a),
    )
    .map((a) => a.id);
  if (toDelete.length) {
    await prisma.meetingAssignment.deleteMany({
      where: { id: { in: toDelete }, meetingId },
    });
  }

  await prisma.meeting.updateMany({
    where: { id: meetingId, congregationId: congregationId(user) },
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
  const assignment = await prisma.meetingAssignment.findFirst({
    where: { id: assignmentId, meeting: { congregationId: congregationId(user) } },
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
 * Marca como CONFIRMADO a un hermano (principal o secundario) de una asignación,
 * directamente desde el editor (el Responsable de Confirmaciones confirma por su
 * cuenta las asignaciones pendientes). Persiste y sincroniza.
 */
export async function confirmAssignmentAction(
  assignmentId: string,
  who: "p" | "s",
): Promise<void> {
  const user = await requireMeetingsAccess();
  const assignment = await prisma.meetingAssignment.findFirst({
    where: { id: assignmentId, meeting: { congregationId: congregationId(user) } },
    select: { id: true, meetingId: true },
  });
  if (!assignment) return;

  await prisma.meetingAssignment.update({
    where: { id: assignmentId },
    data:
      who === "p"
        ? { primaryStatus: CONFIRM_STATUS.CONFIRMADO }
        : { secondaryStatus: CONFIRM_STATUS.CONFIRMADO },
  });

  await logAudit({
    userId: user.id,
    action: "EDITAR",
    entity: "Reunion",
    entityId: assignment.meetingId,
    details: "Asignación confirmada manualmente.",
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
  const cong = congregationId(user);
  const ids = orderedIds.filter(Boolean);
  if (ids.length === 0) return;

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.meetingAssignment.updateMany({
        where: { id, meetingId, meeting: { congregationId: cong } },
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
  await prisma.meeting.updateMany({
    where: { id: meetingId, congregationId: congregationId(user) },
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

/**
 * ¿Pidió quien elimina que se conserve el historial?
 *
 * La casilla llega marcada por defecto; solo se descarta el historial si se
 * desmarca a propósito (p. ej. una importación mal hecha que no debe ensuciar
 * las Estadísticas).
 */
function guardarHistorial(formData: FormData): boolean {
  return String(formData.get("keepHistory") ?? "") !== "no";
}

/**
 * Copia a AssignmentHistory las asignaciones CON NOMBRE de las reuniones
 * indicadas. Debe ejecutarse dentro de la misma transacción que el borrado:
 * así nunca queda una reunión borrada sin su historial, ni historial de una
 * reunión que al final no se borró.
 *
 * Devuelve cuántas filas se archivaron.
 */
async function archivarAsignaciones(
  tx: Prisma.TransactionClient,
  meetingIds: string[],
  cong: string,
  userId: string | null,
): Promise<number> {
  if (meetingIds.length === 0) return 0;
  const asignaciones = await tx.meetingAssignment.findMany({
    where: {
      meetingId: { in: meetingIds },
      // Una casilla sin nadie asignado no aporta nada al historial.
      OR: [{ NOT: { primaryName: null } }, { NOT: { secondaryName: null } }],
    },
    include: { meeting: { select: { id: true, date: true, day: true, weekLabel: true } } },
  });
  if (asignaciones.length === 0) return 0;

  await tx.assignmentHistory.createMany({
    data: asignaciones.map((a) => ({
      congregationId: cong,
      meetingId: a.meeting.id,
      meetingDate: a.meeting.date,
      day: a.meeting.day,
      weekLabel: a.meeting.weekLabel,
      slotKey: a.slotKey,
      section: a.section,
      label: a.label,
      order: a.order,
      primaryName: a.primaryName,
      primaryStatus: a.primaryStatus,
      primaryDone: a.primaryDone,
      secondaryName: a.secondaryName,
      secondaryStatus: a.secondaryStatus,
      secondaryDone: a.secondaryDone,
      deletedById: userId,
    })),
  });
  return asignaciones.length;
}

export async function deleteAllMeetingsAction(formData: FormData): Promise<void> {
  const user = await requireMeetingsAccess();
  const cong = congregationId(user);
  const conservar = guardarHistorial(formData);

  const { borradas, archivadas } = await prisma.$transaction(async (tx) => {
    const ids = (
      await tx.meeting.findMany({
        where: { congregationId: cong },
        select: { id: true },
      })
    ).map((m) => m.id);
    const archivadas = conservar
      ? await archivarAsignaciones(tx, ids, cong, user.id)
      : 0;
    const res = await tx.meeting.deleteMany({ where: { congregationId: cong } });
    return { borradas: res.count, archivadas };
  });

  await logAudit({
    userId: user.id,
    action: "ELIMINAR",
    entity: "Reunion",
    details:
      `Se eliminaron TODAS las reuniones (${borradas}). ` +
      (conservar
        ? `Historial conservado: ${archivadas} asignación(es).`
        : "Historial descartado a petición de quien eliminó."),
  });
  revalidatePath("/reuniones");
  revalidatePath("/reuniones/estadisticas");
  redirect("/reuniones");
}

export async function deleteMeetingAction(formData: FormData): Promise<void> {
  const user = await requireMeetingsAccess();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const cong = congregationId(user);
  const conservar = guardarHistorial(formData);

  const { borrada, archivadas } = await prisma.$transaction(async (tx) => {
    // Se comprueba la congregación antes de archivar: no se puede tocar una
    // reunión ajena, ni guardar su historial.
    const propia = await tx.meeting.findFirst({
      where: { id, congregationId: cong },
      select: { id: true },
    });
    if (!propia) return { borrada: 0, archivadas: 0 };
    const archivadas = conservar
      ? await archivarAsignaciones(tx, [id], cong, user.id)
      : 0;
    const res = await tx.meeting.deleteMany({ where: { id, congregationId: cong } });
    return { borrada: res.count, archivadas };
  });

  if (borrada === 0) return;
  await logAudit({
    userId: user.id,
    action: "ELIMINAR",
    entity: "Reunion",
    entityId: id,
    details:
      "Reunión eliminada. " +
      (conservar
        ? `Historial conservado: ${archivadas} asignación(es).`
        : "Historial descartado a petición de quien eliminó."),
  });
  revalidatePath("/reuniones");
  revalidatePath("/reuniones/estadisticas");
  redirect("/reuniones");
}

/**
 * Marca si un hermano REALIZÓ o no su asignación. Tres estados: `true` (sí),
 * `false` (no) y `null` (sin registrar, que es como nace el historial).
 * Es independiente de la confirmación previa: una asignación puede estar
 * confirmada y no haberse realizado, o al revés.
 */
export async function setAssignmentDoneAction(
  assignmentId: string,
  who: "p" | "s",
  done: boolean | null,
): Promise<void> {
  const user = await requireMeetingsAccess();
  const assignment = await prisma.meetingAssignment.findFirst({
    where: { id: assignmentId, meeting: { congregationId: congregationId(user) } },
    select: { id: true, meetingId: true },
  });
  if (!assignment) return;

  await prisma.meetingAssignment.update({
    where: { id: assignmentId },
    data: {
      ...(who === "p" ? { primaryDone: done } : { secondaryDone: done }),
      doneMarkedAt: done === null ? null : new Date(),
    },
  });

  await logAudit({
    userId: user.id,
    action: "EDITAR",
    entity: "Reunion",
    entityId: assignment.meetingId,
    details: `Asignación marcada como ${
      done === null ? "sin registrar" : done ? "realizada" : "no realizada"
    }.`,
  });

  revalidatePath(`/reuniones/${assignment.meetingId}`);
  revalidatePath("/reuniones/estadisticas");
}

/**
 * Marca de una vez como realizadas todas las asignaciones de una reunión que
 * tengan hermano asignado y sigan SIN REGISTRAR. No pisa lo ya marcado a mano,
 * para que una excepción desmarcada no se pierda al volver a pulsar el botón.
 */
export async function markMeetingDoneAction(formData: FormData): Promise<void> {
  const user = await requireMeetingsAccess();
  const meetingId = String(formData.get("meetingId") ?? "");
  if (!meetingId) return;

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, congregationId: congregationId(user) },
    select: { id: true },
  });
  if (!meeting) return;

  const ahora = new Date();
  const [principales, auxiliares] = await Promise.all([
    prisma.meetingAssignment.updateMany({
      where: {
        meetingId,
        primaryDone: null,
        NOT: { primaryName: null },
      },
      data: { primaryDone: true, doneMarkedAt: ahora },
    }),
    prisma.meetingAssignment.updateMany({
      where: {
        meetingId,
        secondaryDone: null,
        NOT: { secondaryName: null },
      },
      data: { secondaryDone: true, doneMarkedAt: ahora },
    }),
  ]);

  await logAudit({
    userId: user.id,
    action: "EDITAR",
    entity: "Reunion",
    entityId: meetingId,
    details: `Reunión marcada como realizada: ${principales.count} responsable(s) y ${auxiliares.count} auxiliar(es).`,
  });

  revalidatePath(`/reuniones/${meetingId}`);
  revalidatePath("/reuniones/estadisticas");
}
