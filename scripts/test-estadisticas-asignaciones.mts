// ============================================================================
//  Prueba las Estadísticas de Asignaciones contra la base real, SIN dejar
//  rastro: todo lo que escribe ocurre dentro de una transacción que se revierte.
//
//  Lo que se comprueba:
//   - Solo cuenta como realizada lo que está marcado; "sin registrar" no suma.
//   - Responsable y Auxiliar se cuentan por separado y no se duplican.
//   - El emparejamiento de nombres agrupa variantes del mismo hermano y deja
//     aparte lo que no casa con ningún publicador.
//   - Los días desde la última realizada se calculan bien.
//
//    npx tsx scripts/test-estadisticas-asignaciones.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";
import {
  daysSince,
  doneStateOf,
  matchPublisher,
  normalizeName,
} from "../src/lib/assignment-stats.js";

const p = new PrismaClient();
let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};

// --- 1. Estado de cumplimiento ---
console.log("1. Programada frente a realizada");
check(doneStateOf(null) === "sin_registrar", "null es 'sin registrar', no 'realizada'");
check(doneStateOf(true) === "realizada", "true es 'realizada'");
check(doneStateOf(false) === "no_realizada", "false es 'no realizada'");

// --- 2. Emparejado de nombres contra los publicadores reales ---
console.log("\n2. Nombres escritos a mano");
const publishers = await p.publisher.findMany({
  select: { id: true, fullName: true },
  orderBy: { fullName: "asc" },
});
const indice = new Map(publishers.map((x) => [normalizeName(x.fullName), x]));

const unoConTilde = publishers.find((x) => /[áéíóúñ]/i.test(x.fullName));
if (unoConTilde) {
  const sinTilde = unoConTilde.fullName
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  check(
    matchPublisher(sinTilde, publishers, indice)?.id === unoConTilde.id,
    `"${sinTilde}" se empareja con "${unoConTilde.fullName}"`,
  );
}
check(
  matchPublisher("Zzz Inexistente Qqq", publishers, indice) === null,
  "un nombre que no existe NO se empareja por parecido",
);

// Variante con inicial: "<nombre> X." debe caer en el mismo publicador, salvo
// que haya dos candidatos (entonces, a propósito, no se decide).
const base = publishers[0];
if (base) {
  const variante = `${base.fullName} X.`;
  const m = matchPublisher(variante, publishers, indice);
  const ambiguo =
    publishers.filter((x) =>
      normalizeName(x.fullName)
        .split(" ")
        .filter((w) => w.length > 2)
        .every((w) => normalizeName(variante).includes(w)),
    ).length > 1;
  check(
    ambiguo ? m === null : m?.id === base.id,
    ambiguo
      ? `"${variante}" es ambiguo y no se atribuye a nadie (correcto)`
      : `"${variante}" se agrupa con "${base.fullName}"`,
  );
}

// --- 3. Días desde la última realizada ---
console.log("\n3. Cálculo de días");
const hoy = new Date(2026, 9, 23);
check(daysSince(new Date(2026, 9, 23), hoy) === 0, "hoy = 0 días");
check(daysSince(new Date(2026, 6, 25), hoy) === 90, "25-jul a 23-oct = 90 días");
check(daysSince(new Date(2027, 0, 1), hoy) === 0, "una fecha futura no da días negativos");

// --- 4. Conteo sobre datos reales, en transacción revertida ---
console.log("\n4. Conteo con datos reales");
class Rollback extends Error {}
const cong = await p.congregation.findFirstOrThrow({ where: { slug: "ocoa" } });

const contar = async (tx: PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => {
  const asg = await tx.meetingAssignment.findMany({
    where: { meeting: { congregationId: cong.id } },
    select: { primaryName: true, primaryDone: true, secondaryName: true, secondaryDone: true },
  });
  let realizadas = 0;
  let participaciones = 0;
  for (const a of asg) {
    if (a.primaryName?.trim()) {
      participaciones++;
      if (a.primaryDone === true) realizadas++;
    }
    if (a.secondaryName?.trim()) {
      participaciones++;
      if (a.secondaryDone === true) realizadas++;
    }
  }
  return { realizadas, participaciones };
};

const antes = await contar(p);
console.log(`  participaciones: ${antes.participaciones} · realizadas: ${antes.realizadas}`);
check(
  antes.realizadas === 0,
  "con el historial sin marcar, NINGUNA consta como realizada",
);

try {
  await p.$transaction(async (tx) => {
    const una = await tx.meetingAssignment.findFirst({
      where: { meeting: { congregationId: cong.id }, NOT: { primaryName: null } },
      select: { id: true },
    });
    if (!una) throw new Rollback();
    await tx.meetingAssignment.update({
      where: { id: una.id },
      data: { primaryDone: true, doneMarkedAt: new Date() },
    });
    const tras = await contar(tx);
    check(
      tras.realizadas === antes.realizadas + 1,
      `al marcar una, las realizadas suben a ${tras.realizadas}`,
    );
    check(
      tras.participaciones === antes.participaciones,
      "marcarla no cambia el total de participaciones (no se duplica)",
    );
    throw new Rollback();
  }, { timeout: 25000 });
} catch (e) {
  if (!(e instanceof Rollback)) throw e;
}

const despues = await contar(p);
check(
  despues.realizadas === antes.realizadas &&
    despues.participaciones === antes.participaciones,
  "tras revertir, los números vuelven a su sitio",
);

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
await p.$disconnect();
process.exit(fallos === 0 ? 0 : 1);
