"use server";

// ============================================================================
//  Historial y estadísticas de asignaciones de reuniones.
//  Solo lectura. Acotado siempre a la congregación de la sesión.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { requireMeetingsAccess, congregationId } from "@/lib/access";
import {
  meetingDayLabel,
  MONTHLY_RESP_KEYS,
  CONFIRM_STATUS,
  PUBLISHER_STATUS,
} from "@/lib/constants";
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
  /**
   * Publicadores activos de la congregación SIN ninguna asignación en el
   * período: no han tenido participación.
   */
  neverAssigned: { name: string; groupName: string | null; status: string }[];
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

/** Menor y mayor de dos fechas que pueden faltar. */
const menorFecha = (a: Date | null, b: Date | null): Date | null =>
  !a ? b : !b ? a : a < b ? a : b;
const mayorFecha = (a: Date | null, b: Date | null): Date | null =>
  !a ? b : !b ? a : a > b ? a : b;

/** Historial completo de asignaciones de la congregación, ya agrupado. */
export async function getAssignmentStats(
  filters: StatsFilters = {},
): Promise<StatsResult> {
  const user = await requireMeetingsAccess();
  const cong = congregationId(user);

  const desde = filters.desde ? new Date(`${filters.desde}T00:00:00`) : null;
  const hasta = filters.hasta ? new Date(`${filters.hasta}T23:59:59`) : null;

  /**
   * Tope duro: las estadísticas solo miran lo que ya pasó.
   *
   * Una reunión de fecha futura está programada, no realizada, y contarla
   * falsearía tanto los totales como los días sin asignación. Se aplica además
   * del filtro de fechas que ponga el usuario, así que manda el más estricto.
   * La fecha guardada de cada reunión es el inicio de su semana, de modo que
   * "antes de hoy" equivale a semanas ya empezadas antes de hoy.
   */
  const hoyInicio = new Date();
  hoyInicio.setHours(0, 0, 0, 0);
  const rangoFechas = {
    ...(desde && !isNaN(desde.getTime()) ? { gte: desde } : {}),
    ...(hasta && !isNaN(hasta.getTime()) ? { lte: hasta } : {}),
    lt: hoyInicio,
  };

  const [assignments, historial, publishers, rango] = await Promise.all([
    prisma.meetingAssignment.findMany({
      where: {
        meeting: { congregationId: cong, date: rangoFechas },
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
    // Historial de reuniones ya eliminadas: se guardó al borrarlas para que
    // las estadísticas no pierdan lo que pasó.
    prisma.assignmentHistory.findMany({
      where: {
        congregationId: cong,
        meetingDate: rangoFechas,
        ...(filters.section ? { section: filters.section } : {}),
        OR: [{ NOT: { primaryName: null } }, { NOT: { secondaryName: null } }],
      },
      orderBy: { meetingDate: "desc" },
    }),
    prisma.publisher.findMany({
      where: { congregationId: cong },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        status: true,
        active: true,
        group: { select: { name: true } },
      },
    }),
    prisma.meeting.aggregate({
      // Solo las reuniones ya pasadas: las futuras no son historial.
      where: { congregationId: cong, date: { lt: hoyInicio } },
      _min: { date: true },
      _max: { date: true },
      _count: true,
    }),
  ]);

  // Reuniones eliminadas que aún aportan historial: se cuentan aparte porque
  // ya no están en la tabla de reuniones. Si no quedó su id, se identifican
  // por fecha y tipo de día.
  const reunionesBorradas = new Set(
    historial.map((h) => h.meetingId ?? `${h.meetingDate.toISOString()}_${h.day}`),
  );
  const fechasBorradas = historial.reduce<{ min: Date | null; max: Date | null }>(
    (acc, h) => ({
      min: !acc.min || h.meetingDate < acc.min ? h.meetingDate : acc.min,
      max: !acc.max || h.meetingDate > acc.max ? h.meetingDate : acc.max,
    }),
    { min: null, max: null },
  );

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

  // Las dos fuentes se tratan igual: las asignaciones vivas y las de reuniones
  // ya eliminadas (que se guardaron al borrarlas). Lo único que las distingue
  // es `deleted`, para poder avisarlo en la pantalla.
  type Fila = {
    assignmentId: string;
    meetingId: string;
    date: Date;
    day: string;
    weekLabel: string | null;
    slotKey: string;
    section: string;
    label: string;
    primaryName: string | null;
    primaryStatus: string | null;
    primaryDone: boolean | null;
    secondaryName: string | null;
    secondaryStatus: string | null;
    secondaryDone: boolean | null;
    deleted: boolean;
  };

  const filas: Fila[] = [
    ...assignments.map((a) => ({
      assignmentId: a.id,
      meetingId: a.meeting.id,
      date: a.meeting.date,
      day: a.meeting.day,
      weekLabel: a.meeting.weekLabel,
      slotKey: a.slotKey,
      section: a.section,
      label: a.label,
      primaryName: a.primaryName,
      primaryStatus: a.primaryStatus,
      primaryDone: a.primaryDone,
      secondaryName: a.secondaryName,
      secondaryStatus: a.secondaryStatus,
      secondaryDone: a.secondaryDone,
      deleted: false,
    })),
    ...historial.map((h) => ({
      assignmentId: h.id,
      // La reunión ya no existe; se guarda su id solo como referencia.
      meetingId: h.meetingId ?? "",
      date: h.meetingDate,
      day: h.day,
      weekLabel: h.weekLabel,
      slotKey: h.slotKey,
      section: h.section,
      label: h.label,
      primaryName: h.primaryName,
      primaryStatus: h.primaryStatus,
      primaryDone: h.primaryDone,
      secondaryName: h.secondaryName,
      secondaryStatus: h.secondaryStatus,
      secondaryDone: h.secondaryDone,
      deleted: true,
    })),
  ];

  for (const a of filas) {
    const esResponsabilidad =
      a.section === "RESPONSABILIDADES" ||
      a.section === "SAB_RESPONSABILIDADES" ||
      MONTHLY_RESP_KEYS.includes(a.slotKey);
    if (esResponsabilidad && !filters.incluirResponsabilidades) continue;
    secciones.add(a.section);

    const comun = {
      assignmentId: a.assignmentId,
      meetingId: a.meetingId,
      date: a.date,
      dayLabel: meetingDayLabel(a.day, a.date),
      weekLabel: a.weekLabel,
      section: a.section,
      label: a.label,
      deleted: a.deleted,
    };
    if (a.primaryName?.trim()) {
      añadir(a.primaryName, {
        ...comun,
        role: "responsable",
        confirmStatus: a.primaryStatus ?? CONFIRM_STATUS.PENDIENTE,
        done: doneStateOf(a.primaryDone),
      });
    }
    if (a.secondaryName?.trim()) {
      añadir(a.secondaryName, {
        ...comun,
        role: "auxiliar",
        confirmStatus: a.secondaryStatus ?? CONFIRM_STATUS.PENDIENTE,
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

  // Publicadores que NO aparecen en ninguna asignación del período: nunca han
  // participado. Se calcula antes del filtro de búsqueda, para que escribir un
  // nombre no cambie esta lista. Se dejan fuera los inactivos, que no entran en
  // el reparto de asignaciones.
  const conAlgo = new Set(
    brothers.map((b) => b.publisherId).filter((id): id is string => !!id),
  );
  const neverAssigned = publishers
    .filter(
      (p) =>
        !conAlgo.has(p.id) &&
        p.active &&
        p.status !== PUBLISHER_STATUS.INACTIVO,
    )
    .map((p) => ({
      name: p.fullName,
      groupName: p.group?.name ?? null,
      status: p.status,
    }));

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
    neverAssigned,
    unmatched: [...sinEmparejar.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es")),
    sections: [...secciones].sort(),
    totals: {
      participations: realizadas + noRealizadas + sinRegistrar,
      realizadas,
      noRealizadas,
      sinRegistrar,
      // Las reuniones eliminadas también cuentan: su historial sigue aquí.
      meetings: rango._count + reunionesBorradas.size,
      primeraReunion: menorFecha(rango._min.date, fechasBorradas.min),
      ultimaReunion: mayorFecha(rango._max.date, fechasBorradas.max),
    },
  };
}
