// ============================================================================
//  SIMULACIÓN: tres personas trabajando a la vez, en tres congregaciones
//  distintas y desde tres dispositivos distintos.
//
//  Qué hace:
//   1. Crea tres congregaciones de prueba (nombre con prefijo inconfundible).
//   2. Lanza las tres jornadas DE VERDAD en paralelo (Promise.all), sin que
//      una espere a la otra: así las escrituras se entrelazan como lo harían
//      tres teléfonos a la vez.
//   3. Comprueba que nada se mezcló entre congregaciones y que no se perdió
//      ni se duplicó ninguna fila.
//   4. Prueba además las carreras del MISMO día dentro de una congregación.
//   5. Borra todo lo de prueba y verifica que los datos reales siguen igual.
//
//  Reproduce la secuencia de consultas de las Server Actions (mismo orden,
//  mismas restricciones de la base). No pasa por HTTP ni por la sesión.
//
//    npx tsx scripts/test-simultaneo.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";
import {
  MONTHLY_RESPONSIBILITIES,
  CONFIRM_STATUS,
  slotsForDay,
} from "../src/lib/constants.js";
import { findWeekMeeting } from "../src/lib/meeting-week.js";
import { isUniqueViolation } from "../src/server/actions-shared.js";
import crypto from "node:crypto";

const p = new PrismaClient();

/** Prefijo que marca TODO lo creado por esta simulación. */
const PREFIJO = "ZZ Simulacion";

let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};
const titulo = (t: string) => console.log(`\n${t}`);

const newToken = () => crypto.randomUUID().replace(/-/g, "");

// ---------------------------------------------------------------------------
//  Limpieza (se usa al principio y al final)
// ---------------------------------------------------------------------------
async function limpiar(): Promise<void> {
  const congs = await p.congregation.findMany({
    where: { name: { startsWith: PREFIJO } },
    select: { id: true },
  });
  const ids = congs.map((c) => c.id);
  if (ids.length === 0) return;
  // Los usuarios y la auditoría son onDelete: SetNull, así que no se van solos
  // con la congregación: hay que borrarlos a mano para no dejar huérfanos.
  await p.auditLog.deleteMany({ where: { congregationId: { in: ids } } });
  await p.user.deleteMany({ where: { congregationId: { in: ids } } });
  await p.user.deleteMany({ where: { username: { startsWith: "zz-sim-" } } });
  // El resto cae en cascada con la congregación.
  await p.congregation.deleteMany({ where: { id: { in: ids } } });
}

// ---------------------------------------------------------------------------
//  Foto de los datos REALES, para comprobar al final que nada se tocó
// ---------------------------------------------------------------------------
async function fotoReal() {
  const fuera = { congregation: { name: { not: { startsWith: PREFIJO } } } };
  const [congregaciones, publicadores, informes, reuniones, asignaciones, usuarios] =
    await Promise.all([
      p.congregation.count({ where: { name: { not: { startsWith: PREFIJO } } } }),
      p.publisher.count({ where: fuera }),
      p.monthlyReport.count({ where: fuera }),
      p.meeting.count({ where: fuera }),
      p.meetingAssignment.count({ where: { meeting: fuera } }),
      p.user.count(),
    ]);
  return { congregaciones, publicadores, informes, reuniones, asignaciones, usuarios };
}

// ---------------------------------------------------------------------------
//  Montaje: tres congregaciones con su administrador, grupos y publicadores
// ---------------------------------------------------------------------------
type Escenario = {
  etiqueta: string;
  congId: string;
  userId: string;
  userName: string;
  grupos: { id: string; name: string }[];
  publicadores: { id: string; fullName: string }[];
  /** Día de entre semana propio (distinto en cada congregación, a propósito). */
  midweekDay: number;
  weekendDay: number;
};

async function montar(
  etiqueta: string,
  midweekDay: number,
  weekendDay: number,
  cuantosPublicadores: number,
): Promise<Escenario> {
  const cong = await p.congregation.create({
    data: {
      name: `${PREFIJO} ${etiqueta}`,
      slug: `zz-sim-${etiqueta.toLowerCase()}`,
      midweekDay,
      weekendDay,
    },
  });

  const grupos = [];
  for (const n of [1, 2]) {
    grupos.push(
      await p.group.create({
        data: { name: `Grupo ${n}`, congregationId: cong.id },
        select: { id: true, name: true },
      }),
    );
  }

  const user = await p.user.create({
    data: {
      username: `zz-sim-${etiqueta.toLowerCase()}`,
      passwordHash: "x".repeat(60),
      name: `Administrador ${etiqueta}`,
      role: "SECRETARIO",
      congregationId: cong.id,
    },
  });

  const publicadores = [];
  for (let i = 1; i <= cuantosPublicadores; i++) {
    publicadores.push(
      await p.publisher.create({
        data: {
          fullName: `${etiqueta} Publicador ${String(i).padStart(2, "0")}`,
          status: "PUBLICADOR",
          congregationId: cong.id,
          groupId: grupos[i % 2].id,
        },
        select: { id: true, fullName: true },
      }),
    );
  }

  return {
    etiqueta,
    congId: cong.id,
    userId: user.id,
    userName: user.name,
    grupos,
    publicadores,
    midweekDay,
    weekendDay,
  };
}

// ---------------------------------------------------------------------------
//  Las mismas consultas que hace setMonthlyResponsibility, en el mismo orden
// ---------------------------------------------------------------------------
async function crearReunionDeFecha(
  date: Date,
  day: "JUEVES" | "SABADO",
  userId: string,
  userName: string | null,
  cong: string,
): Promise<string> {
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
  try {
    const meeting = await p.meeting.create({
      data: {
        date,
        day,
        congregationId: cong,
        createdById: userId,
        confirmadorName: userName,
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
            ...respSlots.map((s, i) => ({ ...s, order: 100 + i })),
          ],
        },
      },
    });
    return meeting.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await p.meeting.findUnique({
        where: { congregationId_date_day: { congregationId: cong, date, day } },
        select: { id: true },
      });
      if (existing) return existing.id;
    }
    throw error;
  }
}

async function ponerResponsabilidad(
  cong: string,
  userId: string,
  userName: string | null,
  dateISO: string,
  day: "JUEVES" | "SABADO",
  slotKey: string,
  value: string,
): Promise<void> {
  const resp = MONTHLY_RESPONSIBILITIES.find((r) => r.key === slotKey);
  if (!resp) return;
  const [y, m, d] = dateISO.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0);
  const clean = value.trim();

  const first = new Date(y, m - 1, d - 8, 0, 0, 0);
  const last = new Date(y, m - 1, d + 8, 0, 0, 0);
  const existing = await p.meeting.findMany({
    where: { congregationId: cong, date: { gte: first, lt: last } },
    select: { id: true, date: true, day: true, weekLabel: true },
  });
  let meetingId = findWeekMeeting(existing, date, day)?.id ?? null;
  if (!meetingId) {
    if (!clean) return;
    meetingId = await crearReunionDeFecha(date, day, userId, userName, cong);
  }

  const assignment = await p.meetingAssignment.findFirst({
    where: { meetingId, slotKey, meeting: { congregationId: cong } },
  });

  const isGroup = resp.kind === "group";
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
    await p.meetingAssignment.update({ where: { id: assignment.id }, data });
  } else {
    await p.meetingAssignment.create({
      data: { ...data, meetingId, slotKey, order: 100 },
    });
  }

  await p.auditLog.create({
    data: {
      userId,
      congregationId: cong,
      action: "EDITAR",
      entity: "Reunion",
      entityId: meetingId,
      details: `Responsabilidad mensual: ${resp.label} = ${clean}.`,
    },
  });
}

/** Fechas del mes que caen en un día concreto de la semana. */
function fechasDelMes(year: number, month: number, weekday: number): string[] {
  const out: string[] = [];
  const d = new Date(year, month - 1, 1);
  while (d.getMonth() === month - 1) {
    if (d.getDay() === weekday) {
      out.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
          d.getDate(),
        ).padStart(2, "0")}`,
      );
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
//  La jornada de una persona, de principio a fin
// ---------------------------------------------------------------------------
const ANIO = 2097; // año imposible: ningún dato real vive ahí
const MES = 3;

type Registro = { etiqueta: string; pasos: string[]; error: string | null; ms: number };

async function jornada(e: Escenario, nuevos: number): Promise<Registro> {
  const pasos: string[] = [];
  const t0 = Date.now();
  try {
    // --- 1. Abre su panel: cuenta lo suyo ---
    const miCuenta = await p.publisher.count({
      where: { congregationId: e.congId },
    });
    pasos.push(`panel: ${miCuenta} publicadores`);

    // --- 2. Da de alta publicadores desde la planilla (tandas de 10) ---
    const altas: string[] = [];
    for (let i = 1; i <= nuevos; i++) {
      const pub = await p.publisher.create({
        data: {
          fullName: `${e.etiqueta} Alta ${String(i).padStart(2, "0")}`,
          status: "PUBLICADOR",
          congregationId: e.congId,
          groupId: e.grupos[i % 2].id,
          statusChanges: {
            create: { status: "PUBLICADOR", changedById: e.userId },
          },
        },
        select: { id: true },
      });
      altas.push(pub.id);
    }
    pasos.push(`altas: ${altas.length}`);

    // --- 3. Guarda los informes del mes de todos sus publicadores ---
    const todos = await p.publisher.findMany({
      where: { congregationId: e.congId },
      select: { id: true, status: true },
    });
    for (const pub of todos) {
      await p.monthlyReport.upsert({
        where: {
          publisherId_year_month: {
            publisherId: pub.id,
            year: ANIO,
            month: MES,
          },
        },
        create: {
          publisherId: pub.id,
          congregationId: e.congId,
          year: ANIO,
          month: MES,
          participated: true,
          bibleStudies: 1,
          hours: null,
          auxiliaryPioneer: false,
          statusAtReport: pub.status,
          submittedById: e.userId,
        },
        update: { bibleStudies: 2 },
      });
    }
    pasos.push(`informes: ${todos.length}`);

    // --- 4. Asigna las responsabilidades del mes (crea las reuniones) ---
    const fechas = [
      ...fechasDelMes(ANIO, MES, e.midweekDay).map(
        (f) => [f, "JUEVES" as const] as const,
      ),
      ...fechasDelMes(ANIO, MES, e.weekendDay).map(
        (f) => [f, "SABADO" as const] as const,
      ),
    ];
    let puestas = 0;
    for (const [fecha, day] of fechas) {
      for (const resp of MONTHLY_RESPONSIBILITIES) {
        const quien =
          resp.kind === "group"
            ? e.grupos[0].name
            : e.publicadores[puestas % e.publicadores.length].fullName;
        await ponerResponsabilidad(
          e.congId,
          e.userId,
          e.userName,
          fecha,
          day,
          resp.key,
          quien,
        );
        puestas++;
      }
    }
    pasos.push(`responsabilidades: ${puestas} en ${fechas.length} fechas`);

    // --- 5. Mira las estadísticas de su congregación ---
    const asignados = await p.meetingAssignment.findMany({
      where: { meeting: { congregationId: e.congId }, primaryName: { not: null } },
      select: { primaryName: true },
    });
    pasos.push(`estadísticas: ${asignados.length} asignaciones con nombre`);

    return { etiqueta: e.etiqueta, pasos, error: null, ms: Date.now() - t0 };
  } catch (err) {
    return {
      etiqueta: e.etiqueta,
      pasos,
      error: err instanceof Error ? err.message : String(err),
      ms: Date.now() - t0,
    };
  }
}

// ===========================================================================
//  EJECUCIÓN
// ===========================================================================
console.log("SIMULACIÓN · tres personas a la vez, tres congregaciones\n");

await limpiar(); // por si quedó algo de una corrida anterior
const antes = await fotoReal();
console.log("Datos reales antes:", antes);

let escenarios: Escenario[] = [];
try {
  titulo("0. Montaje (tres congregaciones con días de reunión distintos)");
  escenarios = [
    await montar("Alfa", 4, 6, 10), // jueves / sábado
    await montar("Beta", 2, 0, 10), // martes / domingo
    await montar("Gama", 3, 6, 10), // miércoles / sábado
  ];
  for (const e of escenarios) {
    console.log(
      `  ${e.etiqueta}: ${e.publicadores.length} publicadores, ${e.grupos.length} grupos`,
    );
  }

  // --- 1. Las tres jornadas, de verdad en paralelo ---
  titulo("1. Las tres jornadas corriendo a la vez");
  const t0 = Date.now();
  const registros = await Promise.all([
    jornada(escenarios[0], 6),
    jornada(escenarios[1], 6),
    jornada(escenarios[2], 6),
  ]);
  const total = Date.now() - t0;
  for (const r of registros) {
    console.log(`  ${r.etiqueta} (${(r.ms / 1000).toFixed(1)} s)`);
    for (const s of r.pasos) console.log(`     · ${s}`);
    if (r.error) console.log(`     ✗ ERROR: ${r.error}`);
  }
  console.log(`  — las tres terminaron en ${(total / 1000).toFixed(1)} s —`);
  check(
    registros.every((r) => r.error === null),
    "ninguna de las tres jornadas falló",
  );

  // --- 2. Nada se mezcló entre congregaciones ---
  titulo("2. Separación entre congregaciones");
  for (const e of escenarios) {
    const esperados = e.publicadores.length + 6;
    const mios = await p.publisher.count({ where: { congregationId: e.congId } });
    check(mios === esperados, `${e.etiqueta}: ${mios} publicadores (esperados ${esperados})`);

    // Ningún publicador suyo cuelga de un grupo de otra congregación.
    const ajenos = await p.publisher.count({
      where: {
        congregationId: e.congId,
        group: { congregationId: { not: e.congId } },
      },
    });
    check(ajenos === 0, `${e.etiqueta}: ningún publicador en grupo de otra congregación`);

    // Ningún informe suyo apunta a un publicador de otra.
    const informesAjenos = await p.monthlyReport.count({
      where: {
        congregationId: e.congId,
        publisher: { congregationId: { not: e.congId } },
      },
    });
    check(informesAjenos === 0, `${e.etiqueta}: ningún informe de un publicador ajeno`);

    // Ninguna asignación suya nombra a alguien de otra congregación.
    const nombres = await p.meetingAssignment.findMany({
      where: { meeting: { congregationId: e.congId }, primaryName: { not: null } },
      select: { primaryName: true },
    });
    const propios = new Set([
      ...e.publicadores.map((x) => x.fullName),
      ...e.grupos.map((g) => g.name),
    ]);
    // Todos los nombres de prueba empiezan por la etiqueta de su congregación,
    // así que basta con mirar el principio para detectar una mezcla.
    const deOtra = nombres.filter((n) =>
      escenarios.some(
        (o) => o.etiqueta !== e.etiqueta && n.primaryName!.startsWith(o.etiqueta),
      ),
    );
    check(
      deOtra.length === 0,
      `${e.etiqueta}: ninguna asignación con nombre de otra congregación (${nombres.length} revisadas)`,
    );
    if (deOtra.length > 0) {
      console.log(`     ✗ ejemplos: ${deOtra.slice(0, 3).map((n) => n.primaryName).join(", ")}`);
    }
    void propios;
  }

  // --- 3. Las reuniones creadas respetan el día propio de cada una ---
  titulo("3. Cada congregación creó sus propios días");
  for (const e of escenarios) {
    const reuniones = await p.meeting.findMany({
      where: { congregationId: e.congId },
      select: { date: true, day: true },
    });
    const malDia = reuniones.filter((r) => {
      const esperado = r.day === "JUEVES" ? e.midweekDay : e.weekendDay;
      return r.date.getDay() !== esperado;
    });
    check(
      malDia.length === 0,
      `${e.etiqueta}: las ${reuniones.length} reuniones caen en su día (entre semana ${e.midweekDay}, fin de semana ${e.weekendDay})`,
    );
    const duplicadas = reuniones.length !== new Set(
      reuniones.map((r) => `${r.date.toISOString()}|${r.day}`),
    ).size;
    check(!duplicadas, `${e.etiqueta}: no hay dos reuniones del mismo día`);
  }

  // --- 4. Carreras dentro de la MISMA congregación (dos dispositivos) ---
  titulo("4. Dos dispositivos de la MISMA congregación, a la vez");
  const e = escenarios[0];
  const fecha = fechasDelMes(ANIO, 4, e.midweekDay)[0]; // abril: mes sin tocar

  // 4a. Misma fecha, responsabilidades distintas: la reunión no debe duplicarse.
  const resultados = await Promise.allSettled(
    MONTHLY_RESPONSIBILITIES.slice(0, 4).map((r, i) =>
      ponerResponsabilidad(
        e.congId,
        e.userId,
        e.userName,
        fecha,
        "JUEVES",
        r.key,
        e.publicadores[i].fullName,
      ),
    ),
  );
  const rotos = resultados.filter((r) => r.status === "rejected");
  check(rotos.length === 0, `cuatro responsabilidades de la misma fecha a la vez (${rotos.length} fallos)`);
  for (const r of rotos) {
    console.log(`     ✗ ${(r as PromiseRejectedResult).reason?.message ?? r}`);
  }
  const [y4, m4, d4] = fecha.split("-").map(Number);
  const mismasFecha = await p.meeting.count({
    where: {
      congregationId: e.congId,
      date: new Date(y4, m4 - 1, d4, 12, 0, 0),
      day: "JUEVES",
    },
  });
  check(mismasFecha === 1, `quedó UNA sola reunión de esa fecha (hay ${mismasFecha})`);

  // 4b. La MISMA casilla desde dos dispositivos: gana el último, sin romperse.
  const dobles = await Promise.allSettled([
    ponerResponsabilidad(e.congId, e.userId, e.userName, fecha, "JUEVES", "r_audio", e.publicadores[7].fullName),
    ponerResponsabilidad(e.congId, e.userId, e.userName, fecha, "JUEVES", "r_audio", e.publicadores[8].fullName),
  ]);
  const rotos2 = dobles.filter((r) => r.status === "rejected");
  check(rotos2.length === 0, `la misma casilla escrita a la vez no rompe (${rotos2.length} fallos)`);
  for (const r of rotos2) {
    console.log(`     ✗ ${(r as PromiseRejectedResult).reason?.message ?? r}`);
  }
  const casilla = await p.meetingAssignment.findMany({
    where: { meeting: { congregationId: e.congId }, slotKey: "r_audio", meetingId: { not: undefined } },
    select: { primaryName: true, meetingId: true },
  });
  const deEsaFecha = await p.meetingAssignment.count({
    where: {
      slotKey: "r_audio",
      meeting: {
        congregationId: e.congId,
        date: new Date(y4, m4 - 1, d4, 12, 0, 0),
        day: "JUEVES",
      },
    },
  });
  check(deEsaFecha === 1, `sigue habiendo UNA sola casilla de Audio en esa fecha (hay ${deEsaFecha})`);
  void casilla;

  // 4c. El mismo informe desde dos dispositivos.
  const pubX = e.publicadores[0];
  const datos = {
    publisherId: pubX.id,
    congregationId: e.congId,
    year: ANIO,
    month: 11,
    participated: true,
    bibleStudies: 0,
    hours: null,
    auxiliaryPioneer: false,
    statusAtReport: "PUBLICADOR",
  };
  const informes = await Promise.allSettled([
    p.monthlyReport.upsert({
      where: { publisherId_year_month: { publisherId: pubX.id, year: ANIO, month: 11 } },
      create: datos,
      update: { bibleStudies: 1 },
    }),
    p.monthlyReport.upsert({
      where: { publisherId_year_month: { publisherId: pubX.id, year: ANIO, month: 11 } },
      create: datos,
      update: { bibleStudies: 2 },
    }),
  ]);
  const informesRotos = informes.filter((r) => r.status === "rejected");
  const cuantos = await p.monthlyReport.count({
    where: { publisherId: pubX.id, year: ANIO, month: 11 },
  });
  check(cuantos === 1, `el mismo informe guardado a la vez deja UNA fila (hay ${cuantos})`);
  if (informesRotos.length > 0) {
    console.log(
      `     nota: ${informesRotos.length} de los 2 guardados chocó y la acción lo reintenta: ${
        (informesRotos[0] as PromiseRejectedResult).reason?.code ?? ""
      }`,
    );
  }

  // --- 5. Aviso de edición simultánea de una reunión ---
  titulo("5. Aviso de edición simultánea (dos personas en la misma reunión)");
  const reunion = await p.meeting.findFirst({
    where: { congregationId: e.congId },
    select: { id: true, updatedAt: true, confirmadorName: true },
  });
  if (reunion) {
    const cargadaAl = reunion.updatedAt.toISOString();
    const tras = await p.meeting.update({
      where: { id: reunion.id },
      data: { confirmadorName: reunion.confirmadorName },
      select: { updatedAt: true },
    });
    check(
      tras.updatedAt.toISOString() !== cargadaAl,
      "guardar cambia la marca de tiempo, así que el segundo guardado avisa en vez de pisar",
    );
  }

  // --- 6. Carga en paralelo: cuántas consultas aguanta a la vez ---
  titulo("6. Conexiones: 30 consultas a la vez");
  const t1 = Date.now();
  const golpe = await Promise.allSettled(
    Array.from({ length: 30 }, (_, i) =>
      p.publisher.count({
        where: { congregationId: escenarios[i % 3].congId },
      }),
    ),
  );
  const caidas = golpe.filter((r) => r.status === "rejected");
  check(caidas.length === 0, `30 consultas simultáneas sin errores (${Date.now() - t1} ms)`);
  for (const r of caidas.slice(0, 3)) {
    console.log(`     ✗ ${(r as PromiseRejectedResult).reason?.message?.slice(0, 120)}`);
  }

  // --- 7. Totales por congregación: ni de más ni de menos ---
  titulo("7. Totales finales por congregación");
  for (const es of escenarios) {
    const [pubs, infs, reus, asigs] = await Promise.all([
      p.publisher.count({ where: { congregationId: es.congId } }),
      p.monthlyReport.count({ where: { congregationId: es.congId } }),
      p.meeting.count({ where: { congregationId: es.congId } }),
      p.meetingAssignment.count({ where: { meeting: { congregationId: es.congId } } }),
    ]);
    console.log(
      `  ${es.etiqueta}: ${pubs} publicadores · ${infs} informes · ${reus} reuniones · ${asigs} asignaciones`,
    );
    check(pubs === 16, `${es.etiqueta}: 16 publicadores (10 + 6 altas)`);
    check(infs >= 16, `${es.etiqueta}: al menos un informe por publicador`);
  }
} finally {
  titulo("8. Limpieza");
  await limpiar();
  const despues = await fotoReal();
  console.log("  Datos reales después:", despues);
  const igual =
    JSON.stringify(antes) === JSON.stringify(despues);
  check(igual, "los datos reales quedaron exactamente igual que al empezar");
  const resto = await p.congregation.count({
    where: { name: { startsWith: PREFIJO } },
  });
  check(resto === 0, "no quedó ninguna congregación de prueba");
}

console.log(
  fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`,
);
await p.$disconnect();
process.exit(fallos === 0 ? 0 : 1);
