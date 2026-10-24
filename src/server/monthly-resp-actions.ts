"use server";

// ============================================================================
//  Planificación mensual de Responsabilidades
//  Edita, desde una sola pantalla, las responsabilidades (Acomodadores, Pasa
//  Micrófono, Audio, Video, Plataforma y Limpieza por Grupos) de todas las
//  reuniones (jueves y sábados) del mes. Reutiliza MeetingAssignment con los
//  slotKey canónicos de MONTHLY_RESPONSIBILITIES. La reunión se crea de forma
//  perezosa la primera vez que se asigna algo en su fecha.
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMeetingsAccess, congregationId } from "@/lib/access";
import {
  MONTHLY_RESPONSIBILITIES,
  CONFIRM_STATUS,
  slotsForDay,
} from "@/lib/constants";
import { meetingDatesInMonth } from "@/lib/period";
import { getMeetingDays } from "@/lib/meeting-days";
import { findWeekMeeting } from "@/lib/meeting-week";
import { logAudit } from "@/lib/audit";
import { isUniqueViolation } from "@/server/actions-shared";

function newToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

// Clave de la semana (lunes) de una fecha, como YYYY-MM-DD. Se usa para
// emparejar un jueves/sábado calculado con una reunión ya creada de esa MISMA
// semana, aunque la reunión guarde su fecha en otro día del rango (p. ej. el
// lunes: "3-9 de Agosto" guarda 2026-08-03).
// La regla vive en src/lib/meeting-week.ts: la usa también la asignación
// automática, para no tener dos criterios parecidos pero distintos.

export type RespCell = {
  name: string;
  token: string | null;
  status: string;
};

export type MonthlyMeetingRow = {
  dateISO: string; // YYYY-MM-DD
  day: "JUEVES" | "SABADO";
  meetingId: string | null;
  values: Record<string, RespCell>; // por slotKey canónico
};

/** Lee la planificación de responsabilidades de todo el mes. */
export async function getMonthlyResponsibilities(
  year: number,
  month: number,
): Promise<MonthlyMeetingRow[]> {
  const user = await requireMeetingsAccess();
  const cong = congregationId(user);

  // Ventana amplia (±8 días) para captar reuniones de rango cuya fecha guardada
  // caiga en semanas de borde del mes.
  const first = new Date(year, month - 1, 1 - 8, 0, 0, 0);
  const last = new Date(year, month, 1 + 8, 0, 0, 0);
  const meetings = await prisma.meeting.findMany({
    where: { congregationId: cong, date: { gte: first, lt: last } },
    include: { assignments: true },
  });

  // Los días de reunión los fija cada congregación.
  const dates = meetingDatesInMonth(year, month, await getMeetingDays(cong));
  return dates.map(({ date, day }) => {
    const meeting = findWeekMeeting(meetings, date, day);
    const values: Record<string, RespCell> = {};
    for (const r of MONTHLY_RESPONSIBILITIES) {
      const a = meeting?.assignments.find((x) => x.slotKey === r.key);
      values[r.key] = {
        name: a?.primaryName ?? "",
        token: a?.primaryToken ?? null,
        status: a?.primaryStatus ?? CONFIRM_STATUS.PENDIENTE,
      };
    }
    const d = String(date.getDate()).padStart(2, "0");
    const mm = String(month).padStart(2, "0");
    return {
      dateISO: `${year}-${mm}-${d}`,
      day,
      meetingId: meeting?.id ?? null,
      values,
    };
  });
}

/** Crea una reunión con sus asignaciones normales + responsabilidades canónicas. */
async function createMeetingForDate(
  date: Date,
  day: "JUEVES" | "SABADO",
  userId: string,
  userName: string | null,
  cong: string,
): Promise<string> {
  // Asignaciones normales (Tesoros, SMM, VC…), SIN las responsabilidades viejas.
  const asigSlots = slotsForDay(day).filter(
    (s) => !s.section.includes("RESPONSABILIDADES"),
  );
  const respSlots = MONTHLY_RESPONSIBILITIES.map((r) => ({
    slotKey: r.key,
    section: "RESPONSABILIDADES",
    label: r.label,
    allowTwo: false,
    equalPair: false,
  }));

  let meeting;
  try {
    meeting = await prisma.meeting.create({
    data: {
      date,
      day,
      congregationId: cong,
      createdById: userId,
      confirmadorName: userName ?? null,
      assignments: {
        create: [
          ...asigSlots.map((s, i) => ({
            slotKey: s.key,
            section: s.section,
            label: s.label,
            order: i,
            allowTwo: s.allowTwo,
            equalPair: !!s.equalPair,
          })),
          ...respSlots.map((s, i) => ({
            ...s,
            order: 100 + i,
          })),
        ],
      },
    },
    });
  } catch (error) {
    // Carrera: dos personas asignando responsabilidades de la misma fecha a la
    // vez. Antes se creaban DOS reuniones del mismo día; ahora la base lo
    // impide y aquí se reutiliza la que ganó la carrera.
    if (isUniqueViolation(error)) {
      const existing = await prisma.meeting.findUnique({
        where: { congregationId_date_day: { congregationId: cong, date, day } },
        select: { id: true },
      });
      if (existing) return existing.id;
    }
    throw error;
  }
  return meeting.id;
}

/** Asigna (o limpia) el encargado de una responsabilidad en una fecha. */
export async function setMonthlyResponsibility(
  dateISO: string,
  day: "JUEVES" | "SABADO",
  slotKey: string,
  value: string,
): Promise<void> {
  const user = await requireMeetingsAccess();

  const resp = MONTHLY_RESPONSIBILITIES.find((r) => r.key === slotKey);
  if (!resp) return;

  const [y, m, d] = dateISO.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0);
  const clean = value.trim();

  // Buscar reunión ya creada de la MISMA semana y día (aunque su fecha sea el
  // lunes del rango). Si no existe, crearla perezosamente.
  const first = new Date(y, m - 1, d - 8, 0, 0, 0);
  const last = new Date(y, m - 1, d + 8, 0, 0, 0);
  const cong = congregationId(user);
  const existing = await prisma.meeting.findMany({
    where: { congregationId: cong, date: { gte: first, lt: last } },
    select: { id: true, date: true, day: true, weekLabel: true },
  });
  let meetingId = findWeekMeeting(existing, date, day)?.id ?? null;

  if (!meetingId) {
    // Si se está limpiando un valor vacío y no hay reunión, no crear nada.
    if (!clean) return;
    meetingId = await createMeetingForDate(
      date,
      day,
      user.id,
      user.name ?? null,
      cong,
    );
  }

  // Buscar/crear la asignación canónica de esta responsabilidad.
  const assignment = await prisma.meetingAssignment.findFirst({
    where: { meetingId, slotKey, meeting: { congregationId: cong } },
  });

  const isGroup = resp.kind === "group";
  // Publicadores usan token/estado para confirmar; grupos (limpieza) no.
  let token = assignment?.primaryToken ?? null;
  let status = assignment?.primaryStatus ?? CONFIRM_STATUS.PENDIENTE;
  if (isGroup || !clean) {
    token = null;
    status = CONFIRM_STATUS.PENDIENTE;
  } else if (clean !== assignment?.primaryName) {
    token = newToken();
    status = CONFIRM_STATUS.PENDIENTE;
  } else if (!token) {
    token = newToken();
  }

  const data = {
    section: "RESPONSABILIDADES",
    label: resp.label,
    allowTwo: false,
    equalPair: false,
    primaryName: clean || null,
    primaryToken: token,
    primaryStatus: status,
  };

  if (assignment) {
    await prisma.meetingAssignment.update({
      where: { id: assignment.id },
      data,
    });
  } else {
    await prisma.meetingAssignment.create({
      data: { ...data, meetingId, slotKey, order: 100 },
    });
  }

  await logAudit({
    userId: user.id,
    action: "EDITAR",
    entity: "Reunion",
    entityId: meetingId,
    details: `Responsabilidad mensual: ${resp.label} = ${clean || "(sin asignar)"}.`,
  });

  revalidatePath("/reuniones/responsabilidades");
  revalidatePath(`/reuniones/${meetingId}`);
  revalidatePath("/reuniones");
}
