// ============================================================================
//  "Limpiar Mes": deja en blanco las responsabilidades de publicador del mes.
//
//  Contra la base REAL, dentro de una transacción que se revierte, se comprueba
//  que:
//   1. Se vacían las responsabilidades de publicador del mes elegido.
//   2. NO se toca "Limpieza por Grupos".
//   3. NO se tocan las partes de las reuniones (Tesoros, SMM, Vida Cristiana).
//   4. NO se tocan los meses vecinos.
//   5. Los campos quedan igual que al borrar un nombre a mano: sin nombre, sin
//      enlace de confirmación y en Pendiente.
//
//    npx tsx scripts/test-limpiar-mes.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";
import { findWeekMeeting } from "../src/lib/meeting-week.js";
import { meetingDatesInMonth } from "../src/lib/period.js";
import { MONTHLY_RESPONSIBILITIES, CONFIRM_STATUS } from "../src/lib/constants.js";

const p = new PrismaClient();
let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};

const SLOTS = MONTHLY_RESPONSIBILITIES.filter((r) => r.kind === "publisher");

const cong = await p.congregation.findFirst({
  where: { name: "Ocoa" },
  select: { id: true, name: true, midweekDay: true, weekendDay: true },
});
if (!cong) {
  console.log("No se encontró la congregación de prueba.");
  await p.$disconnect();
  process.exit(1);
}
const antesTotal = await p.meetingAssignment.count({
  where: { meeting: { congregationId: cong.id }, NOT: { primaryName: null } },
});
console.log(`Congregación: ${cong.name} · asignaciones con nombre: ${antesTotal}\n`);

const year = 2026;
const month = 10; // el mes ya repartido

try {
  await p.$transaction(async (tx) => {
    const dias = { midweekDay: cong.midweekDay, weekendDay: cong.weekendDay };
    const meetings = await tx.meeting.findMany({
      where: {
        congregationId: cong.id,
        date: {
          gte: new Date(year, month - 1, 1 - 8),
          lt: new Date(year, month, 1 + 8),
        },
      },
      select: { id: true, date: true, day: true, weekLabel: true },
    });
    const ids = new Set<string>();
    for (const { date, day } of meetingDatesInMonth(year, month, dias)) {
      const m = findWeekMeeting(meetings, date, day);
      if (m) ids.add(m.id);
    }
    console.log(`1. Reuniones del mes: ${ids.size}`);
    check(ids.size > 0, "se encuentran las reuniones de octubre");

    // --- Estado antes ---
    const respAntes = await tx.meetingAssignment.count({
      where: {
        meetingId: { in: [...ids] },
        slotKey: { in: SLOTS.map((r) => r.key) },
        NOT: { primaryName: null },
      },
    });
    const limpiezaAntes = await tx.meetingAssignment.count({
      where: { meetingId: { in: [...ids] }, slotKey: "r_limpieza", NOT: { primaryName: null } },
    });
    const partesAntes = await tx.meetingAssignment.count({
      where: {
        meetingId: { in: [...ids] },
        NOT: { slotKey: { startsWith: "r_" }, primaryName: null },
        section: { notIn: ["RESPONSABILIDADES", "SAB_RESPONSABILIDADES"] },
      },
    });
    // Un mes vecino, para comprobar que no se toca.
    const vecinasAntes = await tx.meetingAssignment.count({
      where: {
        meeting: { congregationId: cong.id, NOT: { id: { in: [...ids] } } },
        slotKey: { in: SLOTS.map((r) => r.key) },
        NOT: { primaryName: null },
      },
    });
    console.log(
      `   antes -> responsabilidades: ${respAntes} · limpieza: ${limpiezaAntes} · partes: ${partesAntes} · fuera del mes: ${vecinasAntes}`,
    );
    check(respAntes > 0, "hay responsabilidades que limpiar");

    // --- La operación, idéntica a la de la acción ---
    const res = await tx.meetingAssignment.updateMany({
      where: {
        meetingId: { in: [...ids] },
        slotKey: { in: SLOTS.map((r) => r.key) },
        NOT: { primaryName: null },
      },
      data: {
        primaryName: null,
        primaryToken: null,
        primaryStatus: CONFIRM_STATUS.PENDIENTE,
      },
    });
    console.log(`\n2. Vaciadas: ${res.count}`);
    check(res.count === respAntes, `se vacían las ${respAntes} que había`);

    const respDespues = await tx.meetingAssignment.count({
      where: {
        meetingId: { in: [...ids] },
        slotKey: { in: SLOTS.map((r) => r.key) },
        NOT: { primaryName: null },
      },
    });
    check(respDespues === 0, `no queda ninguna con nombre (${respDespues})`);

    console.log("\n3. Lo que NO se debe tocar");
    const limpiezaDespues = await tx.meetingAssignment.count({
      where: { meetingId: { in: [...ids] }, slotKey: "r_limpieza", NOT: { primaryName: null } },
    });
    check(
      limpiezaDespues === limpiezaAntes,
      `Limpieza por Grupos intacta (${limpiezaDespues} de ${limpiezaAntes})`,
    );

    const partesDespues = await tx.meetingAssignment.count({
      where: {
        meetingId: { in: [...ids] },
        NOT: { slotKey: { startsWith: "r_" }, primaryName: null },
        section: { notIn: ["RESPONSABILIDADES", "SAB_RESPONSABILIDADES"] },
      },
    });
    check(
      partesDespues === partesAntes,
      `partes de las reuniones intactas (${partesDespues} de ${partesAntes})`,
    );

    const vecinasDespues = await tx.meetingAssignment.count({
      where: {
        meeting: { congregationId: cong.id, NOT: { id: { in: [...ids] } } },
        slotKey: { in: SLOTS.map((r) => r.key) },
        NOT: { primaryName: null },
      },
    });
    check(
      vecinasDespues === vecinasAntes,
      `responsabilidades de fuera del mes intactas (${vecinasDespues} de ${vecinasAntes})`,
    );

    console.log("\n4. Cómo quedan los campos vaciados");
    const muestra = await tx.meetingAssignment.findMany({
      where: { meetingId: { in: [...ids] }, slotKey: { in: SLOTS.map((r) => r.key) } },
      select: { primaryName: true, primaryToken: true, primaryStatus: true },
      take: 200,
    });
    check(
      muestra.every((a) => a.primaryName === null),
      "sin nombre",
    );
    check(
      muestra.every((a) => a.primaryToken === null),
      "sin enlace de confirmación (el viejo deja de valer)",
    );
    check(
      muestra.every((a) => a.primaryStatus === CONFIRM_STATUS.PENDIENTE),
      "y en estado Pendiente",
    );

    throw new Error("ROLLBACK");
  });
} catch (e) {
  if (!(e instanceof Error) || e.message !== "ROLLBACK") throw e;
}

console.log("\n--- La base quedó intacta ---");
const despuesTotal = await p.meetingAssignment.count({
  where: { meeting: { congregationId: cong.id }, NOT: { primaryName: null } },
});
console.log(`  asignaciones con nombre: ${despuesTotal}`);
check(despuesTotal === antesTotal, `siguen siendo ${antesTotal}`);

await p.$disconnect();
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
