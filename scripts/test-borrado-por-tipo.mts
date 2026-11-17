// ============================================================================
//  "Eliminar todas" borra SOLO el tipo de reunión que se está viendo.
//
//  Los tres botones de la pantalla de Reuniones (entre semana, fin de semana,
//  todas) cambian el nombre y el alcance del borrado masivo. Aquí se comprueba
//  que ese alcance es de verdad el que dice, y que nunca se lleva por delante
//  ni el otro tipo ni otra congregación.
//
//  Contra la base REAL, sin dejar rastro: todo ocurre dentro de una
//  transacción que se revierte al terminar.
//
//      npm run test:borrado-tipo
// ============================================================================
import { PrismaClient, type Prisma } from "@prisma/client";
import { MEETING_DAYS } from "../src/lib/constants.js";

const p = new PrismaClient();
let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};

/** Para revertir la transacción a propósito al final. */
class Rollback extends Error {}

/**
 * El mismo `where` que arma deleteAllMeetingsAction a partir del botón que se
 * pulsó. Es la pieza que decide el alcance, así que es la que se prueba.
 */
function donde(cong: string, dia: string | null) {
  return { congregationId: cong, ...(dia ? { day: dia } : {}) };
}

async function crearReunion(
  tx: Prisma.TransactionClient,
  cong: string,
  day: string,
  etiqueta: string,
  fecha: Date,
) {
  return tx.meeting.create({
    data: {
      congregationId: cong,
      date: fecha,
      day,
      weekLabel: etiqueta,
      assignments: {
        create: [
          {
            slotKey: "T1",
            section: "TESOROS",
            label: "Discurso",
            order: 1,
            primaryName: "Hermano De Prueba",
          },
        ],
      },
    },
    select: { id: true },
  });
}

try {
  await p.$transaction(
    async (tx) => {
      // --- Dos congregaciones de prueba --------------------------------
      const congA = await tx.congregation.create({
        data: { name: "Prueba Borrado A", slug: `prueba-borrado-a-${Date.now()}` },
        select: { id: true },
      });
      const congB = await tx.congregation.create({
        data: { name: "Prueba Borrado B", slug: `prueba-borrado-b-${Date.now()}` },
        select: { id: true },
      });

      const base = new Date(2099, 0, 5, 12);
      const f = (d: number) => new Date(2099, 0, d, 12);

      // A: 3 de entre semana + 2 de fin de semana
      for (let i = 0; i < 3; i++) {
        await crearReunion(tx, congA.id, MEETING_DAYS.JUEVES, `Semana ${i + 1}`, f(5 + i * 7));
      }
      for (let i = 0; i < 2; i++) {
        await crearReunion(tx, congA.id, MEETING_DAYS.SABADO, `Finde ${i + 1}`, f(10 + i * 7));
      }
      // B: 2 de cada tipo, para comprobar que no se tocan nunca
      for (let i = 0; i < 2; i++) {
        await crearReunion(tx, congB.id, MEETING_DAYS.JUEVES, `B semana ${i + 1}`, f(5 + i * 7));
        await crearReunion(tx, congB.id, MEETING_DAYS.SABADO, `B finde ${i + 1}`, f(10 + i * 7));
      }
      void base;

      const cuenta = async (cong: string, day?: string) =>
        tx.meeting.count({ where: { congregationId: cong, ...(day ? { day } : {}) } });

      console.log("\n1) Punto de partida");
      check((await cuenta(congA.id)) === 5, `la congregación A tiene 5 reuniones (${await cuenta(congA.id)})`);
      check((await cuenta(congA.id, MEETING_DAYS.JUEVES)) === 3, "3 de entre semana");
      check((await cuenta(congA.id, MEETING_DAYS.SABADO)) === 2, "2 de fin de semana");
      check((await cuenta(congB.id)) === 4, "la congregación B tiene 4");

      // --- Botón "Eliminar todas las de entre semana" -------------------
      console.log("\n2) «Eliminar todas las de entre semana»");
      const r1 = await tx.meeting.deleteMany({
        where: donde(congA.id, MEETING_DAYS.JUEVES),
      });
      check(r1.count === 3, `borra las 3 de entre semana (${r1.count})`);
      check((await cuenta(congA.id, MEETING_DAYS.JUEVES)) === 0, "no queda ninguna de entre semana");
      check(
        (await cuenta(congA.id, MEETING_DAYS.SABADO)) === 2,
        `las 2 de fin de semana siguen ahí (${await cuenta(congA.id, MEETING_DAYS.SABADO)})`,
      );
      check((await cuenta(congB.id)) === 4, "la congregación B sigue intacta (4)");

      // --- Botón "Eliminar todas las de fin de semana" ------------------
      console.log("\n3) «Eliminar todas las de fin de semana»");
      for (let i = 0; i < 3; i++) {
        await crearReunion(tx, congA.id, MEETING_DAYS.JUEVES, `Semana ${i + 1}`, f(5 + i * 7));
      }
      const r2 = await tx.meeting.deleteMany({
        where: donde(congA.id, MEETING_DAYS.SABADO),
      });
      check(r2.count === 2, `borra las 2 de fin de semana (${r2.count})`);
      check(
        (await cuenta(congA.id, MEETING_DAYS.JUEVES)) === 3,
        `las 3 de entre semana recién creadas siguen ahí (${await cuenta(congA.id, MEETING_DAYS.JUEVES)})`,
      );
      check((await cuenta(congB.id)) === 4, "la congregación B sigue intacta (4)");

      // --- Botón "Eliminar todas las reuniones registradas" -------------
      console.log("\n4) «Eliminar todas las reuniones registradas»");
      await crearReunion(tx, congA.id, MEETING_DAYS.SABADO, "Finde nuevo", f(24));
      const antes = await cuenta(congA.id);
      const r3 = await tx.meeting.deleteMany({ where: donde(congA.id, null) });
      check(r3.count === antes, `borra las ${antes} de los dos tipos (${r3.count})`);
      check((await cuenta(congA.id)) === 0, "la congregación A queda vacía");
      check((await cuenta(congB.id)) === 4, "y la congregación B sigue con sus 4");
      check(
        (await cuenta(congB.id, MEETING_DAYS.JUEVES)) === 2 &&
          (await cuenta(congB.id, MEETING_DAYS.SABADO)) === 2,
        "B conserva 2 de cada tipo",
      );

      // --- Casillas: "Eliminar reuniones seleccionadas" -----------------
      //
      // El mismo `where` que arma deleteSelectedMeetingsAction con los ids
      // marcados: lo que decide el alcance es ese `in` junto al filtro de
      // congregación, así que es lo que se prueba.
      console.log("\n5) «Eliminar reuniones seleccionadas»");
      const nuevas: string[] = [];
      for (let i = 0; i < 4; i++) {
        const m = await crearReunion(
          tx,
          congA.id,
          i % 2 === 0 ? MEETING_DAYS.JUEVES : MEETING_DAYS.SABADO,
          `Elegible ${i + 1}`,
          f(5 + i * 3),
        );
        nuevas.push(m.id);
      }
      const deB = (
        await tx.meeting.findMany({
          where: { congregationId: congB.id },
          select: { id: true },
        })
      ).map((m) => m.id);

      // Se marcan dos de A... y, por si acaso, se cuelan dos de B: aunque
      // llegaran en el formulario, el filtro por congregación las ignora.
      const marcadas = [nuevas[0], nuevas[1], ...deB];
      const r4 = await tx.meeting.deleteMany({
        where: { id: { in: marcadas }, congregationId: congA.id },
      });
      check(r4.count === 2, `borra solo las 2 marcadas de A (${r4.count})`);
      check(
        (await cuenta(congA.id)) === 2,
        `quedan las otras 2 de A (${await cuenta(congA.id)})`,
      );
      const quedan = (
        await tx.meeting.findMany({
          where: { congregationId: congA.id },
          select: { id: true },
        })
      ).map((m) => m.id);
      check(
        quedan.includes(nuevas[2]) && quedan.includes(nuevas[3]),
        "y son justo las que NO se marcaron",
      );
      check(
        (await cuenta(congB.id)) === 4,
        `la congregación B sigue con sus 4 aunque sus ids iban en la lista (${await cuenta(congB.id)})`,
      );
      // Y de los dos tipos: la selección no entiende de entre semana ni de
      // fin de semana, borra lo que se marcó y ya está.
      check(
        (await cuenta(congA.id, MEETING_DAYS.JUEVES)) === 1 &&
          (await cuenta(congA.id, MEETING_DAYS.SABADO)) === 1,
        "en A queda una de cada tipo",
      );
      await tx.meeting.deleteMany({ where: { congregationId: congA.id } });

      // --- Las asignaciones se van con su reunión ----------------------
      console.log("\n6) Las asignaciones de B no se tocaron");
      const asigB = await tx.meetingAssignment.count({
        where: { meeting: { congregationId: congB.id } },
      });
      check(asigB === 4, `B conserva sus 4 asignaciones (${asigB})`);

      throw new Rollback();
    },
    { timeout: 60_000 },
  );
} catch (e) {
  if (!(e instanceof Rollback)) throw e;
}

console.log("\n7) No quedó nada en la base");
const sobrantes = await p.congregation.count({
  where: { name: { startsWith: "Prueba Borrado " } },
});
check(sobrantes === 0, `ninguna congregación de prueba sobrevivió (${sobrantes})`);

await p.$disconnect();
console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
