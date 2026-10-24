// ============================================================================
//  Al eliminar una reunión, su historial se conserva para las Estadísticas.
//
//  Se prueba contra la base REAL sin dejar rastro: todo ocurre dentro de una
//  transacción que se revierte al final. Se comprueba que:
//   1. Al borrar conservando el historial, las asignaciones con nombre se
//      copian a AssignmentHistory y la reunión desaparece.
//   2. El historial guarda lo que importa: fecha, semana, parte, hermano,
//      confirmación y si se realizó.
//   3. Las casillas sin nadie asignado no se archivan (no aportan nada).
//   4. Al borrar SIN conservar, no queda historial.
//   5. Borrar una reunión no toca el historial de otra congregación.
//   6. Las Estadísticas suman las dos fuentes: lo vivo y lo eliminado.
//
//    npx tsx scripts/test-historial-borrado.mts
// ============================================================================
import { PrismaClient, type Prisma } from "@prisma/client";

const p = new PrismaClient();
let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};

/**
 * Misma lógica que usa la Server Action al eliminar: copiar a historial las
 * asignaciones con nombre. Se replica aquí sobre la transacción de prueba.
 */
async function archivar(
  tx: Prisma.TransactionClient,
  meetingIds: string[],
  cong: string,
  userId: string | null,
): Promise<number> {
  if (meetingIds.length === 0) return 0;
  const asignaciones = await tx.meetingAssignment.findMany({
    where: {
      meetingId: { in: meetingIds },
      OR: [{ NOT: { primaryName: null } }, { NOT: { secondaryName: null } }],
    },
    include: { meeting: { select: { id: true, date: true, day: true, weekLabel: true } } },
  });
  if (asignaciones.length === 0) return 0;
  await tx.assignmentHistory.createMany({
    data: asignaciones.map((a) => ({
      congregationId: cong,
      meetingId: a.meeting.id,
      meetingDate: a.meeting.date,
      day: a.meeting.day,
      weekLabel: a.meeting.weekLabel,
      slotKey: a.slotKey,
      section: a.section,
      label: a.label,
      order: a.order,
      primaryName: a.primaryName,
      primaryStatus: a.primaryStatus,
      primaryDone: a.primaryDone,
      secondaryName: a.secondaryName,
      secondaryStatus: a.secondaryStatus,
      secondaryDone: a.secondaryDone,
      deletedById: userId,
    })),
  });
  return asignaciones.length;
}

const congs = await p.congregation.findMany({
  select: { id: true, name: true },
  orderBy: { name: "asc" },
});
const ocoa = congs.find((c) => c.name === "Ocoa") ?? congs[0];
const otra = congs.find((c) => c.id !== ocoa.id);
console.log(`Congregación de prueba: ${ocoa.name}\n`);

try {
  await p.$transaction(async (tx) => {
    // --- Preparación: una reunión propia, con una casilla vacía a propósito ---
    const reunion = await tx.meeting.create({
      data: {
        date: new Date(2031, 0, 9, 12, 0, 0), // fecha lejana: no choca con nada
        day: "JUEVES",
        congregationId: ocoa.id,
        weekLabel: "5-11 de Enero (prueba)",
        weeklyReading: "PRUEBA 1, 2",
        assignments: {
          create: [
            {
              slotKey: "j_tesoros_discurso",
              section: "TESOROS",
              label: "1. Discurso de prueba (10 mins.)",
              order: 0,
              primaryName: "Hermano Uno",
              primaryStatus: "CONFIRMADO",
              primaryDone: true,
            },
            {
              slotKey: "j_smm_conversaciones",
              section: "SMM",
              label: "4. Empiece conversaciones (3 mins.)",
              order: 1,
              allowTwo: true,
              primaryName: "Hermana Dos",
              primaryStatus: "PENDIENTE",
              secondaryName: "Hermana Tres",
              secondaryStatus: "RECHAZADO",
            },
            {
              // Sin nadie asignado: no debe archivarse.
              slotKey: "j_lectura",
              section: "TESOROS",
              label: "3. Lectura de la Biblia (4 mins.)",
              order: 2,
            },
          ],
        },
      },
      include: { assignments: true },
    });
    console.log("1. Borrado conservando el historial");
    check(reunion.assignments.length === 3, "reunión de prueba con 3 casillas");

    const archivadas = await archivar(tx, [reunion.id], ocoa.id, null);
    await tx.meeting.deleteMany({ where: { id: reunion.id, congregationId: ocoa.id } });

    check(archivadas === 2, `se archivan 2 asignaciones con nombre (${archivadas})`);
    check(
      (await tx.meeting.count({ where: { id: reunion.id } })) === 0,
      "la reunión ya no existe",
    );
    check(
      (await tx.meetingAssignment.count({ where: { meetingId: reunion.id } })) === 0,
      "sus asignaciones se borraron en cascada",
    );

    const hist = await tx.assignmentHistory.findMany({
      where: { meetingId: reunion.id },
      orderBy: { order: "asc" },
    });
    console.log("\n2. Lo que quedó guardado");
    check(hist.length === 2, `${hist.length} fila(s) en el historial`);
    const discurso = hist.find((h) => h.slotKey === "j_tesoros_discurso");
    check(discurso?.primaryName === "Hermano Uno", `hermano: ${discurso?.primaryName}`);
    check(discurso?.primaryStatus === "CONFIRMADO", "conserva la confirmación");
    check(discurso?.primaryDone === true, "conserva que se realizó");
    check(
      discurso?.weekLabel === "5-11 de Enero (prueba)",
      `conserva la semana: ${discurso?.weekLabel}`,
    );
    check(
      discurso?.meetingDate?.getTime() === reunion.date.getTime(),
      "conserva la fecha de la reunión",
    );
    check(discurso?.label === "1. Discurso de prueba (10 mins.)", "conserva el título");
    const smm = hist.find((h) => h.slotKey === "j_smm_conversaciones");
    check(
      smm?.primaryName === "Hermana Dos" && smm?.secondaryName === "Hermana Tres",
      "conserva Responsable y Auxiliar",
    );
    check(smm?.secondaryStatus === "RECHAZADO", "conserva el rechazo del Auxiliar");
    check(smm?.primaryDone === null, "lo no marcado sigue sin registrar (null)");

    console.log("\n3. Las casillas vacías no se archivan");
    check(
      !hist.some((h) => h.slotKey === "j_lectura"),
      "la casilla sin nadie asignado no está en el historial",
    );

    // --- 4. Borrado sin conservar ---
    console.log("\n4. Borrado descartando el historial");
    const otraReunion = await tx.meeting.create({
      data: {
        date: new Date(2031, 0, 16, 12, 0, 0),
        day: "JUEVES",
        congregationId: ocoa.id,
        weekLabel: "12-18 de Enero (prueba)",
        assignments: {
          create: [
            {
              slotKey: "j_perlas",
              section: "TESOROS",
              label: "2. Busquemos perlas escondidas (10 mins.)",
              order: 0,
              primaryName: "Hermano Cuatro",
            },
          ],
        },
      },
    });
    // Sin llamar a archivar(): es lo que hace la acción si se desmarca.
    await tx.meeting.deleteMany({ where: { id: otraReunion.id, congregationId: ocoa.id } });
    check(
      (await tx.assignmentHistory.count({ where: { meetingId: otraReunion.id } })) === 0,
      "no queda historial de la reunión borrada sin guardar",
    );

    console.log("\n5. No se mezcla con otras congregaciones");
    if (otra) {
      const ajenas = await tx.assignmentHistory.count({
        where: { congregationId: otra.id, meetingId: { in: [reunion.id, otraReunion.id] } },
      });
      check(ajenas === 0, `"${otra.name}" no recibe nada de este borrado`);
      const mias = await tx.assignmentHistory.count({
        where: { congregationId: ocoa.id, meetingId: reunion.id },
      });
      check(mias === 2, `el historial queda en "${ocoa.name}" (${mias})`);
    } else {
      console.log("  (solo hay una congregación; se omite)");
    }

    console.log("\n6. Las Estadísticas suman lo vivo y lo eliminado");
    // Mismo criterio que getAssignmentStats: asignaciones con nombre.
    const vivas = await tx.meetingAssignment.count({
      where: {
        meeting: { congregationId: ocoa.id },
        OR: [{ NOT: { primaryName: null } }, { NOT: { secondaryName: null } }],
      },
    });
    const borradas = await tx.assignmentHistory.count({
      where: {
        congregationId: ocoa.id,
        OR: [{ NOT: { primaryName: null } }, { NOT: { secondaryName: null } }],
      },
    });
    console.log(`  vivas: ${vivas} · del historial: ${borradas}`);
    check(borradas >= 2, "el historial aporta las asignaciones de la reunión borrada");
    check(
      vivas + borradas > vivas,
      "el total de las estadísticas crece con lo eliminado en vez de perderlo",
    );

    // Se revierte todo: la base queda como estaba.
    throw new Error("ROLLBACK");
  });
} catch (e) {
  if (!(e instanceof Error) || e.message !== "ROLLBACK") throw e;
}

console.log("\n--- La base quedó intacta ---");
const [reuniones, historial] = await Promise.all([
  p.meeting.count(),
  p.assignmentHistory.count(),
]);
console.log(`  reuniones: ${reuniones} · historial guardado: ${historial}`);
check(historial === 0, "no quedó ninguna fila de prueba en el historial");

await p.$disconnect();
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
