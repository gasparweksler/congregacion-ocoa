// ============================================================================
//  Prueba de aislamiento entre congregaciones.
//  Crea una SEGUNDA congregación con datos propios dentro de una transacción
//  que al final se revierte: comprueba que las consultas acotadas a Ocoa no la
//  ven, y que las restricciones únicas ya no chocan entre congregaciones.
//  No deja ni una fila. npx tsx scripts/test-aislamiento.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
class Rollback extends Error {}
let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK " : "FALLA "} ${msg}`);
  if (!ok) fallos++;
};

const ocoa = await p.congregation.findFirstOrThrow({ where: { slug: "ocoa" } });
const antes = {
  grupos: await p.group.count({ where: { congregationId: ocoa.id } }),
  publicadores: await p.publisher.count({ where: { congregationId: ocoa.id } }),
  informes: await p.monthlyReport.count({ where: { congregationId: ocoa.id } }),
  reuniones: await p.meeting.count({ where: { congregationId: ocoa.id } }),
  usuarios: await p.user.count({ where: { congregationId: ocoa.id } }),
};
console.log("Ocoa antes:", antes, "\n");

try {
  await p.$transaction(async (tx) => {
    const otra = await tx.congregation.create({
      data: { name: "Congregación de Prueba", slug: "prueba-aislamiento" },
    });

    // Mismo nombre de grupo que Ocoa: antes era único global y habría chocado.
    const grupoOcoa = await tx.group.findFirst({
      where: { congregationId: ocoa.id },
      select: { name: true },
    });
    const nombreRepetido = grupoOcoa?.name ?? "Grupo 1";
    const grupo = await tx.group.create({
      data: { name: nombreRepetido, congregationId: otra.id },
    });
    check(true, `grupo "${nombreRepetido}" repetido en otra congregación: permitido`);

    const pub = await tx.publisher.create({
      data: {
        fullName: "Hermano De Prueba",
        status: "BAUTIZADO",
        groupId: grupo.id,
        congregationId: otra.id,
      },
    });
    await tx.monthlyReport.create({
      data: {
        publisherId: pub.id,
        congregationId: otra.id,
        year: 2026,
        month: 9,
        participated: true,
        bibleStudies: 3,
        statusAtReport: "BAUTIZADO",
      },
    });
    // Misma fecha de reunión que podría tener Ocoa.
    await tx.meeting.create({
      data: { date: new Date(2026, 8, 3, 12, 0, 0), day: "JUEVES", congregationId: otra.id },
    });
    // Mismo mes de ajuste de 15 h y mismo nombre de inscripción.
    await tx.auxPioneerSetting.create({
      data: { congregationId: otra.id, year: 2026, month: 9, allow15h: false },
    });
    const inscOcoa = await tx.auxiliaryPioneerSignup.findFirst({
      where: { congregationId: ocoa.id },
      select: { nameKey: true, year: true, month: true, name: true },
    });
    if (inscOcoa) {
      await tx.auxiliaryPioneerSignup.create({
        data: {
          congregationId: otra.id,
          name: inscOcoa.name,
          nameKey: inscOcoa.nameKey,
          hours: 30,
          year: inscOcoa.year,
          month: inscOcoa.month,
        },
      });
      check(true, `inscripción de "${inscOcoa.name}" repetida en otra congregación: permitido`);
    }

    console.log("\nConsultas acotadas a Ocoa (no deben ver lo de la otra):");
    const despues = {
      grupos: await tx.group.count({ where: { congregationId: ocoa.id } }),
      publicadores: await tx.publisher.count({ where: { congregationId: ocoa.id } }),
      informes: await tx.monthlyReport.count({ where: { congregationId: ocoa.id } }),
      reuniones: await tx.meeting.count({ where: { congregationId: ocoa.id } }),
      usuarios: await tx.user.count({ where: { congregationId: ocoa.id } }),
    };
    for (const k of Object.keys(antes) as (keyof typeof antes)[]) {
      check(despues[k] === antes[k], `${k}: ${antes[k]} → ${despues[k]}`);
    }

    console.log("\nSin acotar (así se vería una consulta con el filtro olvidado):");
    const sinFiltro = await tx.publisher.count();
    check(
      sinFiltro > antes.publicadores,
      `publicadores de TODA la plataforma: ${sinFiltro} (por eso el filtro es obligatorio)`,
    );

    // Una fila de otra congregación no se puede alcanzar con el filtro puesto.
    const ajeno = await tx.publisher.findFirst({
      where: { id: pub.id, congregationId: ocoa.id },
    });
    check(ajeno === null, "buscar un publicador ajeno por su id acotando a Ocoa: no aparece");

    throw new Rollback();
  }, { timeout: 30000, maxWait: 15000 });
} catch (e) {
  if (!(e instanceof Rollback)) throw e;
}

const final = {
  congregaciones: await p.congregation.count(),
  publicadores: await p.publisher.count(),
  informes: await p.monthlyReport.count(),
};
console.log("\nTras revertir:", final);
check(final.congregaciones === 1, "sigue habiendo una sola congregación");
check(final.publicadores === antes.publicadores, "no quedó ningún publicador de prueba");

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
await p.$disconnect();
process.exit(fallos === 0 ? 0 : 1);
