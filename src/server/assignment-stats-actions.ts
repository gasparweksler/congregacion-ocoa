"use server";

// ============================================================================
//  Historial y estadísticas de asignaciones de reuniones.
//  Solo lectura. Acotado siempre a la congregación de la sesión.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { getMeetingDays } from "@/lib/meeting-days";
import { requireMeetingsAccess, congregationId } from "@/lib/access";
import { realMeetingDate } from "@/lib/meeting-week";
import { weekdayOfMeetingDay } from "@/lib/constants";
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
  // La consulta pide una semana de más por arriba: una reunión guardada en
  // el lunes de su semana puede tener su día real varios días después, y se
  // descarta luego comparando ya con la fecha corregida.
  const topeConsulta = new Date(hoyInicio);
  topeConsulta.setDate(topeConsulta.getDate() + 8);
  const rangoFechas = {
    ...(desde && !isNaN(desde.getTime()) ? { gte: desde } : {}),
    ...(hasta && !isNaN(hasta.getTime()) ? { lte: hasta } : {}),
    lt: topeConsulta,
  };

  const diasCongregacion = await getMeetingDays(cong);

  /** La fecha en que se reunieron de verdad (no el lunes del rango). */
  const fechaReal = (
    stored: Date,
    day: string,
    weekLabel: string | null,
  ): Date =>
    realMeetingDate(stored, day, {
      weekLabel,
      weekday: weekdayOfMeetingDay(day, diasCongregacion),
    });


  const [assignments, historial, publishers, todasLasReuniones] = await Promise.all([
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
        secondaryName: true,
        secondaryStatus: true,
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
    // Para el "historial disponible". No se usa aggregate porque la fecha
    // guardada puede ser el lunes del rango: hay que corregirla antes de
    // decidir si la reunión ya pasó y cuál fue la primera y la última.
    prisma.meeting.findMany({
      where: { congregationId: cong, date: { lt: topeConsulta } },
      select: { date: true, day: true, weekLabel: true },
    }),
  ]);

  // Reuniones eliminadas que aún aportan historial: se cuentan aparte porque
  // ya no están en la tabla de reuniones. Si no quedó su id, se identifican
  // por fecha y tipo de día.
  const reunionesBorradas = new Set(
    historial.map((h) => h.meetingId ?? `${h.meetingDate.toISOString()}_${h.day}`),
  );
  const fechasBorradas = historial.reduce<{ min: Date | null; max: Date | null }>(
    (acc, h) => {
      const f = fechaReal(h.meetingDate, h.day, h.weekLabel);
      return {
        min: !acc.min || f < acc.min ? f : acc.min,
        max: !acc.max || f > acc.max ? f : acc.max,
      };
    },
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
        lastAssigned: null,
        daysSinceAssigned: null,
        lastDone: null,
        daysSinceDone: null,
        unrecordedCount: 0,
      };
      porClave.set(clave, b);
    }
    if (!b.variants.includes(limpio)) b.variants.push(limpio);
    b.participations.push(part);
    // La asignación cuenta aunque nadie registrara su cumplimiento: para el
    // aviso de días sin asignación lo que importa es que le tocó.
    if (!b.lastAssigned || part.date > b.lastAssigned) b.lastAssigned = part.date;
    if (part.role === "responsable") b.asResponsable++;
    else b.asAuxiliar++;

    if (part.done === "confirmada") {
      b.doneCount++;
      realizadas++;
      // Solo cuenta como "última confirmada" lo que el hermano respondió.
      if (!b.lastDone || part.date > b.lastDone) b.lastDone = part.date;
    } else if (part.done === "rechazada") {
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
    secondaryName: string | null;
    secondaryStatus: string | null;
    deleted: boolean;
  };

  // Las reuniones que de verdad ya ocurrieron, en orden.
  const pasadas = todasLasReuniones
    .map((m) => fechaReal(m.date, m.day, m.weekLabel))
    .filter((d) => d < hoyInicio)
    .sort((a, b) => a.getTime() - b.getTime());

  const filas: Fila[] = [
    ...assignments.map((a) => ({
      assignmentId: a.id,
      meetingId: a.meeting.id,
      date: fechaReal(a.meeting.date, a.meeting.day, a.meeting.weekLabel),
      day: a.meeting.day,
      weekLabel: a.meeting.weekLabel,
      slotKey: a.slotKey,
      section: a.section,
      label: a.label,
      primaryName: a.primaryName,
      primaryStatus: a.primaryStatus,
      secondaryName: a.secondaryName,
      secondaryStatus: a.secondaryStatus,
      deleted: false,
    })),
    ...historial.map((h) => ({
      assignmentId: h.id,
      // La reunión ya no existe; se guarda su id solo como referencia.
      meetingId: h.meetingId ?? "",
      date: fechaReal(h.meetingDate, h.day, h.weekLabel),
      day: h.day,
      weekLabel: h.weekLabel,
      slotKey: h.slotKey,
      section: h.section,
      label: h.label,
      primaryName: h.primaryName,
      primaryStatus: h.primaryStatus,
      secondaryName: h.secondaryName,
      secondaryStatus: h.secondaryStatus,
      deleted: true,
    })),
  ];

  for (const a of filas) {
    // El tope de "solo lo ya pasado", ahora sobre el día real de la reunión.
    if (a.date >= hoyInicio) continue;
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
      dayLabel: meetingDayLabel(a.day, a.date, {
        weekLabel: a.weekLabel,
        days: diasCongregacion,
      }),
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
        done: doneStateOf(a.primaryStatus),
      });
    }
    if (a.secondaryName?.trim()) {
      añadir(a.secondaryName, {
        ...comun,
        role: "auxiliar",
        confirmStatus: a.secondaryStatus ?? CONFIRM_STATUS.PENDIENTE,
        done: doneStateOf(a.secondaryStatus),
      });
    }
  }

  // Días desde la última realizada, y orden.
  const hoy = new Date();
  for (const b of porClave.values()) {
    b.daysSinceAssigned = b.lastAssigned ? daysSince(b.lastAssigned, hoy) : null;
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

  // Por la última asignación que tuvieron: arriba los que participaron hace
  // poco, al final los que llevan más tiempo sin que les toque.
  brothers.sort(
    (a, b) =>
      (b.lastAssigned?.getTime() ?? -1) - (a.lastAssigned?.getTime() ?? -1) ||
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
      meetings: pasadas.length + reunionesBorradas.size,
      primeraReunion: menorFecha(pasadas[0] ?? null, fechasBorradas.min),
      ultimaReunion: mayorFecha(pasadas[pasadas.length - 1] ?? null, fechasBorradas.max),
    },
  };
}
