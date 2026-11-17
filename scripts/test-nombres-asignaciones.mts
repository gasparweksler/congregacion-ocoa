// ============================================================================
//  Nombres que no coinciden: eliminarlos del historial y fusionarlos.
//
//  Lo que se comprueba:
//
//   1. La regla de qué fila se toca y con qué nombre queda (módulo puro):
//      solo el nombre EXACTO, nunca "el que se parece", y al fusionar el
//      mismo hermano no puede quedar dos veces en la misma asignación.
//
//   2. El efecto real sobre la base: contra una congregación de prueba,
//      dentro de una transacción que se revierte al terminar. Se comprueba
//      que las asignaciones NO se borran (se quedan sin hermano), que el
//      historial que se queda sin ningún nombre sí desaparece, que los demás
//      hermanos no se tocan y que, tras fusionar, el nombre ya casa con el
//      hermano inscrito (que es lo que hace que cuente en las estadísticas).
//
//      npm run test:nombres
// ============================================================================
import { PrismaClient, type Prisma } from "@prisma/client";
import { MEETING_DAYS } from "../src/lib/constants.js";
import { matchPublisher } from "../src/lib/assignment-stats.js";
import {
  esEseNombre,
  filaLlevaElNombre,
  fusionarNombre,
  quitarNombre,
} from "../src/lib/nombres-asignaciones.js";

const p = new PrismaClient();
let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};

/** Para revertir la transacción a propósito al final. */
class Rollback extends Error {}

const SUELTO = "Juan Aviles X";
const OFICIAL = "Juan Ernesto Avilés";
const OTRO = "Pedro Soto";

// ---------------------------------------------------------------------------
console.log("\n1) Qué fila se toca");

check(esEseNombre(SUELTO, SUELTO), "el nombre exacto sí");
check(esEseNombre(`  ${SUELTO}  `, SUELTO), "con espacios de sobra, también");
check(!esEseNombre("Juan Aviles", SUELTO), "un nombre parecido NO");
check(!esEseNombre("juan aviles x", SUELTO), "el mismo en minúsculas NO (es otro texto)");
check(!esEseNombre(null, SUELTO), "un hueco vacío NO");
check(
  filaLlevaElNombre({ primaryName: OTRO, secondaryName: SUELTO }, SUELTO),
  "la fila cuenta aunque el nombre esté en el segundo hueco",
);
check(
  !filaLlevaElNombre({ primaryName: OTRO, secondaryName: null }, SUELTO),
  "y no cuenta si no está en ninguno",
);

console.log("\n2) Quitar el nombre");
{
  const solo = quitarNombre({ primaryName: SUELTO, secondaryName: null }, SUELTO);
  check(
    solo.primaryName === null && solo.vacia,
    "si era el único nombre, la fila queda vacía",
  );

  const conOtro = quitarNombre(
    { primaryName: SUELTO, secondaryName: OTRO },
    SUELTO,
  );
  check(
    conOtro.primaryName === null && conOtro.secondaryName === OTRO && !conOtro.vacia,
    "si había otro hermano, ese se queda",
  );

  const ajena = quitarNombre({ primaryName: OTRO, secondaryName: null }, SUELTO);
  check(
    ajena.primaryName === OTRO && !ajena.vacia,
    "una fila de otro hermano no se toca",
  );
}

console.log("\n3) Fusionar el nombre");
{
  const uno = fusionarNombre(
    { primaryName: SUELTO, secondaryName: null },
    SUELTO,
    OFICIAL,
  );
  check(
    uno.primaryName === OFICIAL && !uno.duplicado,
    "el texto suelto pasa a ser el nombre oficial",
  );

  const segundo = fusionarNombre(
    { primaryName: OTRO, secondaryName: SUELTO },
    SUELTO,
    OFICIAL,
  );
  check(
    segundo.primaryName === OTRO && segundo.secondaryName === OFICIAL,
    "también cuando está en el segundo hueco, y el otro hermano se queda",
  );

  const repetido = fusionarNombre(
    { primaryName: "Juan Ernesto Aviles", secondaryName: SUELTO },
    SUELTO,
    OFICIAL,
  );
  check(
    repetido.primaryName === "Juan Ernesto Aviles" &&
      repetido.secondaryName === null &&
      repetido.duplicado,
    "si el hermano quedaría dos veces en la misma asignación, solo queda una",
  );

  const ajena = fusionarNombre(
    { primaryName: OTRO, secondaryName: null },
    SUELTO,
    OFICIAL,
  );
  check(
    ajena.primaryName === OTRO && !ajena.duplicado,
    "y a otro hermano no se le cambia el nombre",
  );
}

// ---------------------------------------------------------------------------
/** Monta la congregación de prueba con sus asignaciones y su historial. */
async function montar(tx: Prisma.TransactionClient) {
  const cong = await tx.congregation.create({
    data: { name: "Prueba Nombres", slug: `prueba-nombres-${Date.now()}` },
    select: { id: true },
  });
  const grupo = await tx.group.create({
    data: { name: "Grupo de prueba", congregationId: cong.id },
    select: { id: true },
  });
  await tx.publisher.createMany({
    data: [
      {
        congregationId: cong.id,
        groupId: grupo.id,
        fullName: OFICIAL,
        status: "BAUTIZADO",
      },
      {
        congregationId: cong.id,
        groupId: grupo.id,
        fullName: OTRO,
        status: "BAUTIZADO",
      },
    ],
  });

  const reunion = await tx.meeting.create({
    data: {
      congregationId: cong.id,
      date: new Date(2020, 5, 1, 12),
      day: MEETING_DAYS.JUEVES,
      weekLabel: "Semana de prueba",
      assignments: {
        create: [
          // Solo el nombre suelto.
          {
            slotKey: "T1", section: "TESOROS", label: "Discurso", order: 0,
            primaryName: SUELTO, primaryToken: "tok-1", primaryStatus: "CONFIRMADO",
          },
          // El suelto como auxiliar, con otro hermano de responsable.
          {
            slotKey: "S1", section: "SMM", label: "Conversación", order: 1,
            allowTwo: true,
            primaryName: OTRO, primaryToken: "tok-2", primaryStatus: "PENDIENTE",
            secondaryName: SUELTO, secondaryToken: "tok-3", secondaryStatus: "CONFIRMADO",
          },
          // Nada que ver con el nombre suelto: no se puede tocar.
          {
            slotKey: "S2", section: "SMM", label: "Discurso estudiantil", order: 2,
            primaryName: OTRO, primaryToken: "tok-4", primaryStatus: "CONFIRMADO",
          },
        ],
      },
    },
    select: { id: true },
  });

  await tx.assignmentHistory.createMany({
    data: [
      // Historial con SOLO el nombre suelto: al quitarlo ya no dice nada.
      {
        congregationId: cong.id, meetingDate: new Date(2020, 4, 4, 12),
        day: MEETING_DAYS.JUEVES, weekLabel: "Borrada 1",
        slotKey: "T1", section: "TESOROS", label: "Discurso",
        primaryName: SUELTO, primaryStatus: "CONFIRMADO",
      },
      // Historial con los dos: al quitarlo tiene que quedarse el otro.
      {
        congregationId: cong.id, meetingDate: new Date(2020, 4, 11, 12),
        day: MEETING_DAYS.JUEVES, weekLabel: "Borrada 2",
        slotKey: "S1", section: "SMM", label: "Conversación",
        primaryName: OTRO, primaryStatus: "CONFIRMADO",
        secondaryName: SUELTO, secondaryStatus: "PENDIENTE",
      },
      // Ajena: ni se mira.
      {
        congregationId: cong.id, meetingDate: new Date(2020, 4, 18, 12),
        day: MEETING_DAYS.JUEVES, weekLabel: "Borrada 3",
        slotKey: "S2", section: "SMM", label: "Discurso estudiantil",
        primaryName: OTRO, primaryStatus: "CONFIRMADO",
      },
    ],
  });

  return { congId: cong.id, reunionId: reunion.id };
}

/** Las filas con ese nombre exacto, igual que hace la acción del servidor. */
async function filasCon(tx: Prisma.TransactionClient, congId: string, nombre: string) {
  const [vivas, historicas] = await Promise.all([
    tx.meetingAssignment.findMany({
      where: {
        meeting: { congregationId: congId },
        OR: [
          { primaryName: { contains: nombre } },
          { secondaryName: { contains: nombre } },
        ],
      },
      select: { id: true, primaryName: true, secondaryName: true },
    }),
    tx.assignmentHistory.findMany({
      where: {
        congregationId: congId,
        OR: [
          { primaryName: { contains: nombre } },
          { secondaryName: { contains: nombre } },
        ],
      },
      select: { id: true, primaryName: true, secondaryName: true },
    }),
  ]);
  const mia = (f: { primaryName: string | null; secondaryName: string | null }) =>
    filaLlevaElNombre(f, nombre);
  return { vivas: vivas.filter(mia), historicas: historicas.filter(mia) };
}

// ---------------------------------------------------------------------------
try {
  await p.$transaction(
    async (tx) => {
      const { congId } = await montar(tx);

      console.log("\n4) Eliminar del historial, contra la base");

      const publicadores = await tx.publisher.findMany({
        where: { congregationId: congId },
        select: { id: true, fullName: true },
      });
      check(
        matchPublisher(SUELTO, publicadores) === null,
        `"${SUELTO}" no casa con ningún hermano inscrito (por eso aparece suelto)`,
      );

      const { vivas, historicas } = await filasCon(tx, congId, SUELTO);
      check(vivas.length === 2, `lo encuentra en 2 asignaciones de reuniones (${vivas.length})`);
      check(historicas.length === 2, `y en 2 filas del historial (${historicas.length})`);

      for (const a of vivas) {
        const { primaryName, secondaryName } = quitarNombre(a, SUELTO);
        await tx.meetingAssignment.update({
          where: { id: a.id },
          data: {
            primaryName,
            secondaryName,
            ...(primaryName ? {} : { primaryToken: null, primaryStatus: "PENDIENTE" }),
            ...(secondaryName ? {} : { secondaryToken: null, secondaryStatus: "PENDIENTE" }),
          },
        });
      }
      let borradas = 0;
      for (const h of historicas) {
        const { primaryName, secondaryName, vacia } = quitarNombre(h, SUELTO);
        if (vacia) {
          await tx.assignmentHistory.delete({ where: { id: h.id } });
          borradas++;
          continue;
        }
        await tx.assignmentHistory.update({
          where: { id: h.id },
          data: { primaryName, secondaryName },
        });
      }
      check(borradas === 1, `una fila del historial se quedó sin nombres y se borró (${borradas})`);

      const asignaciones = await tx.meetingAssignment.findMany({
        where: { meeting: { congregationId: congId } },
        orderBy: { order: "asc" },
        select: {
          slotKey: true, primaryName: true, secondaryName: true,
          primaryToken: true, primaryStatus: true, secondaryStatus: true,
        },
      });
      check(asignaciones.length === 3, `las 3 asignaciones siguen existiendo (${asignaciones.length})`);
      const t1 = asignaciones.find((a) => a.slotKey === "T1")!;
      check(
        t1.primaryName === null && t1.primaryToken === null && t1.primaryStatus === "PENDIENTE",
        "la que solo tenía ese nombre queda sin hermano, sin enlace y pendiente",
      );
      const s1 = asignaciones.find((a) => a.slotKey === "S1")!;
      check(
        s1.primaryName === OTRO && s1.secondaryName === null,
        "en la que era auxiliar, el responsable sigue igual",
      );
      const s2 = asignaciones.find((a) => a.slotKey === "S2")!;
      check(
        s2.primaryName === OTRO && s2.primaryStatus === "CONFIRMADO",
        "la asignación ajena no se tocó, ni su confirmación",
      );

      const hist = await tx.assignmentHistory.findMany({
        where: { congregationId: congId },
        orderBy: { meetingDate: "asc" },
        select: { weekLabel: true, primaryName: true, secondaryName: true },
      });
      check(hist.length === 2, `quedan 2 filas de historial (${hist.length})`);
      check(
        hist.every((h) => h.primaryName !== SUELTO && h.secondaryName !== SUELTO),
        `el nombre "${SUELTO}" ya no está en ningún registro`,
      );
      check(
        hist.filter((h) => h.primaryName === OTRO).length === 2,
        "y las participaciones del otro hermano siguen las dos",
      );
      check(
        (await tx.publisher.count({ where: { congregationId: congId } })) === 2,
        "no se borró ningún hermano inscrito",
      );

      throw new Rollback();
    },
    { timeout: 60_000 },
  );
} catch (e) {
  if (!(e instanceof Rollback)) throw e;
}

// ---------------------------------------------------------------------------
try {
  await p.$transaction(
    async (tx) => {
      const { congId } = await montar(tx);

      console.log("\n5) Fusionar con el hermano inscrito, contra la base");

      // Una asignación más donde el hermano ya está de responsable con su
      // nombre oficial y el suelto de auxiliar: fusionar lo dejaría dos veces.
      const reunion2 = await tx.meeting.create({
        data: {
          congregationId: congId,
          date: new Date(2020, 5, 8, 12),
          day: MEETING_DAYS.JUEVES,
          weekLabel: "Semana con repetido",
          assignments: {
            create: [
              {
                slotKey: "S3", section: "SMM", label: "Empiece una conversación",
                order: 0, allowTwo: true,
                primaryName: OFICIAL, primaryStatus: "CONFIRMADO",
                secondaryName: SUELTO, secondaryStatus: "PENDIENTE",
              },
            ],
          },
        },
        select: { id: true },
      });

      const { vivas, historicas } = await filasCon(tx, congId, SUELTO);
      check(vivas.length === 3, `encuentra las 3 asignaciones con ese nombre (${vivas.length})`);

      let duplicados = 0;
      for (const a of vivas) {
        const { primaryName, secondaryName, duplicado } = fusionarNombre(a, SUELTO, OFICIAL);
        if (duplicado) duplicados++;
        await tx.meetingAssignment.update({
          where: { id: a.id },
          data: {
            primaryName,
            secondaryName,
            ...(secondaryName ? {} : { secondaryToken: null, secondaryStatus: "PENDIENTE" }),
          },
        });
      }
      for (const h of historicas) {
        const { primaryName, secondaryName } = fusionarNombre(h, SUELTO, OFICIAL);
        await tx.assignmentHistory.update({
          where: { id: h.id },
          data: { primaryName, secondaryName },
        });
      }
      check(duplicados === 1, `evitó 1 repetición del mismo hermano (${duplicados})`);

      const todas = await tx.meetingAssignment.findMany({
        where: { meeting: { congregationId: congId } },
        select: {
          slotKey: true, primaryName: true, secondaryName: true, primaryStatus: true,
        },
      });
      check(todas.length === 4, `siguen las 4 asignaciones (${todas.length})`);
      check(
        todas.every((a) => a.primaryName !== SUELTO && a.secondaryName !== SUELTO),
        "ya no queda el nombre mal escrito en ninguna",
      );
      check(
        todas.filter((a) => a.primaryName === OFICIAL || a.secondaryName === OFICIAL).length === 3,
        "el hermano aparece ahora en sus 3 asignaciones",
      );
      const s3 = todas.find((a) => a.slotKey === "S3")!;
      check(
        s3.primaryName === OFICIAL && s3.secondaryName === null,
        "donde habría quedado dos veces, solo aparece una",
      );
      const t1 = todas.find((a) => a.slotKey === "T1")!;
      check(
        t1.primaryStatus === "CONFIRMADO",
        "la confirmación que ya había dado se conserva",
      );
      check(
        todas.filter((a) => a.primaryName === OTRO).length === 2,
        "y el otro hermano conserva sus dos asignaciones",
      );

      const hist = await tx.assignmentHistory.findMany({
        where: { congregationId: congId },
        select: { primaryName: true, secondaryName: true },
      });
      check(hist.length === 3, `el historial conserva sus 3 filas (${hist.length})`);
      check(
        hist.filter((h) => h.primaryName === OFICIAL || h.secondaryName === OFICIAL).length === 2,
        "con las 2 participaciones del hermano ya a su nombre",
      );

      // Y lo que de verdad importa: ahora SÍ casa con el hermano inscrito,
      // que es lo que hace que cuente en las estadísticas y en el gráfico.
      const publicadores = await tx.publisher.findMany({
        where: { congregationId: congId },
        select: { id: true, fullName: true },
      });
      const casa = matchPublisher(OFICIAL, publicadores);
      check(casa?.fullName === OFICIAL, "el nombre ya casa con el hermano inscrito");
      void reunion2;

      throw new Rollback();
    },
    { timeout: 60_000 },
  );
} catch (e) {
  if (!(e instanceof Rollback)) throw e;
}

console.log("\n6) No quedó nada en la base");
const sobrantes = await p.congregation.count({ where: { name: "Prueba Nombres" } });
check(sobrantes === 0, `ninguna congregación de prueba sobrevivió (${sobrantes})`);

await p.$disconnect();
console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
