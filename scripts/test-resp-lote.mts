// ============================================================================
//  Guardado de responsabilidades en lote.
//
//  A. Las reglas (módulo puro monthly-resp-plan.ts): qué fechas necesitan
//     reunión, qué casillas cambian y cuándo se renueva el enlace de WhatsApp.
//  B. Contra la base: el camino nuevo (un lote) escribe EXACTAMENTE las mismas
//     filas que el viejo (casilla por casilla), y cuánto más rápido es.
//
//  La parte B crea su propia congregación de prueba y la borra al terminar.
//
//    npx tsx scripts/test-resp-lote.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";
import {
  claveFecha,
  fechasQueFaltan,
  planearEscrituras,
  tokenYEstado,
  type CasillaPrevia,
} from "../src/lib/monthly-resp-plan.js";
import {
  MONTHLY_RESPONSIBILITIES,
  CONFIRM_STATUS,
  slotsForDay,
} from "../src/lib/constants.js";
import { findWeekMeeting } from "../src/lib/meeting-week.js";
import { isUniqueViolation } from "../src/server/actions-shared.js";
import crypto from "node:crypto";

const p = new PrismaClient();
const PREFIJO = "ZZ Lote";
let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};
const titulo = (t: string) => console.log(`\n${t}`);

const newToken = () => crypto.randomUUID().replace(/-/g, "");
const fechaDe = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
};

// ===========================================================================
//  A. LAS REGLAS, SIN BASE DE DATOS
// ===========================================================================
console.log("A. Reglas del guardado (módulo puro)\n");

titulo("A1. Qué fechas necesitan que se cree la reunión");
{
  const entries = [
    { dateISO: "2026-03-05", day: "JUEVES" as const, slotKey: "r_audio", value: "Juan" },
    { dateISO: "2026-03-07", day: "SABADO" as const, slotKey: "r_audio", value: "" },
    { dateISO: "2026-03-12", day: "JUEVES" as const, slotKey: "r_audio", value: "Pedro" },
  ];
  const yaHay = new Map([[claveFecha("2026-03-12", "JUEVES"), "m-existente"]]);
  const faltan = fechasQueFaltan(entries, yaHay);
  check(faltan.length === 1, `solo falta una fecha (faltan ${faltan.length})`);
  check(faltan[0]?.dateISO === "2026-03-05", "es la que recibe un nombre y no tiene reunión");
  check(
    !faltan.some((f) => f.dateISO === "2026-03-07"),
    "una casilla vacía NO inventa una reunión que no existía",
  );
  check(
    !faltan.some((f) => f.dateISO === "2026-03-12"),
    "la que ya tiene reunión no se vuelve a crear",
  );
}

titulo("A2. Token y estado de confirmación");
{
  const nuevo = () => "TOKEN-NUEVO";

  const sinPrevio = tokenYEstado(false, "Juan Pérez", undefined, nuevo);
  check(sinPrevio.token === "TOKEN-NUEVO", "casilla nueva: se emite un enlace");
  check(sinPrevio.status === CONFIRM_STATUS.PENDIENTE, "y queda Pendiente");

  const mismo = tokenYEstado(
    false,
    "Juan Pérez",
    { primaryName: "Juan Pérez", primaryToken: "VIEJO", primaryStatus: CONFIRM_STATUS.CONFIRMADO },
    nuevo,
  );
  check(mismo.token === "VIEJO", "la misma persona conserva su enlace");
  check(
    mismo.status === CONFIRM_STATUS.CONFIRMADO,
    "y conserva su confirmación (no se le vuelve a preguntar)",
  );

  const cambio = tokenYEstado(
    false,
    "Pedro Ruiz",
    { primaryName: "Juan Pérez", primaryToken: "VIEJO", primaryStatus: CONFIRM_STATUS.CONFIRMADO },
    nuevo,
  );
  check(cambio.token === "TOKEN-NUEVO", "al cambiar de persona se emite un enlace nuevo");
  check(
    cambio.status === CONFIRM_STATUS.PENDIENTE,
    "y vuelve a Pendiente (el enlace viejo deja de servir)",
  );

  const sinToken = tokenYEstado(
    false,
    "Juan Pérez",
    { primaryName: "Juan Pérez", primaryToken: null, primaryStatus: CONFIRM_STATUS.PENDIENTE },
    nuevo,
  );
  check(sinToken.token === "TOKEN-NUEVO", "si se quedó sin enlace, se le emite uno");

  const vaciar = tokenYEstado(
    false,
    "",
    { primaryName: "Juan Pérez", primaryToken: "VIEJO", primaryStatus: CONFIRM_STATUS.CONFIRMADO },
    nuevo,
  );
  check(vaciar.token === null, "al vaciar la casilla se borra el enlace");
  check(vaciar.status === CONFIRM_STATUS.PENDIENTE, "y vuelve a Pendiente");

  const grupo = tokenYEstado(true, "Grupo 1", undefined, nuevo);
  check(grupo.token === null, "Limpieza por Grupos nunca lleva enlace (no se confirma)");
}

titulo("A3. El plan descarta lo que no toca");
{
  const entries = [
    { dateISO: "2026-03-05", day: "JUEVES" as const, slotKey: "r_audio", value: "Juan", label: "Audio", esGrupo: false },
    // Fecha sin reunión: se descarta en vez de escribir en el vacío.
    { dateISO: "2026-03-07", day: "SABADO" as const, slotKey: "r_audio", value: "", label: "Audio", esGrupo: false },
  ];
  const ids = new Map([[claveFecha("2026-03-05", "JUEVES"), "m1"]]);
  const previas: CasillaPrevia[] = [
    {
      id: "a1",
      meetingId: "m1",
      slotKey: "r_audio",
      primaryName: null,
      primaryToken: null,
      primaryStatus: CONFIRM_STATUS.PENDIENTE,
    },
  ];
  const plan = planearEscrituras(entries, ids, previas, newToken);
  check(plan.length === 1, `una sola escritura (hay ${plan.length})`);
  check(plan[0].assignmentId === "a1", "actualiza la casilla que ya existía, no crea otra");
  check(plan[0].primaryName === "Juan", "con el nombre escrito");
}

// ===========================================================================
//  B. CONTRA LA BASE: mismo resultado, mucho más rápido
// ===========================================================================
console.log("\n\nB. Contra la base de datos");

async function limpiar() {
  const congs = await p.congregation.findMany({
    where: { name: { startsWith: PREFIJO } },
    select: { id: true },
  });
  const ids = congs.map((c) => c.id);
  if (!ids.length) return;
  await p.auditLog.deleteMany({ where: { congregationId: { in: ids } } });
  await p.user.deleteMany({ where: { congregationId: { in: ids } } });
  await p.congregation.deleteMany({ where: { id: { in: ids } } });
}

/** Igual que createMeetingForDate de la acción. */
async function crearReunion(
  date: Date,
  day: "JUEVES" | "SABADO",
  userId: string,
  cong: string,
): Promise<string> {
  const asig = slotsForDay(day).filter((s) => !s.section.includes("RESPONSABILIDADES"));
  try {
    const m = await p.meeting.create({
      data: {
        date,
        day,
        congregationId: cong,
        createdById: userId,
        assignments: {
          create: [
            ...asig.map((s, i) => ({
              slotKey: s.key,
              section: s.section,
              label: s.label,
              order: i,
              allowTwo: s.allowTwo,
              equalPair: !!s.equalPair,
            })),
            ...MONTHLY_RESPONSIBILITIES.map((r, i) => ({
              slotKey: r.key,
              section: "RESPONSABILIDADES",
              label: r.label,
              allowTwo: false,
              equalPair: false,
              order: 100 + i,
            })),
          ],
        },
      },
    });
    return m.id;
  } catch (e) {
    if (isUniqueViolation(e)) {
      const hay = await p.meeting.findUnique({
        where: { congregationId_date_day: { congregationId: cong, date, day } },
        select: { id: true },
      });
      if (hay) return hay.id;
    }
    throw e;
  }
}

type Entrada = { dateISO: string; day: "JUEVES" | "SABADO"; slotKey: string; value: string };

/** EL CAMINO VIEJO: cada casilla con sus cuatro consultas, de una en una. */
async function guardarUnaAUna(entradas: Entrada[], userId: string, cong: string) {
  for (const e of entradas) {
    const resp = MONTHLY_RESPONSIBILITIES.find((r) => r.key === e.slotKey)!;
    const date = fechaDe(e.dateISO);
    const [y, m, d] = e.dateISO.split("-").map(Number);
    const existing = await p.meeting.findMany({
      where: {
        congregationId: cong,
        date: { gte: new Date(y, m - 1, d - 8), lt: new Date(y, m - 1, d + 8) },
      },
      select: { id: true, date: true, day: true, weekLabel: true },
    });
    let meetingId = findWeekMeeting(existing, date, e.day)?.id ?? null;
    if (!meetingId) {
      if (!e.value.trim()) continue;
      meetingId = await crearReunion(date, e.day, userId, cong);
    }
    const prev = await p.meetingAssignment.findFirst({
      where: { meetingId, slotKey: e.slotKey },
    });
    const { token, status } = tokenYEstado(
      resp.kind === "group",
      e.value.trim(),
      prev ?? undefined,
      newToken,
    );
    const data = {
      section: "RESPONSABILIDADES",
      label: resp.label,
      allowTwo: false,
      equalPair: false,
      primaryName: e.value.trim() || null,
      primaryToken: token,
      primaryStatus: status,
    };
    if (prev) {
      await p.meetingAssignment.update({ where: { id: prev.id }, data });
    } else {
      await p.meetingAssignment.create({
        data: { ...data, meetingId, slotKey: e.slotKey, order: 100 },
      });
    }
    await p.auditLog.create({
      data: {
        userId,
        congregationId: cong,
        action: "EDITAR",
        entity: "Reunion",
        entityId: meetingId,
        details: `Responsabilidad mensual: ${resp.label}.`,
      },
    });
  }
}

/** EL CAMINO NUEVO: una lectura, una decisión, un lote. */
async function guardarEnLote(entradas: Entrada[], userId: string, cong: string) {
  const tareas = entradas.flatMap((e) => {
    const resp = MONTHLY_RESPONSIBILITIES.find((r) => r.key === e.slotKey);
    if (!resp) return [];
    return [{ ...e, value: e.value.trim(), label: resp.label, esGrupo: resp.kind === "group" }];
  });
  if (!tareas.length) return;

  const tiempos = tareas.map((t) => fechaDe(t.dateISO).getTime());
  const min = new Date(Math.min(...tiempos));
  const max = new Date(Math.max(...tiempos));
  const meetings = await p.meeting.findMany({
    where: {
      congregationId: cong,
      date: {
        gte: new Date(min.getFullYear(), min.getMonth(), min.getDate() - 8),
        lt: new Date(max.getFullYear(), max.getMonth(), max.getDate() + 8),
      },
    },
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

  const idPorFecha = new Map<string, string>();
  for (const t of tareas) {
    const clave = claveFecha(t.dateISO, t.day);
    if (idPorFecha.has(clave)) continue;
    const hay = findWeekMeeting(meetings, fechaDe(t.dateISO), t.day);
    if (hay) idPorFecha.set(clave, hay.id);
  }

  const previas: CasillaPrevia[] = meetings.flatMap((m) => m.assignments);
  const faltan = fechasQueFaltan(tareas, idPorFecha);
  if (faltan.length) {
    const creadas = await Promise.all(
      faltan.map(async (f) => ({
        clave: claveFecha(f.dateISO, f.day),
        id: await crearReunion(fechaDe(f.dateISO), f.day, userId, cong),
      })),
    );
    for (const c of creadas) idPorFecha.set(c.clave, c.id);
    const nuevas = await p.meetingAssignment.findMany({
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

  const plan = planearEscrituras(tareas, idPorFecha, previas, newToken);
  if (plan.length) {
    await p.$transaction(
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
          ? p.meetingAssignment.update({ where: { id: w.assignmentId }, data })
          : p.meetingAssignment.create({
              data: { ...data, meetingId: w.meetingId, slotKey: w.slotKey, order: 100 },
            });
      }),
    );
  }
  await p.auditLog.create({
    data: {
      userId,
      congregationId: cong,
      action: "EDITAR",
      entity: "Reunion",
      details: `Responsabilidades mensuales: ${plan.length} casillas.`,
    },
  });
}

/** Lo guardado de un mes, para comparar los dos caminos. */
async function retrato(cong: string) {
  const filas = await p.meetingAssignment.findMany({
    where: {
      meeting: { congregationId: cong },
      slotKey: { in: MONTHLY_RESPONSIBILITIES.map((r) => r.key) },
    },
    select: {
      slotKey: true,
      primaryName: true,
      primaryStatus: true,
      primaryToken: true,
      meeting: { select: { date: true, day: true } },
    },
  });
  return filas
    .map(
      (a) =>
        `${a.meeting.date.toISOString().slice(0, 10)}|${a.meeting.day}|${a.slotKey}|` +
        `${a.primaryName ?? ""}|${a.primaryStatus}|${a.primaryToken ? "con-enlace" : "sin-enlace"}`,
    )
    .sort();
}

await limpiar();
try {
  // Dos congregaciones gemelas: una guarda a la antigua y la otra en lote.
  const hechas = [];
  for (const etiqueta of ["Viejo", "Nuevo"]) {
    const cong = await p.congregation.create({
      data: { name: `${PREFIJO} ${etiqueta}`, slug: `zz-lote-${etiqueta.toLowerCase()}` },
    });
    const user = await p.user.create({
      data: {
        username: `zz-lote-${etiqueta.toLowerCase()}`,
        passwordHash: "x".repeat(60),
        name: "Prueba",
        role: "SECRETARIO",
        congregationId: cong.id,
      },
    });
    hechas.push({ etiqueta, congId: cong.id, userId: user.id });
  }

  // El mismo mes y los mismos nombres para las dos.
  const fechas: [string, "JUEVES" | "SABADO"][] = [];
  for (const d of [5, 12, 19, 26]) fechas.push([`2097-03-${String(d).padStart(2, "0")}`, "JUEVES"]);
  for (const d of [7, 14, 21, 28]) fechas.push([`2097-03-${String(d).padStart(2, "0")}`, "SABADO"]);
  const entradas: Entrada[] = [];
  let n = 0;
  for (const [dateISO, day] of fechas) {
    for (const r of MONTHLY_RESPONSIBILITIES) {
      entradas.push({
        dateISO,
        day,
        slotKey: r.key,
        value: r.kind === "group" ? "Grupo 1" : `Hermano ${String(++n).padStart(2, "0")}`,
      });
    }
  }
  console.log(`\n   ${entradas.length} casillas en ${fechas.length} fechas\n`);

  titulo("B1. Velocidad");
  const viejo = hechas[0];
  const nuevo = hechas[1];
  const t1 = Date.now();
  await guardarUnaAUna(entradas, viejo.userId, viejo.congId);
  const msViejo = Date.now() - t1;
  const t2 = Date.now();
  await guardarEnLote(entradas, nuevo.userId, nuevo.congId);
  const msNuevo = Date.now() - t2;
  console.log(`  casilla por casilla (como antes): ${(msViejo / 1000).toFixed(1)} s`);
  console.log(`  en un solo lote (como ahora)    : ${(msNuevo / 1000).toFixed(1)} s`);
  console.log(`  → ${(msViejo / msNuevo).toFixed(1)}× más rápido`);
  check(msNuevo < msViejo, "el camino nuevo es más rápido");

  titulo("B2. ¿Guardaron exactamente lo mismo?");
  const rViejo = await retrato(viejo.congId);
  const rNuevo = await retrato(nuevo.congId);
  check(rViejo.length === rNuevo.length, `mismo número de casillas (${rViejo.length} vs ${rNuevo.length})`);
  const distintas = rViejo.filter((x, i) => x !== rNuevo[i]);
  check(distintas.length === 0, "fila por fila: mismo nombre, mismo estado y mismo enlace");
  for (const d of distintas.slice(0, 5)) {
    console.log(`     ✗ viejo: ${d}`);
    console.log(`       nuevo: ${rNuevo[rViejo.indexOf(d)]}`);
  }

  titulo("B3. Guardar otra vez lo mismo no toca los enlaces");
  const antesDeRepetir = await retrato(nuevo.congId);
  await guardarEnLote(entradas, nuevo.userId, nuevo.congId);
  const trasRepetir = await retrato(nuevo.congId);
  check(
    JSON.stringify(antesDeRepetir) === JSON.stringify(trasRepetir),
    "repetir el guardado deja todo igual (los enlaces de WhatsApp siguen sirviendo)",
  );

  titulo("B4. Cambiar un nombre renueva solo ese enlace");
  const cambiada = entradas.map((e, i) =>
    i === 0 ? { ...e, value: "Hermano Cambiado" } : e,
  );
  await guardarEnLote(cambiada, nuevo.userId, nuevo.congId);
  const trasCambio = await retrato(nuevo.congId);
  const movidas = trasCambio.filter((x, i) => x !== trasRepetir[i]);
  check(movidas.length === 1, `cambió una sola casilla (cambiaron ${movidas.length})`);

  titulo("B5. Vaciar una casilla la deja sin nombre y sin enlace");
  const vaciada = entradas.map((e, i) => (i === 1 ? { ...e, value: "" } : e));
  await guardarEnLote(vaciada, nuevo.userId, nuevo.congId);
  const sinNombre = await p.meetingAssignment.findFirst({
    where: {
      meeting: { congregationId: nuevo.congId, day: entradas[1].day },
      slotKey: entradas[1].slotKey,
      primaryName: null,
    },
    select: { primaryToken: true, primaryStatus: true },
  });
  check(sinNombre !== null, "la casilla quedó vacía");
  check(sinNombre?.primaryToken === null, "y sin enlace de confirmación");

  titulo("B6. La auditoría anota una vez por guardado, no una por casilla");
  const anotaciones = await p.auditLog.count({ where: { congregationId: nuevo.congId } });
  const anotacionesViejas = await p.auditLog.count({ where: { congregationId: viejo.congId } });
  console.log(`  camino viejo: ${anotacionesViejas} anotaciones · camino nuevo: ${anotaciones}`);
  check(anotaciones < anotacionesViejas, "el nuevo anota muchas menos líneas");
} finally {
  titulo("B7. Limpieza");
  await limpiar();
  const resto = await p.congregation.count({ where: { name: { startsWith: PREFIJO } } });
  check(resto === 0, "no quedó nada de prueba");
}

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
await p.$disconnect();
process.exit(fallos === 0 ? 0 : 1);
