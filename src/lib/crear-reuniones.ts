// ============================================================================
//  Crear las reuniones de entre semana a partir del programa de un mes.
//
//  Es el ÚNICO sitio donde se crean: lo usan los dos caminos, el Excel de
//  Vida y Ministerio y el PDF de la Guía de actividades. Así los dos dejan
//  exactamente la misma estructura (mismas casillas, mismo orden, mismos
//  títulos) y respetan las mismas reglas:
//
//   · Una reunión que ya existe NO se toca: ni sus nombres ni sus
//     asignaciones. Como mucho se le completan los datos del programa impreso
//     (lectura semanal y canciones) que estuvieran vacíos.
//   · Las casillas que quedarían vacías no se crean… salvo las dos oraciones,
//     que van siempre: abren y cierran la reunión, y sin ellas el programa
//     impreso salía sin "Canción final y oración".
//   · Si dos personas crean la misma semana a la vez, gana la primera y la
//     segunda se cuenta como omitida, no revienta.
//
//  No es un "use server": aquí dentro no hay acciones que pueda llamar el
//  navegador, solo una función que usan las acciones ya autenticadas.
// ============================================================================

import { prisma } from "@/lib/prisma";
import {
  slotsForDay,
  MEETING_DAYS,
  CONFIRM_STATUS,
  sectionAllowsSecondary,
} from "@/lib/constants";
import { isUniqueViolation } from "@/server/actions-shared";
import { buildSlotData, programFieldsToFill, type Week } from "@/lib/vymc-parser";

function newToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/**
 * Las dos oraciones se crean siempre, aunque nadie las tenga asignada todavía.
 *
 * Son parte de la reunión (la abren y la cierran), no una asignación opcional:
 * si la casilla no existe, el programa impreso se queda sin la canción final
 * ni la oración, y en la reunión no hay dónde escribir al hermano.
 */
export const SLOTS_SIEMPRE = ["j_oracion_inicio", "j_oracion_final"];

export type ResumenCreacion = {
  creadas: number;
  omitidas: number;
  completadas: number;
  /** Reuniones que ya existían y a las que se les añadió alguna oración. */
  conOraciones: number;
};

export async function crearReunionesDesdeSemanas(
  weeks: Week[],
  quien: { userId: string | null; userName: string | null; congregationId: string },
): Promise<ResumenCreacion> {
  const { userId, userName, congregationId: cong } = quien;
  const juevesSlots = slotsForDay(MEETING_DAYS.JUEVES);
  const resumen: ResumenCreacion = {
    creadas: 0,
    omitidas: 0,
    completadas: 0,
    conOraciones: 0,
  };

  for (const w of weeks) {
    const existing = await prisma.meeting.findFirst({
      where: { congregationId: cong, day: MEETING_DAYS.JUEVES, date: w.date },
      include: { assignments: { select: { slotKey: true, order: true } } },
    });

    if (existing) {
      // La reunión ya está: NO se tocan sus asignaciones ni sus nombres. Solo
      // se rellenan los datos del programa impreso (lectura semanal y
      // canciones) que todavía estén vacíos, nunca los que ya tengan valor.
      const faltantes = programFieldsToFill(existing, w);
      if (Object.keys(faltantes).length > 0) {
        await prisma.meeting.update({ where: { id: existing.id }, data: faltantes });
        resumen.completadas++;
      }
      // Y se añaden las oraciones si le faltan: vacías, sin tocar nada más.
      if (await ponerOracionesQueFalten(existing)) resumen.conOraciones++;
      resumen.omitidas++;
      continue;
    }

    const data = buildSlotData(w);
    const assignments = juevesSlots
      .map((s, i) => {
        const d = data[s.key] ?? {};
        const primaryName = d.p || null;
        // "Nuestra Vida Cristiana" nunca crea Auxiliar. En el resto, si el
        // programa trae Auxiliar se respeta aunque la casilla por defecto sea
        // de un solo hermano (así no se pierde ningún nombre).
        const sectionOk = sectionAllowsSecondary(s.section);
        const secondaryName = sectionOk ? d.s || null : null;
        const allowsSecondary = sectionOk && (s.allowTwo || !!secondaryName);
        // Las casillas que quedarían vacías no se crean; las dos oraciones sí.
        if (
          !d.label &&
          !primaryName &&
          !secondaryName &&
          !SLOTS_SIEMPRE.includes(s.key)
        ) {
          return null;
        }
        return {
          slotKey: s.key,
          section: s.section,
          label: d.label ?? s.label,
          order: i,
          allowTwo: allowsSecondary,
          equalPair: !!s.equalPair,
          primaryName,
          primaryToken: primaryName ? newToken() : null,
          primaryStatus: CONFIRM_STATUS.PENDIENTE,
          secondaryName,
          secondaryToken: secondaryName ? newToken() : null,
          secondaryStatus: CONFIRM_STATUS.PENDIENTE,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);

    // Partes que no caben en las casillas fijas: el número de asignaciones de
    // "Seamos Mejores Maestros" y "Nuestra Vida Cristiana" cambia cada semana,
    // así que las que sobran se añaden como casillas nuevas en vez de perderse.
    const extras = Object.entries(data)
      .filter(([, d]) => d.extra)
      .map(([key, d], i) => {
        const sectionOk = sectionAllowsSecondary(d.extra!.section);
        const secondaryName = sectionOk ? d.s || null : null;
        const primaryName = d.p || null;
        return {
          slotKey: key,
          section: d.extra!.section,
          label: d.label ?? "Asignación",
          // Después de las fijas, conservando el orden del programa.
          order: juevesSlots.length + i,
          allowTwo: sectionOk && (d.extra!.allowTwo || !!secondaryName),
          equalPair: false,
          primaryName,
          primaryToken: primaryName ? newToken() : null,
          primaryStatus: CONFIRM_STATUS.PENDIENTE,
          secondaryName,
          secondaryToken: secondaryName ? newToken() : null,
          secondaryStatus: CONFIRM_STATUS.PENDIENTE,
        };
      });
    assignments.push(...extras);

    try {
      await prisma.meeting.create({
        data: {
          date: w.date,
          day: MEETING_DAYS.JUEVES,
          congregationId: cong,
          weekLabel: w.label,
          // Datos del programa impreso (no son asignaciones de nadie).
          weeklyReading: w.reading || null,
          songStart: w.songStart || null,
          songMiddle: w.songMiddle || null,
          songEnd: w.songEnd || null,
          createdById: userId,
          confirmadorName: userName ?? null,
          assignments: { create: assignments },
        },
      });
      resumen.creadas++;
    } catch (error) {
      // Otra persona la creó mientras se importaba: se cuenta como omitida.
      if (isUniqueViolation(error)) {
        resumen.omitidas++;
        continue;
      }
      throw error;
    }
  }

  return resumen;
}

/**
 * Añade a una reunión que ya existe las oraciones que le falten, vacías.
 *
 * No duplica: solo crea la que no está. No toca ninguna otra casilla ni
 * ningún nombre. La de inicio se coloca al principio y la final al final, para
 * que la reunión y el programa impreso las enseñen en su sitio.
 */
async function ponerOracionesQueFalten(meeting: {
  id: string;
  assignments: { slotKey: string; order: number }[];
}): Promise<boolean> {
  const juevesSlots = slotsForDay(MEETING_DAYS.JUEVES);
  const faltan = SLOTS_SIEMPRE.filter(
    (k) => !meeting.assignments.some((a) => a.slotKey === k),
  );
  if (faltan.length === 0) return false;

  // Las responsabilidades mensuales van en 100 y pico: se dejan fuera para
  // que la oración final no acabe detrás de ellas.
  const ordenes = meeting.assignments.map((a) => a.order).filter((o) => o < 100);
  const ultimo = ordenes.length > 0 ? Math.max(...ordenes) : 0;

  await prisma.meetingAssignment.createMany({
    data: faltan.map((key) => {
      const slot = juevesSlots.find((s) => s.key === key)!;
      return {
        meetingId: meeting.id,
        slotKey: slot.key,
        section: slot.section,
        label: slot.label,
        order: key === "j_oracion_inicio" ? 1 : ultimo + 1,
        allowTwo: false,
        equalPair: false,
        primaryStatus: CONFIRM_STATUS.PENDIENTE,
      };
    }),
    skipDuplicates: true,
  });
  return true;
}
