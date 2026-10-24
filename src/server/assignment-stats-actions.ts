"use server";

// ============================================================================
//  Historial y estadísticas de asignaciones de reuniones.
//  Solo lectura. Acotado siempre a la congregación de la sesión.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { requireMeetingsAccess, congregationId } from "@/lib/access";
import { meetingDayLabel, MONTHLY_RESP_KEYS } from "@/lib/constants";
import {
  type BrotherStats,
  type Participation,
  daysSince,
  doneStateOf,
  matchPublisher,
  normalizeName,
} from "@/lib/assignment-stats";

export type StatsFilters = {
  /** Texto a buscar en el nombre del hermano. */
  q?: string;
  /** Sección de la reunión (TESOROS, SMM, VC, ...). */
  section?: string;
  /** Rango de fechas de la reunión, en ISO (YYYY-MM-DD). */
  desde?: string;
  hasta?: string;
  /** Incluir las responsabilidades (Acomodador, Audio, Limpieza...). */
  incluirResponsabilidades?: boolean;
};

export type StatsResult = {
  brothers: BrotherStats[];
  /** Nombres de las asignaciones que no casaron con ningún publicador. */
  unmatched: { name: string; count: number }[];
  /** Secciones presentes, para el desplegable de filtros. */
  sections: string[];
  /** Totales, para poder explicar de dónde salen los números. */
  totals: {
    participations: number;
    realizadas: number;
    noRealizadas: number;
    sinRegistrar: number;
    meetings: number;
    primeraReunion: Date | null;
    ultimaReunion: Date | null;
  };
};

/** Historial completo de asignaciones de la congregación, ya agrupado. */
export async function getAssignmentStats(
  filters: StatsFilters = {},
): Promise<StatsResult> {
  const user = await requireMeetingsAccess();
  const cong = congregationId(user);

  const desde = filters.desde ? new Date(`${filters.desde}T00:00:00`) : null;
  const hasta = filters.hasta ? new Date(`${filters.hasta}T23:59:59`) : null;

  const [assignments, publishers, rango] = await Promise.all([
    prisma.meetingAssignment.findMany({
      where: {
        meeting: {
          congregationId: cong,
          ...(desde || hasta
            ? {
                date: {
                  ...(desde && !isNaN(desde.getTime()) ? { gte: desde } : {}),
                  ...(hasta && !isNaN(hasta.getTime()) ? { lte: hasta } : {}),
                },
              }
            : {}),
        },
        ...(filters.section ? { section: filters.section } : {}),
        // Al menos uno de los dos puestos tiene hermano asignado.
        OR: [{ NOT: { primaryName: null } }, { NOT: { secondaryName: null } }],
      },
      select: {
        id: true,
        slotKey: true,
        section: true,
        label: true,
        primaryName: true,
        primaryStatus: true,
        primaryDone: true,
        secondaryName: true,
        secondaryStatus: true,
        secondaryDone: true,
        meeting: { select: { id: true, date: true, day: true, weekLabel: true } },
      },
      orderBy: { meeting: { date: "desc" } },
    }),
    prisma.publisher.findMany({
      where: { congregationId: cong },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        status: true,
        group: { select: { name: true } },
      },
    }),
    prisma.meeting.aggregate({
      where: { congregationId: cong },
      _min: { date: true },
      _max: { date: true },
      _count: true,
    }),
  ]);

  // Índice para el emparejamiento exacto (la parte barata).
  const indice = new Map(publishers.map((p) => [normalizeName(p.fullName), p]));

  // Clave de agrupación: el publicador emparejado o, si no hay, el texto
  // normalizado. Así las variantes del mismo nombre caen en el mismo hermano.
  const porClave = new Map<string, BrotherStats>();
  const sinEmparejar = new Map<string, number>();
  const secciones = new Set<string>();
  let realizadas = 0;
  let noRealizadas = 0;
  let sinRegistrar = 0;

  const añadir = (
    texto: string,
    part: Omit<Participation, "role"> & { role: Participation["role"] },
  ) => {
    const limpio = texto.trim();
    if (!limpio) return;
    const pub = matchPublisher(limpio, publishers, indice);
    const clave = pub ? `p:${pub.id}` : `t:${normalizeName(limpio)}`;

    if (!pub) sinEmparejar.set(limpio, (sinEmparejar.get(limpio) ?? 0) + 1);

    let b = porClave.get(clave);
    if (!b) {
      b = {
        name: pub?.fullName ?? limpio,
        publisherId: pub?.id ?? null,
        status: pub?.status ?? null,
        groupName: pub?.group?.name ?? null,
        variants: [],
        participations: [],
        doneCount: 0,
        asResponsable: 0,
        asAuxiliar: 0,
        lastDone: null,
        daysSinceDone: null,
        unrecordedCount: 0,
      };
      porClave.set(clave, b);
    }
    if (!b.variants.includes(limpio)) b.variants.push(limpio);
    b.participations.push(part);
    if (part.role === "responsable") b.asResponsable++;
    else b.asAuxiliar++;

    if (part.done === "realizada") {
      b.doneCount++;
      realizadas++;
      // Solo cuenta para "última realizada" lo que consta como realizado.
      if (!b.lastDone || part.date > b.lastDone) b.lastDone = part.date;
    } else if (part.done === "no_realizada") {
      noRealizadas++;
    } else {
      b.unrecordedCount++;
      sinRegistrar++;
    }
  };

  for (const a of assignments) {
    const esResponsabilidad =
      a.section === "RESPONSABILIDADES" ||
      a.section === "SAB_RESPONSABILIDADES" ||
      MONTHLY_RESP_KEYS.includes(a.slotKey);
    if (esResponsabilidad && !filters.incluirResponsabilidades) continue;
    secciones.add(a.section);

    const comun = {
      assignmentId: a.id,
      meetingId: a.meeting.id,
      date: a.meeting.date,
      dayLabel: meetingDayLabel(a.meeting.day, a.meeting.date),
      weekLabel: a.meeting.weekLabel,
      section: a.section,
      label: a.label,
    };
    if (a.primaryName?.trim()) {
      añadir(a.primaryName, {
        ...comun,
        role: "responsable",
        confirmStatus: a.primaryStatus,
        done: doneStateOf(a.primaryDone),
      });
    }
    if (a.secondaryName?.trim()) {
      añadir(a.secondaryName, {
        ...comun,
        role: "auxiliar",
        confirmStatus: a.secondaryStatus,
        done: doneStateOf(a.secondaryDone),
      });
    }
  }

  // Días desde la última realizada, y orden.
  const hoy = new Date();
  for (const b of porClave.values()) {
    b.daysSinceDone = b.lastDone ? daysSince(b.lastDone, hoy) : null;
    b.participations.sort((x, y) => y.date.getTime() - x.date.getTime());
  }

  let brothers = [...porClave.values()];

  // Búsqueda por nombre: también por las variantes, para que encuentre tanto
  // "Benjamín Saavedra" como "Benjamin Saavedra G.".
  const q = normalizeName(filters.q ?? "");
  if (q) {
    brothers = brothers.filter(
      (b) =>
        normalizeName(b.name).includes(q) ||
        b.variants.some((v) => normalizeName(v).includes(q)),
    );
  }

  brothers.sort(
    (a, b) =>
      (b.lastDone?.getTime() ?? -1) - (a.lastDone?.getTime() ?? -1) ||
      a.name.localeCompare(b.name, "es"),
  );

  return {
    brothers,
    unmatched: [...sinEmparejar.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es")),
    sections: [...secciones].sort(),
    totals: {
      participations: realizadas + noRealizadas + sinRegistrar,
      realizadas,
      noRealizadas,
      sinRegistrar,
      meetings: rango._count,
      primeraReunion: rango._min.date,
      ultimaReunion: rango._max.date,
    },
  };
}
