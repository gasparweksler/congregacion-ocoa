// ============================================================================
//  Las Estadísticas de Asignaciones se alimentan de las CONFIRMACIONES.
//
//  Se comprueba el recorrido entero contra la base real, dentro de una
//  transacción que se revierte: lo que el hermano responde al abrir el enlace
//  de WhatsApp es lo que aparece en las estadísticas.
//
//   1. Una asignación sin responder cuenta como "sin respuesta".
//   2. Si responde que SÍ (lo que escribe la página de confirmación), pasa a
//      "confirmada" y suma a ese hermano.
//   3. Si responde que NO, pasa a "rechazada" y NO suma como confirmada.
//   4. Responsable y Auxiliar se cuentan por separado.
//   5. Ya no queda rastro del registro antiguo de "¿se realizó?".
//
//    npx tsx scripts/test-confirmaciones-estadisticas.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";
import { doneStateOf, normalizeName } from "../src/lib/assignment-stats.js";
import { CONFIRM_STATUS } from "../src/lib/constants.js";

const p = new PrismaClient();
let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};

const cong = await p.congregation.findFirstOrThrow({
  where: { slug: "ocoa" },
  select: { id: true, name: true },
});
console.log(`Congregación: ${cong.name}\n`);

class Rollback extends Error {}

/** Estado de cada hermano, como lo leen las Estadísticas. */
async function estados(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
) {
  const asg = await tx.meetingAssignment.findMany({
    where: { meeting: { congregationId: cong.id } },
    select: {
      primaryName: true,
      primaryStatus: true,
      secondaryName: true,
      secondaryStatus: true,
    },
  });
  const porHermano = new Map<string, { confirmadas: number; rechazadas: number; sinResp: number }>();
  for (const a of asg) {
    for (const [nombre, estado] of [
      [a.primaryName, a.primaryStatus],
      [a.secondaryName, a.secondaryStatus],
    ] as const) {
      if (!nombre?.trim()) continue;
      const k = normalizeName(nombre);
      const v = porHermano.get(k) ?? { confirmadas: 0, rechazadas: 0, sinResp: 0 };
      const s = doneStateOf(estado);
      if (s === "confirmada") v.confirmadas++;
      else if (s === "rechazada") v.rechazadas++;
      else v.sinResp++;
      porHermano.set(k, v);
    }
  }
  return porHermano;
}

try {
  await p.$transaction(async (tx) => {
    // --- 1. Punto de partida ---
    console.log("1. Antes de responder nada");
    const una = await tx.meetingAssignment.findFirst({
      where: {
        meeting: { congregationId: cong.id },
        NOT: { primaryName: null },
        primaryStatus: CONFIRM_STATUS.PENDIENTE,
      },
      select: { id: true, primaryName: true, label: true },
    });
    if (!una) throw new Rollback();
    const hermano = normalizeName(una.primaryName!);
    const antes = (await estados(tx)).get(hermano)!;
    console.log(
      `   "${una.primaryName}" -> confirmadas ${antes.confirmadas} · rechazadas ${antes.rechazadas} · sin respuesta ${antes.sinResp}`,
    );
    check(antes.sinResp > 0, "su asignación pendiente cuenta como sin respuesta");

    // --- 2. Responde que SÍ (lo mismo que escribe /confirmar/[token]) ---
    console.log("\n2. El hermano responde que SÍ desde el enlace");
    await tx.meetingAssignment.update({
      where: { id: una.id },
      data: { primaryStatus: CONFIRM_STATUS.CONFIRMADO },
    });
    const traSi = (await estados(tx)).get(hermano)!;
    check(
      traSi.confirmadas === antes.confirmadas + 1,
      `sus confirmadas suben a ${traSi.confirmadas}`,
    );
    check(
      traSi.sinResp === antes.sinResp - 1,
      `y sus pendientes bajan a ${traSi.sinResp}`,
    );

    // --- 3. Responde que NO ---
    console.log("\n3. El hermano responde que NO");
    await tx.meetingAssignment.update({
      where: { id: una.id },
      data: { primaryStatus: CONFIRM_STATUS.RECHAZADO },
    });
    const traNo = (await estados(tx)).get(hermano)!;
    check(
      traNo.confirmadas === antes.confirmadas,
      "deja de contar como confirmada",
    );
    check(
      traNo.rechazadas === antes.rechazadas + 1,
      `y pasa a rechazada (${traNo.rechazadas})`,
    );

    // --- 4. Responsable y Auxiliar, por separado ---
    console.log("\n4. Responsable y Auxiliar se cuentan aparte");
    const doble = await tx.meetingAssignment.findFirst({
      where: {
        meeting: { congregationId: cong.id },
        NOT: [{ primaryName: null }, { secondaryName: null }],
      },
      select: { id: true, primaryName: true, secondaryName: true },
    });
    if (doble?.primaryName && doble.secondaryName) {
      await tx.meetingAssignment.update({
        where: { id: doble.id },
        data: {
          primaryStatus: CONFIRM_STATUS.CONFIRMADO,
          secondaryStatus: CONFIRM_STATUS.RECHAZADO,
        },
      });
      const m = await estados(tx);
      const resp = m.get(normalizeName(doble.primaryName))!;
      const aux = m.get(normalizeName(doble.secondaryName))!;
      console.log(`   "${doble.primaryName}" (responsable) y "${doble.secondaryName}" (auxiliar)`);
      check(resp.confirmadas > 0, "el responsable consta como confirmada");
      check(aux.rechazadas > 0, "y el auxiliar como rechazada");
    } else {
      console.log("   (no hay ninguna asignación con los dos puestos; se omite)");
    }

    throw new Rollback();
  }, { timeout: 30000 });
} catch (e) {
  if (!(e instanceof Rollback)) throw e;
}

console.log("\n5. Ya no se usa el registro antiguo de cumplimiento");
const codigo = await import("node:fs").then((fs) =>
  fs.readFileSync("src/server/assignment-stats-actions.ts", "utf8"),
);
check(
  !/primaryDone|secondaryDone/.test(codigo),
  "las Estadísticas no leen primaryDone ni secondaryDone",
);
const existePanel = await import("node:fs").then((fs) =>
  fs.existsSync("src/components/forms/MeetingDonePanel.tsx"),
);
check(!existePanel, "el panel «¿Qué asignaciones se realizaron?» ya no existe");

console.log("\n--- La base quedó intacta ---");
const confirmadas = await p.meetingAssignment.count({
  where: {
    meeting: { congregationId: cong.id },
    primaryStatus: CONFIRM_STATUS.CONFIRMADO,
  },
});
console.log(`  confirmadas en la base: ${confirmadas}`);

await p.$disconnect();
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
