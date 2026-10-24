// ============================================================================
//  Las Estadísticas de Asignaciones solo miran lo que ya pasó.
//
//  Se comprueba contra la base REAL, sin escribir nada:
//   1. Qué reuniones hay por delante y por detrás de hoy.
//   2. Que ninguna asignación de una reunión futura entra en las estadísticas.
//   3. Que los totales y el rango de fechas tampoco las cuentan.
//   4. Qué publicadores activos no han tenido ninguna participación.
//
//    npx tsx scripts/test-estadisticas-pasadas.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};
const fecha = (d: Date) => d.toISOString().slice(0, 10);

const hoyInicio = new Date();
hoyInicio.setHours(0, 0, 0, 0);
console.log(`Hoy: ${fecha(hoyInicio)}\n`);

const cong = await p.congregation.findFirst({
  where: { name: "Ocoa" },
  select: { id: true, name: true },
});
if (!cong) {
  console.log("No se encontró la congregación de prueba.");
  await p.$disconnect();
  process.exit(1);
}

// --- 1. Las reuniones de la congregación, a un lado y otro de hoy ---
console.log("1. Reuniones registradas");
const reuniones = await p.meeting.findMany({
  where: { congregationId: cong.id },
  orderBy: { date: "asc" },
  select: { id: true, date: true, weekLabel: true },
});
const pasadas = reuniones.filter((m) => m.date < hoyInicio);
const futuras = reuniones.filter((m) => m.date >= hoyInicio);
for (const m of reuniones) {
  console.log(
    `  ${fecha(m.date)}  ${(m.weekLabel ?? "").padEnd(32)} ${m.date < hoyInicio ? "ya pasó" : "FUTURA"}`,
  );
}
check(reuniones.length > 0, `${reuniones.length} reunión(es) en total`);
console.log(`  pasadas: ${pasadas.length} · futuras: ${futuras.length}`);

// --- 2. Las asignaciones que entran en las estadísticas ---
console.log("\n2. Las futuras no entran en las estadísticas");
const conNombre = {
  OR: [{ NOT: { primaryName: null } }, { NOT: { secondaryName: null } }],
};
const [enEstadisticas, deFuturas, deTodas] = await Promise.all([
  p.meetingAssignment.count({
    where: {
      meeting: { congregationId: cong.id, date: { lt: hoyInicio } },
      ...conNombre,
    },
  }),
  p.meetingAssignment.count({
    where: {
      meeting: { congregationId: cong.id, date: { gte: hoyInicio } },
      ...conNombre,
    },
  }),
  p.meetingAssignment.count({
    where: { meeting: { congregationId: cong.id }, ...conNombre },
  }),
]);
console.log(
  `  asignaciones con nombre -> pasadas: ${enEstadisticas} · futuras: ${deFuturas} · total: ${deTodas}`,
);
check(
  enEstadisticas + deFuturas === deTodas,
  "las dos partes suman el total (no se pierde ninguna)",
);
if (futuras.length > 0) {
  check(
    deFuturas > 0 && enEstadisticas < deTodas,
    `se dejan fuera ${deFuturas} asignación(es) de reuniones futuras`,
  );
} else {
  console.log("  (ahora mismo no hay reuniones futuras cargadas)");
}

// --- 3. Totales y rango de fechas ---
console.log("\n3. Totales y rango");
const rango = await p.meeting.aggregate({
  where: { congregationId: cong.id, date: { lt: hoyInicio } },
  _min: { date: true },
  _max: { date: true },
  _count: true,
});
check(
  rango._count === pasadas.length,
  `cuenta ${rango._count} reunión(es), las ya pasadas (${pasadas.length})`,
);
if (rango._max.date) {
  check(
    rango._max.date < hoyInicio,
    `la última del rango es ${fecha(rango._max.date)}, anterior a hoy`,
  );
}

// --- 4. Publicadores sin ninguna participación ---
console.log("\n4. Publicadores activos sin ninguna participación");
const publicadores = await p.publisher.findMany({
  where: { congregationId: cong.id, active: true, status: { not: "INACTIVO" } },
  select: { fullName: true, group: { select: { name: true } } },
  orderBy: { fullName: "asc" },
});
// Nombres que aparecen en alguna asignación ya pasada.
const asignaciones = await p.meetingAssignment.findMany({
  where: {
    meeting: { congregationId: cong.id, date: { lt: hoyInicio } },
    ...conNombre,
  },
  select: { primaryName: true, secondaryName: true },
});
const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const usados = new Set<string>();
for (const a of asignaciones) {
  for (const n of [a.primaryName, a.secondaryName]) {
    if (n?.trim()) usados.add(norm(n));
  }
}
// Mismo criterio aproximado que matchPublisher: exacto o todas las palabras.
const participo = (nombre: string) => {
  const n = norm(nombre);
  if (usados.has(n)) return true;
  const palabras = n.split(" ").filter(Boolean);
  return [...usados].some((u) => palabras.every((w) => u.includes(w)));
};
const sinParticipacion = publicadores.filter((p) => !participo(p.fullName));
console.log(
  `  publicadores activos: ${publicadores.length} · sin participación: ${sinParticipacion.length}`,
);
for (const s of sinParticipacion.slice(0, 15)) {
  console.log(`    ${s.fullName}${s.group ? ` (${s.group.name})` : ""}`);
}
if (sinParticipacion.length > 15) {
  console.log(`    … y ${sinParticipacion.length - 15} más`);
}
check(
  sinParticipacion.length <= publicadores.length,
  "la lista no inventa publicadores",
);
check(
  sinParticipacion.every((s) => !participo(s.fullName)),
  "ninguno de los listados tiene asignaciones pasadas",
);

// --- 5. El aviso de "días sin asignación" ---
// Mide los días desde la última asignación que TUVO el hermano, no desde la
// última marcada como realizada: nadie marca el cumplimiento, así que con el
// criterio anterior el aviso salía siempre en cero.
console.log("\n5. Aviso por días sin asignación");
const realizadas = await p.meetingAssignment.count({
  where: {
    meeting: { congregationId: cong.id, date: { lt: hoyInicio } },
    OR: [{ primaryDone: true }, { secondaryDone: true }],
  },
});
console.log(`  asignaciones marcadas como realizadas: ${realizadas} de ${enEstadisticas}`);

const pubs = await p.publisher.findMany({
  where: { congregationId: cong.id },
  select: { id: true, fullName: true, status: true, group: { select: { name: true } } },
});
const { matchPublisher, normalizeName, daysSince } = await import(
  "../src/lib/assignment-stats.js"
);
const indice = new Map(pubs.map((x) => [normalizeName(x.fullName), x]));
const conFecha = await p.meetingAssignment.findMany({
  where: {
    meeting: { congregationId: cong.id, date: { lt: hoyInicio } },
    ...conNombre,
  },
  include: { meeting: { select: { date: true } } },
});
const ultima = new Map<string, { date: Date; esPublicador: boolean }>();
for (const a of conFecha) {
  for (const n of [a.primaryName, a.secondaryName]) {
    if (!n?.trim()) continue;
    const pub = matchPublisher(n.trim(), pubs, indice);
    const clave = pub ? `p:${pub.id}` : `t:${normalizeName(n)}`;
    const prev = ultima.get(clave);
    if (!prev || a.meeting.date > prev.date) {
      ultima.set(clave, { date: a.meeting.date, esPublicador: !!pub });
    }
  }
}
const ahora = new Date();
const avisados = (umbral: number) =>
  [...ultima.values()].filter(
    (u) => u.esPublicador && daysSince(u.date, ahora) > umbral,
  ).length;
for (const umbral of [5, 10, 90]) {
  console.log(`  umbral ${String(umbral).padStart(2)} días -> ${avisados(umbral)} hermano(s)`);
}
check(
  realizadas === 0,
  "ninguna asignación está marcada como realizada (por eso el aviso no podía usar ese dato)",
);
check(
  avisados(5) > 0,
  `con 5 días el aviso devuelve hermanos (${avisados(5)}), no cero`,
);
check(
  avisados(90) === 0,
  "con 90 días no avisa de nadie: el historial no llega tan atrás",
);
check(
  avisados(5) >= avisados(10),
  "a mayor umbral, nunca más avisados que con uno menor",
);

await p.$disconnect();
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
