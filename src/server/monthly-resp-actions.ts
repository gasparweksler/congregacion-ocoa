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
import {
  claveFecha,
  fechasQueFaltan,
  planearEscrituras,
  type CasillaPrevia,
  type RespEntry,
} from "@/lib/monthly-resp-plan";
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

/**
 * Guarda varias responsabilidades del mes de una sola vez.
 *
 * Por qué en lote: cada consulta a la base cuesta una ida y vuelta completa, y
 * guardar un mes son ~70 casillas. Haciéndolo de una en una eran cientos de
 * viajes esperando uno a otro, y el guardado tardaba minutos. Aquí se lee el
 * mes entero en UNA consulta, se decide en memoria (las reglas viven en
 * monthly-resp-plan.ts) y se escribe todo junto en un solo lote.
 *
 * Las reglas son exactamente las de antes: la reunión se crea sola la primera
 * vez que su fecha recibe un nombre, un nombre vacío no crea nada, y cambiar
 * de persona renueva el enlace de confirmación.
 */
export async function setMonthlyResponsibilities(
  entries: RespEntry[],
): Promise<{ guardadas: number }> {
  const user = await requireMeetingsAccess();
  const cong = congregationId(user);

  // Solo las casillas que existen de verdad, ya con su etiqueta y su tipo.
  const tareas = entries.flatMap((e) => {
    const resp = MONTHLY_RESPONSIBILITIES.find((r) => r.key === e.slotKey);
    if (!resp) return [];
    return [
      {
        ...e,
        value: e.value.trim(),
        label: resp.label,
        esGrupo: resp.kind === "group",
      },
    ];
  });
  if (tareas.length === 0) return { guardadas: 0 };

  const fechaDe = (dateISO: string) => {
    const [y, m, d] = dateISO.split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  };

  // --- 1. Una sola lectura: las reuniones del rango con sus casillas ---
  const tiempos = tareas.map((t) => fechaDe(t.dateISO).getTime());
  const minima = new Date(Math.min(...tiempos));
  const maxima = new Date(Math.max(...tiempos));
  const first = new Date(minima.getFullYear(), minima.getMonth(), minima.getDate() - 8, 0, 0, 0);
  const last = new Date(maxima.getFullYear(), maxima.getMonth(), maxima.getDate() + 8, 0, 0, 0);

  const meetings = await prisma.meeting.findMany({
    where: { congregationId: cong, date: { gte: first, lt: last } },
    select: {
      id: true,
      date: true,
      day: true,
      weekLabel: true,
      assignments: {
        select: {
          id: true,
          meetingId: true,
          slotKey: true,
          primaryName: true,
          primaryToken: true,
          primaryStatus: true,
        },
      },
    },
  });

  // Qué reunión le toca a cada fecha (una misma semana puede guardarse con la
  // fecha del lunes, por eso lo resuelve findWeekMeeting y no una igualdad).
  const idPorFecha = new Map<string, string>();
  for (const t of tareas) {
    const clave = claveFecha(t.dateISO, t.day);
    if (idPorFecha.has(clave)) continue;
    const encontrada = findWeekMeeting(meetings, fechaDe(t.dateISO), t.day);
    if (encontrada) idPorFecha.set(clave, encontrada.id);
  }

  // --- 2. Crear las reuniones que faltan (fechas distintas: van a la vez) ---
  const previas: CasillaPrevia[] = meetings.flatMap((m) => m.assignments);
  const faltan = fechasQueFaltan(tareas, idPorFecha);
  if (faltan.length > 0) {
    const creadas = await Promise.all(
      faltan.map(async (f) => ({
        clave: claveFecha(f.dateISO, f.day),
        id: await createMeetingForDate(
          fechaDe(f.dateISO),
          f.day,
          user.id,
          user.name ?? null,
          cong,
        ),
      })),
    );
    for (const c of creadas) idPorFecha.set(c.clave, c.id);

    // Las recién creadas ya traen sus casillas, pero no conocemos sus id:
    // una consulta más, solo cuando de verdad se creó alguna reunión.
    const nuevas = await prisma.meetingAssignment.findMany({
      where: { meetingId: { in: creadas.map((c) => c.id) } },
      select: {
        id: true,
        meetingId: true,
        slotKey: true,
        primaryName: true,
        primaryToken: true,
        primaryStatus: true,
      },
    });
    previas.push(...nuevas);
  }

  // --- 3. Qué escribir, decidido en memoria ---
  const plan = planearEscrituras(tareas, idPorFecha, previas, newToken);
  const tocadas = new Set(plan.map((w) => w.meetingId));

  // --- 4. Todas las escrituras en un solo viaje ---
  if (plan.length > 0) {
    await prisma.$transaction(
      plan.map((w) => {
        const data = {
          section: "RESPONSABILIDADES",
          label: w.label,
          allowTwo: false,
          equalPair: false,
          primaryName: w.primaryName,
          primaryToken: w.primaryToken,
          primaryStatus: w.primaryStatus,
        };
        return w.assignmentId
          ? prisma.meetingAssignment.update({ where: { id: w.assignmentId }, data })
          : prisma.meetingAssignment.create({
              data: { ...data, meetingId: w.meetingId, slotKey: w.slotKey, order: 100 },
            });
      }),
    );
  }
  const escrituras = plan;

  // --- 5. Una anotación en la auditoría, no una por casilla ---
  if (escrituras.length > 0) {
    const unaSola = tareas.length === 1 ? tareas[0] : null;
    await logAudit({
      userId: user.id,
      // Se pasa la congregación: si no, logAudit la busca con otra consulta.
      congregationId: cong,
      action: "EDITAR",
      entity: "Reunion",
      entityId: unaSola ? [...tocadas][0] : undefined,
      details: unaSola
        ? `Responsabilidad mensual: ${unaSola.label} = ${unaSola.value || "(sin asignar)"}.`
        : `Responsabilidades mensuales: ${escrituras.length} casillas en ${tocadas.size} reunión(es).`,
    });
  }

  revalidatePath("/reuniones/responsabilidades");
  revalidatePath("/reuniones");
  for (const id of tocadas) revalidatePath(`/reuniones/${id}`);

  return { guardadas: escrituras.length };
}

/**
 * Asigna (o limpia) el encargado de UNA responsabilidad en una fecha.
 * Es el caso de una sola casilla del guardado en lote: así no hay dos caminos
 * de escritura que puedan portarse distinto.
 */
export async function setMonthlyResponsibility(
  dateISO: string,
  day: "JUEVES" | "SABADO",
  slotKey: string,
  value: string,
): Promise<void> {
  await setMonthlyResponsibilities([{ dateISO, day, slotKey, value }]);
}
