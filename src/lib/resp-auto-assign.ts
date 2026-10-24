// ============================================================================
//  Reparto automático de las responsabilidades del mes.
//
//  Módulo PURO (sin base de datos ni azar incontrolado: la aleatoriedad entra
//  por un generador que se puede fijar), para poder probarlo a fondo.
//
//  Reglas, en este orden:
//   1. Solo se propone a quien está registrado como disponible para esa
//      categoría.
//   2. Nadie hace DOS cosas en la misma reunión. Es imposible físicamente, así
//      que nunca se incumple: antes se deja el puesto sin cubrir.
//   3. Se evita que quien ya tiene una PARTE en esa reunión reciba además una
//      responsabilidad. Esto sí se incumple como último recurso, y entonces se
//      informa del conflicto en vez de ocultarlo.
//   4. Reparto equilibrado: entre los candidatos válidos va el que menos carga
//      lleva en el mes (contando lo que ya tenía antes de repartir).
//   5. Entre iguales, al azar, para que no salgan siempre los mismos.
// ============================================================================

import { normalizeName } from "@/lib/assignment-stats";

/** Una casilla de responsabilidad que hay que cubrir en una fecha concreta. */
export type Position = {
  dateISO: string;
  day: "JUEVES" | "SABADO";
  slotKey: string;
  slotLabel: string;
  category: string;
};

/** Lo que ya hay en una reunión, para no pisarlo ni crear conflictos. */
export type MeetingContext = {
  dateISO: string;
  /** Nombres que ya tienen una PARTE (Tesoros, SMM, VC…) en esa reunión. */
  partNames: string[];
  /** Nombres que ya tienen una RESPONSABILIDAD en esa reunión. */
  respNames: string[];
  /** Etiqueta para los mensajes ("12-18 de Octubre", "Jueves 15"…). */
  label: string;
  /** Parte concreta de cada nombre, para poder explicar el conflicto. */
  partLabelByName: Record<string, string>;
};

export type Candidate = {
  publisherId: string;
  name: string;
  /** Categorías en las que está disponible. */
  categories: string[];
  /** Responsabilidades que YA tiene este mes antes de repartir. */
  loadBefore: number;
  /**
   * Tipos de reunión en los que NO está disponible, pase lo que pase. Se usa
   * para quien conduce el Estudio de La Atalaya: ya está ocupado en la reunión
   * de fin de semana, así que no puede recibir además una responsabilidad.
   */
  unavailableDays?: string[];
};

export type Proposal = {
  dateISO: string;
  day: "JUEVES" | "SABADO";
  slotKey: string;
  slotLabel: string;
  name: string;
  publisherId: string;
  /** Tiene además una parte en esa misma reunión. */
  conflict: boolean;
  /** La parte que choca, para poder explicarlo. */
  conflictWith?: string;
};

export type Uncovered = {
  dateISO: string;
  slotKey: string;
  slotLabel: string;
  /** Por qué no se pudo cubrir. */
  reason: string;
};

export type AutoAssignResult = {
  proposals: Proposal[];
  uncovered: Uncovered[];
  /** Carga final por hermano (lo que ya tenía + lo propuesto). */
  loads: { name: string; before: number; added: number; total: number }[];
};

/** Generador reproducible: con la misma semilla, el mismo reparto. */
export function makeRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    // xorshift32: suficiente para desempatar, y reproducible en las pruebas.
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

export function autoAssign(
  positions: Position[],
  meetings: MeetingContext[],
  candidates: Candidate[],
  random: () => number = Math.random,
): AutoAssignResult {
  const porFecha = new Map(meetings.map((m) => [m.dateISO, m]));

  // Estado que se va actualizando mientras se reparte.
  const added = new Map<string, number>(); // publisherId -> cuántas se le dieron
  // Quién queda ocupado en cada reunión (partes + responsabilidades, ya sean
  // previas o recién propuestas).
  const ocupados = new Map<string, Set<string>>(); // dateISO -> nombres normalizados
  const conParte = new Map<string, Set<string>>(); // dateISO -> nombres con PARTE

  for (const m of meetings) {
    ocupados.set(
      m.dateISO,
      new Set(m.respNames.map(normalizeName).filter(Boolean)),
    );
    conParte.set(
      m.dateISO,
      new Set(m.partNames.map(normalizeName).filter(Boolean)),
    );
  }

  const porCategoria = new Map<string, Candidate[]>();
  for (const c of candidates) {
    for (const cat of c.categories) {
      if (!porCategoria.has(cat)) porCategoria.set(cat, []);
      porCategoria.get(cat)!.push(c);
    }
  }

  // Se empieza por las casillas con MENOS candidatos disponibles: así las
  // categorías con poca gente no se quedan sin nadie porque otra se los llevó.
  const orden = [...positions].sort((a, b) => {
    const na = porCategoria.get(a.category)?.length ?? 0;
    const nb = porCategoria.get(b.category)?.length ?? 0;
    return na - nb || a.dateISO.localeCompare(b.dateISO) || a.slotKey.localeCompare(b.slotKey);
  });

  const proposals: Proposal[] = [];
  const uncovered: Uncovered[] = [];

  for (const pos of orden) {
    // Quien no está disponible ese tipo de reunión (p. ej. conduce la Atalaya
    // el fin de semana) ni siquiera entra en la lista.
    const pool = (porCategoria.get(pos.category) ?? []).filter(
      (c) => !c.unavailableDays?.includes(pos.day),
    );
    if (pool.length === 0) {
      const registrados = (porCategoria.get(pos.category) ?? []).length;
      uncovered.push({
        dateISO: pos.dateISO,
        slotKey: pos.slotKey,
        slotLabel: pos.slotLabel,
        reason:
          registrados === 0
            ? "No hay ningún hermano registrado para esta responsabilidad."
            : "Los hermanos registrados no están disponibles en esa reunión.",
      });
      continue;
    }

    const ocupadosAqui = ocupados.get(pos.dateISO) ?? new Set<string>();
    const conParteAqui = conParte.get(pos.dateISO) ?? new Set<string>();

    // Regla 2: quien ya hace algo en esta reunión queda descartado del todo.
    const libres = pool.filter((c) => !ocupadosAqui.has(normalizeName(c.name)));
    if (libres.length === 0) {
      uncovered.push({
        dateISO: pos.dateISO,
        slotKey: pos.slotKey,
        slotLabel: pos.slotLabel,
        reason:
          "Todos los hermanos disponibles para esta responsabilidad ya tienen algo en esa reunión.",
      });
      continue;
    }

    // Regla 3: se prefiere a quien NO tenga una parte en esa reunión.
    const sinParte = libres.filter((c) => !conParteAqui.has(normalizeName(c.name)));
    const elegibles = sinParte.length > 0 ? sinParte : libres;
    const hayConflicto = sinParte.length === 0;

    // Regla 4: menor carga total (la previa más lo ya repartido).
    const carga = (c: Candidate) => c.loadBefore + (added.get(c.publisherId) ?? 0);
    const minima = Math.min(...elegibles.map(carga));
    const empatados = elegibles.filter((c) => carga(c) === minima);

    // Regla 5: azar entre los que empatan.
    const elegido = empatados[Math.floor(random() * empatados.length) % empatados.length];

    const m = porFecha.get(pos.dateISO);
    proposals.push({
      dateISO: pos.dateISO,
      day: pos.day,
      slotKey: pos.slotKey,
      slotLabel: pos.slotLabel,
      name: elegido.name,
      publisherId: elegido.publisherId,
      conflict: hayConflicto,
      ...(hayConflicto
        ? {
            conflictWith:
              m?.partLabelByName[normalizeName(elegido.name)] ?? "una parte de la reunión",
          }
        : {}),
    });

    added.set(elegido.publisherId, (added.get(elegido.publisherId) ?? 0) + 1);
    ocupadosAqui.add(normalizeName(elegido.name));
    ocupados.set(pos.dateISO, ocupadosAqui);
  }

  // Orden final por fecha y casilla, para que la vista previa se lea bien.
  proposals.sort(
    (a, b) => a.dateISO.localeCompare(b.dateISO) || a.slotKey.localeCompare(b.slotKey),
  );
  uncovered.sort(
    (a, b) => a.dateISO.localeCompare(b.dateISO) || a.slotKey.localeCompare(b.slotKey),
  );

  const loads = candidates
    .map((c) => ({
      name: c.name,
      before: c.loadBefore,
      added: added.get(c.publisherId) ?? 0,
      total: c.loadBefore + (added.get(c.publisherId) ?? 0),
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "es"));

  return { proposals, uncovered, loads };
}
