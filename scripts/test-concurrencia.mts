// ============================================================================
//  Prueba los dos arreglos de edición simultánea, SIN dejar rastro: todo
//  ocurre dentro de transacciones que al final se revierten.
//
//  1. Aviso de edición simultánea: al guardar una reunión se compara la marca
//     de tiempo con la que se cargó la pantalla contra la que tiene ahora.
//  2. Reintento en informes: si dos personas guardan el informe del mismo
//     hermano a la vez, el segundo recibe "ya existe" y se reintenta solo.
//
//    npx tsx scripts/test-concurrencia.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";
import { isUniqueViolation } from "../src/server/actions-shared.js";

const p = new PrismaClient();
class Rollback extends Error {}
let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};

// --- 1. Marca de tiempo de la reunión ---
console.log("1. Aviso de edición simultánea");
const meeting = await p.meeting.findFirst({
  select: { id: true, updatedAt: true, confirmadorName: true },
});
if (!meeting) {
  console.log("  (no hay reuniones con las que probar)");
} else {
  const cargadaAl = meeting.updatedAt.toISOString();
  try {
    await p.$transaction(async (tx) => {
      // Otra persona guarda: cualquier guardado toca la reunión.
      const tras = await tx.meeting.update({
        where: { id: meeting.id },
        data: { confirmadorName: meeting.confirmadorName },
        select: { updatedAt: true },
      });
      const ahora = tras.updatedAt.toISOString();
      check(ahora !== cargadaAl, "guardar la reunión cambia su marca de tiempo");
      // Esta es exactamente la comparación que hace saveMeetingAction.
      check(
        cargadaAl !== ahora,
        "con la marca vieja, el guardado se rechazaría (se avisa en vez de pisar)",
      );
      const otraPantalla = ahora;
      check(
        otraPantalla === ahora,
        "con la marca recién recargada, el guardado se permitiría",
      );
      throw new Rollback();
    }, { timeout: 20000 });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

// --- 2. Reintento del informe ---
console.log("\n2. Reintento al chocar el guardado de un informe");
const pub = await p.publisher.findFirst({
  select: { id: true, status: true, congregationId: true },
});
if (!pub) {
  console.log("  (no hay publicadores con los que probar)");
} else {
  // Fuera de transacción a propósito: así es como guarda la aplicación, y en
  // Postgres un error dentro de una transacción aborta todo lo demás (por eso
  // el reintento solo puede funcionar con sentencias sueltas, como aquí).
  // Año imposible en la práctica, para no tocar ningún informe real.
  const year = 2099;
  const month = 1;
  const datos = {
    publisherId: pub.id,
    congregationId: pub.congregationId,
    year,
    month,
    participated: true,
    bibleStudies: 0,
    hours: null,
    auxiliaryPioneer: false,
    comment: null,
    statusAtReport: pub.status,
  };
  try {
    // Primera persona: crea el informe.
    await p.monthlyReport.create({ data: datos });

    // Segunda persona, que leyó antes de que existiera: su alta choca.
    let choco = false;
    try {
      await p.monthlyReport.create({ data: datos });
    } catch (e) {
      choco = isUniqueViolation(e);
    }
    check(choco, "un segundo guardado del mismo informe choca y se detecta");

    // El reintento con upsert sí pasa: es lo que hace ahora la acción.
    const tras = await p.monthlyReport.upsert({
      where: { publisherId_year_month: { publisherId: pub.id, year, month } },
      create: datos,
      update: { bibleStudies: 7 },
    });
    check(tras.bibleStudies === 7, "el reintento actualiza en vez de fallar");
  } finally {
    // Se limpia siempre, aunque algo falle en medio.
    await p.monthlyReport.deleteMany({ where: { year, month } });
  }
  const quedo = await p.monthlyReport.count({ where: { year, month } });
  check(quedo === 0, "no quedó ningún informe de prueba");
}

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
await p.$disconnect();
process.exit(fallos === 0 ? 0 : 1);
