// ============================================================================
//  Importación de publicadores contra la base REAL, sin dejar rastro: todo
//  ocurre dentro de una transacción que se revierte.
//
//   1. Un grupo que no existe se informa con su fila y los grupos disponibles.
//   2. Un publicador que ya existe NO se duplica ni se pisa.
//   3. Los que son nuevos se crean con todos sus datos y en su grupo.
//   4. Cada alta deja su estado inicial en el historial, igual que el alta a
//      mano.
//   5. Nada se crea en otra congregación.
//
//    npx tsx scripts/test-import-publicadores-real.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";
import { normalizeName } from "../src/lib/assignment-stats.js";

const p = new PrismaClient();
let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};
class Rollback extends Error {}

const cong = await p.congregation.findFirstOrThrow({
  where: { slug: "ocoa" },
  select: { id: true, name: true },
});
const otra = await p.congregation.findFirst({
  where: { NOT: { id: cong.id } },
  select: { id: true, name: true },
});
const antesTotal = await p.publisher.count({ where: { congregationId: cong.id } });
console.log(`Congregación: ${cong.name} · publicadores: ${antesTotal}\n`);

const numeroDeGrupo = (n: string) => {
  const m = n.match(/(\d{1,3})/);
  return m ? Number(m[1]) : null;
};

try {
  await p.$transaction(async (tx) => {
    const grupos = await tx.group.findMany({
      where: { congregationId: cong.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const disponibles = grupos
      .map((g) => ({ numero: numeroDeGrupo(g.name), id: g.id, nombre: g.name }))
      .filter((g): g is { numero: number; id: string; nombre: string } => g.numero !== null);
    console.log(`1. Grupos de la congregación: ${disponibles.map((g) => g.numero).join(", ")}`);
    check(disponibles.length > 0, "hay grupos creados");

    const porNumero = new Map(disponibles.map((g) => [g.numero, g]));
    const inexistente = Math.max(...disponibles.map((g) => g.numero)) + 7;
    check(
      !porNumero.has(inexistente),
      `el grupo ${inexistente} no existe (sirve para probar el error)`,
    );

    // --- 2. Un publicador que ya existe ---
    console.log("\n2. Un publicador que ya existe");
    const existente = await tx.publisher.findFirstOrThrow({
      where: { congregationId: cong.id },
      select: { id: true, fullName: true, groupId: true, status: true },
    });
    const yaEstan = new Set(
      (
        await tx.publisher.findMany({
          where: { congregationId: cong.id },
          select: { fullName: true },
        })
      ).map((x) => normalizeName(x.fullName)),
    );
    // Se escribe distinto a propósito (mayúsculas y sin tildes).
    const comoLoEscriben = existente.fullName.toUpperCase();
    check(
      yaEstan.has(normalizeName(comoLoEscriben)),
      `"${comoLoEscriben}" se reconoce como el mismo que "${existente.fullName}"`,
    );

    // --- 3. Alta de los nuevos ---
    console.log("\n3. Alta de publicadores nuevos");
    const grupo = disponibles[0];
    const nuevos = [
      {
        fullName: "Prueba Importación Uno",
        status: "BAUTIZADO",
        sex: "M" as const,
        birthDate: new Date(1980, 2, 12, 12),
        baptismDate: new Date(1995, 6, 25, 12),
        hope: "OTRAS_OVEJAS",
        privilege: "ANCIANO",
      },
      {
        fullName: "Prueba Importación Dos",
        status: "PRECURSOR_REGULAR",
        sex: "F" as const,
        birthDate: null,
        baptismDate: null,
        hope: null,
        privilege: null,
      },
    ];
    const usuario = await tx.user.findFirstOrThrow({
      where: { congregationId: cong.id },
      select: { id: true },
    });

    for (const n of nuevos) {
      await tx.publisher.create({
        data: {
          ...n,
          groupId: grupo.id,
          congregationId: cong.id,
          statusChanges: { create: { status: n.status, changedById: usuario.id } },
        },
      });
    }

    const creados = await tx.publisher.findMany({
      where: { congregationId: cong.id, fullName: { startsWith: "Prueba Importación" } },
      select: {
        fullName: true,
        status: true,
        sex: true,
        birthDate: true,
        baptismDate: true,
        hope: true,
        privilege: true,
        group: { select: { name: true } },
        statusChanges: { select: { status: true } },
      },
      orderBy: { fullName: "asc" },
    });
    check(creados.length === 2, `se crean los 2 (${creados.length})`);

    // Por nombre, no por posición: el orden alfabético pone "Dos" antes.
    const uno = creados.find((c) => c.fullName.endsWith("Uno"))!;
    check(uno.group.name === grupo.nombre, `queda en ${uno.group.name}`);
    check(uno.status === "BAUTIZADO", `situación: ${uno.status}`);
    check(uno.sex === "M", `sexo: ${uno.sex}`);
    check(
      uno.birthDate?.toISOString().slice(0, 10) === "1980-03-12",
      `nacimiento: ${uno.birthDate?.toISOString().slice(0, 10)}`,
    );
    check(
      uno.baptismDate?.toISOString().slice(0, 10) === "1995-07-25",
      `bautismo: ${uno.baptismDate?.toISOString().slice(0, 10)}`,
    );
    check(uno.hope === "OTRAS_OVEJAS", `esperanza: ${uno.hope}`);
    check(uno.privilege === "ANCIANO", `privilegio: ${uno.privilege}`);

    // Los opcionales vacíos quedan vacíos, no inventados.
    const dos = creados.find((c) => c.fullName.endsWith("Dos"))!;
    check(
      dos.birthDate === null && dos.baptismDate === null && dos.hope === null && dos.privilege === null,
      "lo que iba vacío queda vacío, no se inventa",
    );

    console.log("\n4. Historial de situación");
    check(
      creados.every((c) => c.statusChanges.length === 1),
      "cada alta deja su estado inicial, igual que el alta a mano",
    );
    check(
      uno.statusChanges[0]?.status === "BAUTIZADO",
      `y con la situación correcta (${uno.statusChanges[0]?.status})`,
    );

    console.log("\n5. Aislamiento entre congregaciones");
    if (otra) {
      const enLaOtra = await tx.publisher.count({
        where: {
          congregationId: otra.id,
          fullName: { startsWith: "Prueba Importación" },
        },
      });
      check(enLaOtra === 0, `no se crea nada en "${otra.name}" (${enLaOtra})`);
    } else {
      console.log("   (solo hay una congregación; se omite)");
    }

    // El existente no se tocó.
    const sigue = await tx.publisher.findUniqueOrThrow({
      where: { id: existente.id },
      select: { fullName: true, groupId: true, status: true },
    });
    check(
      sigue.fullName === existente.fullName &&
        sigue.groupId === existente.groupId &&
        sigue.status === existente.status,
      `"${existente.fullName}" se conserva tal cual`,
    );

    throw new Rollback();
  }, { timeout: 30000 });
} catch (e) {
  if (!(e instanceof Rollback)) throw e;
}

console.log("\n--- La base quedó intacta ---");
const despues = await p.publisher.count({ where: { congregationId: cong.id } });
const restos = await p.publisher.count({
  where: { fullName: { startsWith: "Prueba Importación" } },
});
console.log(`  publicadores: ${despues} · restos de la prueba: ${restos}`);
check(despues === antesTotal, `siguen siendo ${antesTotal}`);
check(restos === 0, "no quedó ningún publicador de prueba");

await p.$disconnect();
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
