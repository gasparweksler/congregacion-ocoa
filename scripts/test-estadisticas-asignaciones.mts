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

// --- 1. El estado sale de la confirmación del hermano ---
console.log("1. Programada frente a confirmada");
check(
  doneStateOf("PENDIENTE") === "sin_respuesta",
  "pendiente es 'sin respuesta', no 'confirmada'",
);
check(doneStateOf(null) === "sin_respuesta", "sin estado, 'sin respuesta'");
check(doneStateOf("CONFIRMADO") === "confirmada", "confirmado es 'confirmada'");
check(doneStateOf("RECHAZADO") === "rechazada", "rechazado es 'rechazada'");

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

// Se cuenta igual que las Estadísticas: desde el estado de CONFIRMACIÓN de
// cada hermano, no desde un registro aparte.
const contar = async (tx: PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => {
  const asg = await tx.meetingAssignment.findMany({
    where: { meeting: { congregationId: cong.id } },
    select: {
      primaryName: true,
      primaryStatus: true,
      secondaryName: true,
      secondaryStatus: true,
    },
  });
  let realizadas = 0;
  let rechazadas = 0;
  let participaciones = 0;
  for (const a of asg) {
    for (const [nombre, estado] of [
      [a.primaryName, a.primaryStatus],
      [a.secondaryName, a.secondaryStatus],
    ] as const) {
      if (!nombre?.trim()) continue;
      participaciones++;
      if (doneStateOf(estado) === "confirmada") realizadas++;
      else if (doneStateOf(estado) === "rechazada") rechazadas++;
    }
  }
  return { realizadas, rechazadas, participaciones };
};

const antes = await contar(p);
console.log(
  `  participaciones: ${antes.participaciones} · confirmadas: ${antes.realizadas} · rechazadas: ${antes.rechazadas}`,
);

try {
  await p.$transaction(async (tx) => {
    // Dos asignaciones que todavía están pendientes de respuesta.
    const pendientes = await tx.meetingAssignment.findMany({
      where: {
        meeting: { congregationId: cong.id },
        NOT: { primaryName: null },
        primaryStatus: "PENDIENTE",
      },
      select: { id: true },
      take: 2,
    });
    if (pendientes.length < 2) throw new Rollback();

    // Una confirma: debe subir el contador de confirmadas.
    await tx.meetingAssignment.update({
      where: { id: pendientes[0].id },
      data: { primaryStatus: "CONFIRMADO" },
    });
    let tras = await contar(tx);
    check(
      tras.realizadas === antes.realizadas + 1,
      `al confirmar una, las confirmadas suben a ${tras.realizadas}`,
    );
    check(
      tras.participaciones === antes.participaciones,
      "confirmar no cambia el total de participaciones (no se duplica)",
    );

    // La otra rechaza: NO debe contar como confirmada.
    await tx.meetingAssignment.update({
      where: { id: pendientes[1].id },
      data: { primaryStatus: "RECHAZADO" },
    });
    tras = await contar(tx);
    check(
      tras.realizadas === antes.realizadas + 1,
      "un rechazo no suma a las confirmadas",
    );
    check(
      tras.rechazadas === antes.rechazadas + 1,
      `y se cuenta como rechazada (${tras.rechazadas})`,
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
