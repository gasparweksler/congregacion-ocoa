"use server";

// ============================================================================
//  Asistencia a las reuniones (registro S-88)
//
//  Guarda cuánta gente asistió a cada reunión, si se celebró con normalidad y
//  las observaciones. Todo va atado a la congregación de quien está dentro:
//  ninguna consulta de este archivo busca sin ese filtro.
//
//  Las reglas (año de servicio, promedios, qué fechas toca) viven en
//  src/lib/asistencia.ts, sin base de datos, para poder probarlas solas.
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSecretary, congregationId } from "@/lib/access";
import { getMeetingDays } from "@/lib/meeting-days";
import { logAudit } from "@/lib/audit";
import { MEETING_DAYS, type MeetingDays } from "@/lib/constants";
import {
  anioDeServicio,
  etiquetaAnioDeServicio,
  etiquetaDeMes,
  fechaDeISO,
  filasDelMes,
  isoDeFecha,
  mesesDelAnioDeServicio,
  parseAsistencia,
  rangoDelAnioDeServicio,
  rangoDelMes,
  promediosDelMes,
  type FilaAsistencia,
  type Promedio,
} from "@/lib/asistencia";
import type { FormState } from "@/server/actions-shared";

/** Lo que se manda al guardar una reunión. */
export type EntradaAsistencia = {
  dateISO: string;
  day: "JUEVES" | "SABADO";
  held: boolean;
  /** Texto tal cual se escribió; vacío = sin anotar. */
  count: string;
  note: string;
};

export type MesDeAsistencia = {
  year: number;
  month: number;
  filas: FilaAsistencia[];
  promedios: {
    entreSemana: Promedio;
    finDeSemana: Promedio;
    todas: Promedio;
  };
};

const LIMITE_NOTA = 300;

/** Lo guardado de un mes, ya en forma de filas. */
async function guardadasDelMes(
  cong: string,
  year: number,
  month: number,
): Promise<FilaAsistencia[]> {
  const filas = await prisma.meetingAttendance.findMany({
    where: { congregationId: cong, date: rangoDelMes(year, month) },
    orderBy: { date: "asc" },
    select: { date: true, day: true, held: true, count: true, note: true },
  });
  return filas.map((f) => ({
    dateISO: isoDeFecha(f.date),
    day: f.day === MEETING_DAYS.SABADO ? MEETING_DAYS.SABADO : MEETING_DAYS.JUEVES,
    held: f.held,
    count: f.count,
    note: f.note ?? "",
  }));
}

/**
 * Las reuniones de un mes: las fechas salen de los días configurados en
 * Reuniones, y encima va lo que ya estuviera anotado.
 */
export async function getAsistenciaDelMes(
  year: number,
  month: number,
): Promise<MesDeAsistencia> {
  const user = await requireSecretary();
  const cong = congregationId(user);
  const days: MeetingDays = await getMeetingDays(cong);
  const filas = filasDelMes(year, month, days, await guardadasDelMes(cong, year, month));
  return { year, month, filas, promedios: promediosDelMes(filas) };
}

export type MesDelHistorial = {
  year: number;
  month: number;
  /** Cuántas reuniones tienen algo anotado. */
  anotadas: number;
  /** Cuántas se marcaron como "no hubo reunión normal". */
  suspendidas: number;
  entreSemana: Promedio;
  finDeSemana: Promedio;
  todas: Promedio;
  /** Las observaciones escritas, para verlas sin abrir el mes. */
  notas: Array<{ dateISO: string; day: string; held: boolean; note: string }>;
};

/**
 * El historial de un año de servicio (septiembre a agosto), mes a mes. Solo
 * lee lo GUARDADO: un mes sin anotar sale en blanco, no se inventan fechas.
 */
export async function getHistorialAnioDeServicio(
  anio: number,
): Promise<MesDelHistorial[]> {
  const user = await requireSecretary();
  const cong = congregationId(user);
  const meses = mesesDelAnioDeServicio(anio);

  const filas = await prisma.meetingAttendance.findMany({
    where: { congregationId: cong, date: rangoDelAnioDeServicio(anio) },
    orderBy: { date: "asc" },
    select: { date: true, day: true, held: true, count: true, note: true },
  });

  return meses.map(({ year, month }) => {
    const delMes: FilaAsistencia[] = filas
      .filter(
        (f) => f.date.getFullYear() === year && f.date.getMonth() + 1 === month,
      )
      .map((f) => ({
        dateISO: isoDeFecha(f.date),
        day:
          f.day === MEETING_DAYS.SABADO ? MEETING_DAYS.SABADO : MEETING_DAYS.JUEVES,
        held: f.held,
        count: f.count,
        note: f.note ?? "",
      }));
    const p = promediosDelMes(delMes);
    return {
      year,
      month,
      anotadas: delMes.filter((f) => f.count !== null || !f.held || f.note).length,
      suspendidas: delMes.filter((f) => !f.held).length,
      entreSemana: p.entreSemana,
      finDeSemana: p.finDeSemana,
      todas: p.todas,
      notas: delMes
        .filter((f) => f.note.trim() !== "" || !f.held)
        .map((f) => ({
          dateISO: f.dateISO,
          day: f.day,
          held: f.held,
          note: f.note,
        })),
    };
  });
}

/**
 * El año de servicio del registro más antiguo de la congregación, o nulo si
 * todavía no hay nada anotado. Sirve para que el selector de hojas del S-88
 * no deje fuera un año viejo que sí tiene datos.
 */
export async function getPrimerAnioConDatos(): Promise<number | null> {
  const user = await requireSecretary();
  const cong = congregationId(user);
  const primera = await prisma.meetingAttendance.findFirst({
    where: { congregationId: cong },
    orderBy: { date: "asc" },
    select: { date: true },
  });
  if (!primera) return null;
  return anioDeServicio(primera.date.getFullYear(), primera.date.getMonth() + 1);
}

/** Lo que el PDF S-88 necesita de un año de servicio, ya resumido. */
export type MesDelS88 = {
  year: number;
  month: number;
  entreSemana: Promedio;
  finDeSemana: Promedio;
};

export async function getResumenS88(anio: number): Promise<MesDelS88[]> {
  const historial = await getHistorialAnioDeServicio(anio);
  return historial.map((m) => ({
    year: m.year,
    month: m.month,
    entreSemana: m.entreSemana,
    finDeSemana: m.finDeSemana,
  }));
}

/**
 * Guarda las reuniones que cambiaron. Se escribe todo en una transacción: o
 * entra el lote entero, o no entra nada.
 */
export async function guardarAsistencia(
  entradas: EntradaAsistencia[],
): Promise<FormState & { guardadas?: number }> {
  const user = await requireSecretary();
  const cong = congregationId(user);

  if (!Array.isArray(entradas) || entradas.length === 0) {
    return { success: "No había cambios que guardar.", guardadas: 0 };
  }
  if (entradas.length > 200) {
    return { error: "Demasiados cambios de una vez. Guarda el mes otra vez." };
  }

  const escrituras: Array<{
    date: Date;
    day: string;
    held: boolean;
    count: number | null;
    note: string;
  }> = [];

  for (const e of entradas) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e?.dateISO ?? ""))) {
      return { error: "Hay una fecha que no se entiende." };
    }
    const day =
      e.day === MEETING_DAYS.SABADO ? MEETING_DAYS.SABADO : MEETING_DAYS.JUEVES;
    const count = parseAsistencia(String(e.count ?? ""));
    if (count === "mal") {
      return {
        error:
          "La asistencia solo admite números enteros (sin letras, símbolos ni números negativos).",
      };
    }
    const date = fechaDeISO(e.dateISO);
    if (Number.isNaN(date.getTime())) {
      return { error: "Hay una fecha que no se entiende." };
    }
    escrituras.push({
      date,
      day,
      held: e.held !== false,
      count,
      note: String(e.note ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, LIMITE_NOTA),
    });
  }

  await prisma.$transaction(
    escrituras.map((w) =>
      prisma.meetingAttendance.upsert({
        where: {
          congregationId_date_day: {
            congregationId: cong,
            date: w.date,
            day: w.day,
          },
        },
        create: {
          congregationId: cong,
          date: w.date,
          day: w.day,
          held: w.held,
          count: w.count,
          note: w.note,
        },
        update: { held: w.held, count: w.count, note: w.note },
      }),
    ),
  );

  const primera = escrituras[0];
  await logAudit({
    userId: user.id,
    congregationId: cong,
    action: "EDITAR",
    entity: "AsistenciaReuniones",
    details:
      escrituras.length === 1
        ? `Asistencia del ${isoDeFecha(primera.date)}: ${
            primera.held ? (primera.count ?? "sin anotar") : "no hubo reunión"
          }.`
        : `Asistencia: ${escrituras.length} reuniones anotadas.`,
  });

  revalidatePath("/asistencia");
  return {
    success:
      escrituras.length === 1
        ? "Guardado."
        : `Guardadas ${escrituras.length} reuniones.`,
    guardadas: escrituras.length,
  };
}

/** Borra TODO lo anotado de un mes (solo de esta congregación). */
export async function borrarAsistenciaDelMes(
  year: number,
  month: number,
): Promise<FormState> {
  const user = await requireSecretary();
  const cong = congregationId(user);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { error: "Año no válido." };
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { error: "Mes no válido." };
  }

  const { count } = await prisma.meetingAttendance.deleteMany({
    where: { congregationId: cong, date: rangoDelMes(year, month) },
  });
  if (count === 0) {
    return { success: `No había nada anotado en ${etiquetaDeMes(year, month)}.` };
  }

  await logAudit({
    userId: user.id,
    congregationId: cong,
    action: "ELIMINAR",
    entity: "AsistenciaReuniones",
    details: `Se borró la asistencia de ${etiquetaDeMes(year, month)} (${count} reunión/reuniones).`,
  });
  revalidatePath("/asistencia");
  return {
    success: `Listo: se borró la asistencia de ${etiquetaDeMes(year, month)} (${count} reunión/reuniones).`,
  };
}

/** Borra el año de servicio entero: de septiembre a agosto. */
export async function borrarAsistenciaDelAnioDeServicio(
  anio: number,
): Promise<FormState> {
  const user = await requireSecretary();
  const cong = congregationId(user);
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    return { error: "Año de servicio no válido." };
  }

  const { count } = await prisma.meetingAttendance.deleteMany({
    where: { congregationId: cong, date: rangoDelAnioDeServicio(anio) },
  });
  if (count === 0) {
    return {
      success: `No había nada anotado en el año de servicio ${anio}.`,
    };
  }

  await logAudit({
    userId: user.id,
    congregationId: cong,
    action: "ELIMINAR",
    entity: "AsistenciaReuniones",
    details: `Se borró la asistencia del año de servicio ${anio} (${etiquetaAnioDeServicio(
      anio,
    ).toLowerCase()}): ${count} reunión/reuniones.`,
  });
  revalidatePath("/asistencia");
  return {
    success: `Listo: se borró la asistencia del año de servicio ${anio} (${count} reunión/reuniones).`,
  };
}
