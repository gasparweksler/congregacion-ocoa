"use server";

// ============================================================================
//  "Asignar responsabilidades automáticamente".
//
//  Dos pasos separados a propósito:
//    1. proposeAutoAssignAction  -> calcula y devuelve la propuesta. No escribe
//       NADA: sirve para la vista previa, con sus conflictos y sus huecos.
//    2. applyAutoAssignAction    -> guarda lo que el usuario confirmó.
//
//  Al guardar se usa setMonthlyResponsibility, la misma función que usa la
//  pantalla cuando se escribe un nombre a mano: así no hay dos caminos de
//  escritura que puedan divergir (crea la reunión si falta, respeta los tokens
//  de confirmación y la estructura de la asignación).
//
//  Nunca se tocan las PARTES de las reuniones (Tesoros, Seamos Mejores
//  Maestros, Nuestra Vida Cristiana…), ni las responsabilidades que ya tengan
//  un nombre puesto: solo se rellenan las casillas vacías.
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMeetingsAccess, congregationId } from "@/lib/access";
import {
  MONTHLY_RESPONSIBILITIES,
  categoryOfSlot,
  monthName,
  WATCHTOWER_CATEGORY,
  CONFIRM_STATUS,
} from "@/lib/constants";
import { meetingDatesInMonth } from "@/lib/period";
import { getMeetingDays } from "@/lib/meeting-days";
import { findWeekMeeting } from "@/lib/meeting-week";
import { normalizeName } from "@/lib/assignment-stats";
import {
  autoAssign,
  type Candidate,
  type MeetingContext,
  type Position,
  type Proposal,
  type Uncovered,
} from "@/lib/resp-auto-assign";
import { setMonthlyResponsibilities } from "@/server/monthly-resp-actions";
import { logAudit } from "@/lib/audit";

export type AutoAssignPreview = {
  ok: boolean;
  error?: string;
  periodo: string;
  proposals: Proposal[];
  uncovered: Uncovered[];
  /** Casillas que ya tenían nombre y no se tocan. */
  kept: { dateISO: string; slotLabel: string; name: string }[];
  /** Carga por hermano tras el reparto. */
  loads: { name: string; before: number; added: number; total: number }[];
};

const VACIO: AutoAssignPreview = {
  ok: false,
  periodo: "",
  proposals: [],
  uncovered: [],
  kept: [],
  loads: [],
};

/** Solo las responsabilidades de publicador: la limpieza va por grupos. */
const SLOTS_PUBLICADOR = MONTHLY_RESPONSIBILITIES.filter(
  (r) => r.kind === "publisher",
);

export async function proposeAutoAssignAction(
  year: number,
  month: number,
): Promise<AutoAssignPreview> {
  const user = await requireMeetingsAccess();
  const cong = congregationId(user);
  const periodo = `${monthName(month)} ${year}`;

  const dias = await getMeetingDays(cong);
  const fechas = meetingDatesInMonth(year, month, dias);
  if (fechas.length === 0) {
    return { ...VACIO, periodo, error: "El mes seleccionado no tiene fechas de reunión." };
  }

  // Reuniones de la ventana del mes (±8 días: una reunión de semana guarda como
  // fecha el lunes de su rango, que puede caer en el mes anterior).
  const meetings = await prisma.meeting.findMany({
    where: {
      congregationId: cong,
      date: {
        gte: new Date(year, month - 1, 1 - 8, 0, 0, 0),
        lt: new Date(year, month, 1 + 8, 0, 0, 0),
      },
    },
    include: { assignments: true },
  });

  // Disponibles por categoría.
  const voluntarios = await prisma.responsibilityVolunteer.findMany({
    where: { congregationId: cong },
    select: {
      category: true,
      publisherId: true,
      publisher: { select: { fullName: true } },
    },
  });
  if (voluntarios.length === 0) {
    return {
      ...VACIO,
      periodo,
      error:
        "Todavía no hay hermanos registrados como disponibles. Añádelos arriba, en «Hermanos disponibles por responsabilidad».",
    };
  }

  const positions: Position[] = [];
  const contexts: MeetingContext[] = [];
  const kept: AutoAssignPreview["kept"] = [];
  // Cuántas responsabilidades lleva ya cada hermano este mes.
  const cargaPrevia = new Map<string, number>();

  for (const { date, day } of fechas) {
    const dateISO = `${year}-${String(month).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    // Misma regla que usa la pantalla para emparejar fecha y reunión.
    const reunion = findWeekMeeting(meetings, date, day);

    const partNames: string[] = [];
    const respNames: string[] = [];
    const partLabelByName: Record<string, string> = {};

    for (const a of reunion?.assignments ?? []) {
      const esResp = SLOTS_PUBLICADOR.some((r) => r.key === a.slotKey) || a.slotKey === "r_limpieza";
      for (const n of [a.primaryName, a.secondaryName]) {
        if (!n?.trim()) continue;
        if (esResp) {
          respNames.push(n);
          cargaPrevia.set(normalizeName(n), (cargaPrevia.get(normalizeName(n)) ?? 0) + 1);
        } else {
          partNames.push(n);
          // La primera parte basta para explicar el choque.
          const k = normalizeName(n);
          if (!partLabelByName[k]) partLabelByName[k] = a.label;
        }
      }
    }

    contexts.push({
      dateISO,
      label: reunion?.weekLabel ?? dateISO,
      partNames,
      respNames,
      partLabelByName,
    });

    // Solo las casillas VACÍAS entran en el reparto.
    for (const slot of SLOTS_PUBLICADOR) {
      const cat = categoryOfSlot(slot.key);
      if (!cat) continue;
      const actual = reunion?.assignments.find((a) => a.slotKey === slot.key);
      if (actual?.primaryName?.trim()) {
        kept.push({ dateISO, slotLabel: slot.label, name: actual.primaryName.trim() });
        continue;
      }
      positions.push({
        dateISO,
        day,
        slotKey: slot.key,
        slotLabel: slot.label,
        category: cat.key,
      });
    }
  }

  if (positions.length === 0) {
    return {
      ...VACIO,
      periodo,
      error: "Todas las responsabilidades del mes ya tienen a alguien asignado.",
    };
  }

  // Quién conduce la Atalaya: no es una responsabilidad que se reparta, es una
  // exclusión para la reunión de fin de semana.
  const conduceAtalaya = new Set(
    voluntarios
      .filter((v) => v.category === WATCHTOWER_CATEGORY.key)
      .map((v) => v.publisherId),
  );

  // "Repetir los de Audio": los de Video son exactamente los de Audio.
  const repetirAudio = await prisma.congregation
    .findUnique({ where: { id: cong }, select: { videoSameAsAudio: true } })
    .then((c) => c?.videoSameAsAudio ?? false);

  // Candidatos: un hermano por publicador, con todas sus categorías.
  const porPublicador = new Map<string, Candidate>();
  for (const v of voluntarios) {
    // La Atalaya no es una categoría de reparto.
    if (v.category === WATCHTOWER_CATEGORY.key) continue;
    // Con el interruptor puesto, Video es EXACTAMENTE Audio: lo que hubiera
    // apuntado en Video se ignora mientras esté activo.
    if (repetirAudio && v.category === "VIDEO") continue;

    const cats = [v.category];
    if (repetirAudio && v.category === "AUDIO") cats.push("VIDEO");

    const prev = porPublicador.get(v.publisherId);
    if (prev) {
      for (const c of cats) if (!prev.categories.includes(c)) prev.categories.push(c);
      continue;
    }
    porPublicador.set(v.publisherId, {
      publisherId: v.publisherId,
      name: v.publisher.fullName,
      categories: cats,
      loadBefore: cargaPrevia.get(normalizeName(v.publisher.fullName)) ?? 0,
      ...(conduceAtalaya.has(v.publisherId)
        ? { unavailableDays: ["SABADO"] }
        : {}),
    });
  }

  const resultado = autoAssign(positions, contexts, [...porPublicador.values()]);

  return {
    ok: true,
    periodo,
    proposals: resultado.proposals,
    uncovered: resultado.uncovered,
    kept,
    loads: resultado.loads.filter((l) => l.total > 0),
  };
}

/**
 * "Limpiar Mes": deja en blanco las responsabilidades de publicador del mes,
 * para poder volver a repartirlas.
 *
 * NO toca las partes de las reuniones (Tesoros, Seamos Mejores Maestros…) ni
 * "Limpieza por Grupos", que se lleva aparte y el reparto automático no sabría
 * reponer.
 *
 * Deja los campos igual que al borrar un nombre a mano en la pantalla: sin
 * nombre, sin enlace de confirmación y en estado Pendiente.
 */
export async function clearMonthResponsibilitiesAction(
  year: number,
  month: number,
): Promise<ApplyResult> {
  const user = await requireMeetingsAccess();
  const cong = congregationId(user);

  const dias = await getMeetingDays(cong);
  const fechas = meetingDatesInMonth(year, month, dias);
  if (fechas.length === 0) {
    return { ok: false, message: "El mes seleccionado no tiene fechas de reunión." };
  }

  // Las reuniones de la ventana del mes (±8 días por las de rango semanal).
  const meetings = await prisma.meeting.findMany({
    where: {
      congregationId: cong,
      date: {
        gte: new Date(year, month - 1, 1 - 8, 0, 0, 0),
        lt: new Date(year, month, 1 + 8, 0, 0, 0),
      },
    },
    select: { id: true, date: true, day: true, weekLabel: true },
  });

  // Solo las reuniones que de verdad corresponden a una fecha de ESTE mes.
  const ids = new Set<string>();
  for (const { date, day } of fechas) {
    const m = findWeekMeeting(meetings, date, day);
    if (m) ids.add(m.id);
  }
  if (ids.size === 0) {
    return { ok: false, message: "No hay reuniones de ese mes que limpiar." };
  }

  const res = await prisma.meetingAssignment.updateMany({
    where: {
      meetingId: { in: [...ids] },
      slotKey: { in: SLOTS_PUBLICADOR.map((r) => r.key) },
      NOT: { primaryName: null },
    },
    data: {
      primaryName: null,
      primaryToken: null,
      primaryStatus: CONFIRM_STATUS.PENDIENTE,
    },
  });

  await logAudit({
    userId: user.id,
    action: "EDITAR",
    entity: "Responsabilidades",
    details: `Limpiar mes ${monthName(month)} ${year}: ${res.count} responsabilidad(es) vaciadas.`,
  });

  revalidatePath("/reuniones/responsabilidades");
  revalidatePath("/reuniones");

  return {
    ok: true,
    message:
      res.count === 0
        ? `No había responsabilidades que limpiar en ${monthName(month)} ${year}.`
        : `Se vaciaron ${res.count} responsabilidad(es) de ${monthName(month)} ${year}. La Limpieza por Grupos y las partes de las reuniones no se tocaron.`,
  };
}

export type ApplyResult = { ok: boolean; message: string };

export async function applyAutoAssignAction(
  year: number,
  month: number,
  proposals: Proposal[],
  /**
   * Se guarda por tandas (una fecha cada vez) para poder enseñar el avance.
   * Solo la última tanda deja la anotación en Auditoría, con el total.
   */
  resumen?: { anotar: boolean; total: number; conConflicto: number },
): Promise<ApplyResult> {
  const user = await requireMeetingsAccess();
  const cong = congregationId(user);

  if (!Array.isArray(proposals) || proposals.length === 0) {
    return { ok: false, message: "No hay nada que guardar." };
  }

  // --- Validación: nada se guarda a ciegas ---
  const dias = await getMeetingDays(cong);
  const fechasValidas = new Map(
    meetingDatesInMonth(year, month, dias).map(({ date, day }) => [
      `${year}-${String(month).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      day,
    ]),
  );
  const publicadores = new Set(
    (
      await prisma.publisher.findMany({
        where: { congregationId: cong },
        select: { fullName: true },
      })
    ).map((p) => normalizeName(p.fullName)),
  );

  for (const p of proposals) {
    if (fechasValidas.get(p.dateISO) !== p.day) {
      return { ok: false, message: "La propuesta tiene una fecha que no es del mes." };
    }
    if (!SLOTS_PUBLICADOR.some((r) => r.key === p.slotKey)) {
      return { ok: false, message: "La propuesta tiene una responsabilidad desconocida." };
    }
    if (!publicadores.has(normalizeName(p.name))) {
      return {
        ok: false,
        message: `"${p.name}" no es un publicador de tu congregación.`,
      };
    }
  }

  // --- Guardado ---
  // Se usa la MISMA función que al escribir un nombre a mano (aquella es el
  // caso de una sola casilla de esta), para no tener un segundo camino de
  // escritura que pudiera comportarse distinto.
  //
  // Las ~70 casillas van en un solo lote: se lee el mes entero de una vez y se
  // escribe todo junto. Antes iban fecha por fecha, esperando cada una.
  const { guardadas } = await setMonthlyResponsibilities(
    proposals.map((p) => ({
      dateISO: p.dateISO,
      day: p.day,
      slotKey: p.slotKey,
      value: p.name,
    })),
  );

  const conConflicto = resumen?.conConflicto ?? proposals.filter((p) => p.conflict).length;
  const total = resumen?.total ?? guardadas;

  // Una sola anotación por reparto, no una por tanda.
  if (!resumen || resumen.anotar) {
    await logAudit({
      userId: user.id,
      action: "EDITAR",
      entity: "Responsabilidades",
      details:
        `Asignación automática de ${monthName(month)} ${year}: ${total} responsabilidad(es)` +
        (conConflicto ? `, ${conConflicto} con conflicto aceptado.` : "."),
    });
  }

  return {
    ok: true,
    message:
      `Se guardaron ${total} responsabilidad(es) de ${monthName(month)} ${year}.` +
      (conConflicto
        ? ` ${conConflicto} se asignaron a hermanos que ya tenían una parte en esa reunión.`
        : ""),
  };
}

