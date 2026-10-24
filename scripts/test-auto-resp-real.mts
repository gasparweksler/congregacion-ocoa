// ============================================================================
//  Asignación automática contra la base REAL, sin dejar rastro: todo ocurre
//  dentro de una transacción que se revierte al final.
//
//  Comprueba lo que el módulo puro no puede: que los datos de verdad
//  (publicadores, reuniones, partes ya asignadas) entren bien en el algoritmo.
//   1. Con los disponibles registrados, se cubren las casillas vacías.
//   2. No se propone a nadie que ya tenga una PARTE en esa reunión, salvo que
//      no haya alternativa, y entonces se informa.
//   3. Las responsabilidades que ya tienen nombre no se tocan.
//   4. Nadie recibe dos cosas en la misma reunión.
//   5. Nada de otra congregación entra en el reparto.
//
//    npx tsx scripts/test-auto-resp-real.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";
import { autoAssign, makeRandom, type Candidate, type MeetingContext, type Position } from "../src/lib/resp-auto-assign.js";
import { findWeekMeeting } from "../src/lib/meeting-week.js";
import { meetingDatesInMonth } from "../src/lib/period.js";
import { normalizeName } from "../src/lib/assignment-stats.js";
import { MONTHLY_RESPONSIBILITIES, RESP_CATEGORIES, categoryOfSlot } from "../src/lib/constants.js";

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
const otra = await p.congregation.findFirst({
  where: { NOT: { id: cong!.id } },
  select: { id: true, name: true },
});
if (!cong) {
  console.log("No se encontró la congregación de prueba.");
  await p.$disconnect();
  process.exit(1);
}
console.log(`Congregación: ${cong.name}\n`);

try {
  await p.$transaction(async (tx) => {
    // --- Preparación: apuntar hermanos reales a cada categoría ---
    const pubs = await tx.publisher.findMany({
      where: { congregationId: cong.id, active: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    });
    check(pubs.length > 10, `hay ${pubs.length} publicadores activos para repartir`);

    // 4 por categoría, sin solaparse, salvo uno a propósito en dos categorías.
    let i = 0;
    const apuntados: { category: string; publisherId: string; name: string }[] = [];
    for (const cat of RESP_CATEGORIES) {
      for (let k = 0; k < 4; k++) {
        const pub = pubs[i++ % pubs.length];
        apuntados.push({ category: cat.key, publisherId: pub.id, name: pub.fullName });
      }
    }
    // Uno con dos funciones: el primero de audio también hace vídeo.
    const multi = apuntados.find((a) => a.category === "AUDIO")!;
    apuntados.push({ category: "VIDEO", publisherId: multi.publisherId, name: multi.name });

    await tx.responsibilityVolunteer.createMany({
      data: apuntados.map((a) => ({
        congregationId: cong.id,
        category: a.category,
        publisherId: a.publisherId,
      })),
      skipDuplicates: true,
    });
    const guardados = await tx.responsibilityVolunteer.count({
      where: { congregationId: cong.id },
    });
    check(guardados === apuntados.length, `se registran ${guardados} disponibles`);

    // Alguien de otra congregación NO debe entrar nunca.
    if (otra) {
      const ajeno = await tx.publisher.findFirst({
        where: { congregationId: otra.id },
        select: { id: true, fullName: true },
      });
      if (ajeno) {
        await tx.responsibilityVolunteer.create({
          data: { congregationId: otra.id, category: "AUDIO", publisherId: ajeno.id },
        });
        console.log(`  (se apuntó a "${ajeno.fullName}" de ${otra.name}, no debe aparecer)`);
      }
    }

    // --- Se replica lo que hace proposeAutoAssignAction ---
    const dias = { midweekDay: cong.midweekDay, weekendDay: cong.weekendDay };
    const year = 2026;
    const month = 10;
    const fechas = meetingDatesInMonth(year, month, dias);
    const meetings = await tx.meeting.findMany({
      where: {
        congregationId: cong.id,
        date: {
          gte: new Date(year, month - 1, 1 - 8),
          lt: new Date(year, month, 1 + 8),
        },
      },
      include: { assignments: true },
    });
    console.log(`\n1. Mes de prueba: ${fechas.length} fechas · ${meetings.length} reuniones creadas`);

    const voluntarios = await tx.responsibilityVolunteer.findMany({
      where: { congregationId: cong.id },
      select: { category: true, publisherId: true, publisher: { select: { fullName: true } } },
    });

    const positions: Position[] = [];
    const contexts: MeetingContext[] = [];
    const yaConNombre: string[] = [];
    const cargaPrevia = new Map<string, number>();

    for (const { date, day } of fechas) {
      const dateISO = `${year}-${String(month).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const reunion = findWeekMeeting(meetings, date, day);
      const partNames: string[] = [];
      const respNames: string[] = [];
      const partLabelByName: Record<string, string> = {};
      for (const a of reunion?.assignments ?? []) {
        const esResp = SLOTS.some((r) => r.key === a.slotKey) || a.slotKey === "r_limpieza";
        for (const n of [a.primaryName, a.secondaryName]) {
          if (!n?.trim()) continue;
          if (esResp) {
            respNames.push(n);
            cargaPrevia.set(normalizeName(n), (cargaPrevia.get(normalizeName(n)) ?? 0) + 1);
          } else {
            partNames.push(n);
            if (!partLabelByName[normalizeName(n)]) partLabelByName[normalizeName(n)] = a.label;
          }
        }
      }
      contexts.push({ dateISO, label: reunion?.weekLabel ?? dateISO, partNames, respNames, partLabelByName });
      for (const slot of SLOTS) {
        const cat = categoryOfSlot(slot.key);
        if (!cat) continue;
        const actual = reunion?.assignments.find((a) => a.slotKey === slot.key);
        if (actual?.primaryName?.trim()) {
          yaConNombre.push(`${dateISO} ${slot.key}=${actual.primaryName.trim()}`);
          continue;
        }
        positions.push({ dateISO, day, slotKey: slot.key, slotLabel: slot.label, category: cat.key });
      }
    }

    const porPublicador = new Map<string, Candidate>();
    for (const v of voluntarios) {
      const prev = porPublicador.get(v.publisherId);
      if (prev) {
        prev.categories.push(v.category);
        continue;
      }
      porPublicador.set(v.publisherId, {
        publisherId: v.publisherId,
        name: v.publisher.fullName,
        categories: [v.category],
        loadBefore: cargaPrevia.get(normalizeName(v.publisher.fullName)) ?? 0,
      });
    }

    const r = autoAssign(positions, contexts, [...porPublicador.values()], makeRandom(42));
    console.log(`   casillas vacías: ${positions.length} · propuestas: ${r.proposals.length} · sin cubrir: ${r.uncovered.length}`);
    check(positions.length > 0, "hay casillas vacías que repartir");
    check(
      r.proposals.length + r.uncovered.length === positions.length,
      "cada casilla acaba propuesta o informada como sin cubrir",
    );

    console.log("\n2. Conflictos con las partes de la reunión");
    const conflictos = r.proposals.filter((c) => c.conflict);
    console.log(`   con conflicto: ${conflictos.length}`);
    for (const c of conflictos.slice(0, 5)) {
      console.log(`     ${c.name} — ${c.dateISO}: «${c.conflictWith}» + «${c.slotLabel}»`);
    }
    check(
      conflictos.every((c) => !!c.conflictWith),
      "todo conflicto dice con qué parte choca",
    );
    // Quien tiene parte y NO fue propuesto, es porque había alternativa libre.
    const conParte = new Set(contexts.flatMap((c) => c.partNames.map(normalizeName)));
    const propuestosConParte = r.proposals.filter((x) => conParte.has(normalizeName(x.name)));
    check(
      propuestosConParte.every((x) => x.conflict || !contexts.find((c) => c.dateISO === x.dateISO)?.partNames.map(normalizeName).includes(normalizeName(x.name))),
      "nadie con parte en ESA reunión se propone sin marcar el conflicto",
    );

    console.log("\n3. Lo que ya tenía nombre no se toca");
    console.log(`   casillas ya ocupadas: ${yaConNombre.length}`);
    check(
      r.proposals.every((x) => !yaConNombre.some((y) => y.startsWith(`${x.dateISO} ${x.slotKey}=`))),
      "ninguna propuesta pisa una casilla que ya tenía nombre",
    );

    console.log("\n4. Nadie dos veces en la misma reunión");
    let repetidos = 0;
    for (const c of contexts) {
      const delDia = r.proposals.filter((x) => x.dateISO === c.dateISO).map((x) => normalizeName(x.name));
      const previos = c.respNames.map(normalizeName);
      const todos = [...delDia, ...previos];
      if (new Set(todos).size !== todos.length) repetidos++;
    }
    check(repetidos === 0, `ninguna reunión repite a un hermano (${repetidos})`);

    console.log("\n5. Aislamiento entre congregaciones");
    if (otra) {
      const ajenos = await tx.publisher.findMany({
        where: { congregationId: otra.id },
        select: { fullName: true },
      });
      const nombresAjenos = new Set(ajenos.map((a) => normalizeName(a.fullName)));
      const colados = r.proposals.filter((x) => nombresAjenos.has(normalizeName(x.name)));
      check(colados.length === 0, `nadie de ${otra.name} entra en el reparto (${colados.length})`);
    } else {
      console.log("   (solo hay una congregación; se omite)");
    }

    console.log("\n6. Equidad del reparto");
    // La comparación justa es DENTRO de cada categoría: "Acomodadores" tiene
    // dos casillas por reunión y "Audio" una, así que con el mismo número de
    // hermanos el total nunca puede salir igual entre categorías distintas.
    const cargaPor = new Map(r.loads.map((l) => [normalizeName(l.name), l.total]));
    for (const cat of RESP_CATEGORIES) {
      const delCat = voluntarios
        .filter((v) => v.category === cat.key)
        .map((v) => cargaPor.get(normalizeName(v.publisher.fullName)) ?? 0);
      if (delCat.length === 0) continue;
      const max = Math.max(...delCat);
      const min = Math.min(...delCat);
      check(
        max - min <= 1,
        `${cat.label}: entre ${min} y ${max} por hermano (diferencia ${max - min})`,
      );
    }
    const conAlgo = r.loads.filter((l) => l.total > 0);
    console.log(
      `   (en total, entre ${Math.min(...conAlgo.map((l) => l.total))} y ${Math.max(...conAlgo.map((l) => l.total))} según cuántas casillas tenga su categoría)`,
    );

    throw new Error("ROLLBACK");
  });
} catch (e) {
  if (!(e instanceof Error) || e.message !== "ROLLBACK") throw e;
}

console.log("\n--- La base quedó intacta ---");
const quedan = await p.responsibilityVolunteer.count();
console.log(`  disponibles registrados: ${quedan}`);
check(quedan === 0, "no quedó ningún registro de prueba");

await p.$disconnect();
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
