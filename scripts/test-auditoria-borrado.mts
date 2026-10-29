// ============================================================================
//  Eliminar auditoría: que borre lo suyo, lo acotado a su congregación, y
//  NADA más.
//
//  Todo ocurre en una congregación de prueba que se crea y se borra aquí
//  mismo; los datos reales no se tocan y se comprueba al final.
//
//    npx tsx scripts/test-auditoria-borrado.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const PREFIJO = "ZZ Auditoria";
let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};
const titulo = (t: string) => console.log(`\n${t}`);

async function limpiar() {
  const congs = await p.congregation.findMany({
    where: { name: { startsWith: PREFIJO } },
    select: { id: true },
  });
  const ids = congs.map((c) => c.id);
  await p.user.deleteMany({ where: { username: { startsWith: "zz-aud-" } } });
  if (ids.length) {
    await p.auditLog.deleteMany({ where: { congregationId: { in: ids } } });
    await p.user.deleteMany({ where: { congregationId: { in: ids } } });
    await p.congregation.deleteMany({ where: { id: { in: ids } } });
  }
}

/** Lo mismo que hace deleteAuditLogsAction, con la congregación ya resuelta. */
async function borrarAuditoria(cong: string, meses: number) {
  if (isNaN(meses) || meses < 0 || meses > 120) return 0;
  const corte = new Date();
  corte.setMonth(corte.getMonth() - meses);
  const { count } = await p.auditLog.deleteMany({
    where: {
      congregationId: cong,
      ...(meses > 0 ? { createdAt: { lt: corte } } : {}),
    },
  });
  return count;
}

const haceMeses = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
};

console.log("ELIMINAR AUDITORÍA\n");

await limpiar();
const realesAntes = await p.auditLog.count({
  where: { congregation: { name: { not: { startsWith: PREFIJO } } } },
});
console.log(`  líneas reales antes: ${realesAntes}`);

try {
  // Dos congregaciones, para comprobar que no se pisan.
  const hechas = [];
  for (const etiqueta of ["A", "B"]) {
    const c = await p.congregation.create({
      data: { name: `${PREFIJO} ${etiqueta}`, slug: `zz-aud-${etiqueta.toLowerCase()}` },
    });
    const u = await p.user.create({
      data: {
        username: `zz-aud-${etiqueta.toLowerCase()}`,
        passwordHash: "x".repeat(60),
        name: "Prueba",
        role: "SECRETARIO",
        congregationId: c.id,
      },
    });
    // Líneas de varias edades: 1, 8, 18 y 36 meses.
    for (const meses of [1, 8, 18, 36]) {
      for (let i = 0; i < 3; i++) {
        await p.auditLog.create({
          data: {
            congregationId: c.id,
            userId: u.id,
            action: "EDITAR",
            entity: "Prueba",
            details: `${etiqueta} hace ${meses} meses`,
            createdAt: haceMeses(meses),
          },
        });
      }
    }
    hechas.push({ etiqueta, id: c.id });
  }
  const [a, b] = hechas;
  const cuantas = (id: string) => p.auditLog.count({ where: { congregationId: id } });

  check((await cuantas(a.id)) === 12, "montadas 12 líneas en A (3 de cada edad)");
  check((await cuantas(b.id)) === 12, "y 12 en B");

  titulo("1. Borrar lo anterior a 2 años");
  {
    const n = await borrarAuditoria(a.id, 24);
    check(n === 3, `borró las 3 de hace 36 meses (borró ${n})`);
    check((await cuantas(a.id)) === 9, "quedan 9");
    const quedan = await p.auditLog.findMany({
      where: { congregationId: a.id },
      select: { details: true },
    });
    check(
      !quedan.some((x) => x.details?.includes("36 meses")),
      "no queda ninguna de 36 meses",
    );
    check(
      quedan.some((x) => x.details?.includes("18 meses")),
      "y sí siguen las de 18 meses (son más nuevas que el corte)",
    );
  }

  titulo("2. Borrar lo anterior a 1 año");
  {
    const n = await borrarAuditoria(a.id, 12);
    check(n === 3, `borró las 3 de hace 18 meses (borró ${n})`);
    check((await cuantas(a.id)) === 6, "quedan 6");
  }

  titulo("3. La otra congregación no se tocó");
  check((await cuantas(b.id)) === 12, `B sigue con sus 12 líneas (${await cuantas(b.id)})`);

  titulo("4. Borrar el registro entero (0 meses)");
  {
    const n = await borrarAuditoria(a.id, 0);
    check(n === 6, `borró las 6 que quedaban (borró ${n})`);
    check((await cuantas(a.id)) === 0, "A se quedó sin auditoría");
    check((await cuantas(b.id)) === 12, "y B sigue intacta");
  }

  titulo("5. Valores fuera de rango no borran nada");
  {
    const antes = await cuantas(b.id);
    for (const malo of [-1, 121, NaN]) {
      await borrarAuditoria(b.id, malo);
    }
    check(
      (await cuantas(b.id)) === antes,
      `con -1, 121 o un valor inválido no se borra nada (siguen ${antes})`,
    );
  }

  titulo("6. Solo se borra la auditoría, no los datos");
  {
    const pubs = await p.publisher.count({ where: { congregationId: b.id } });
    const reus = await p.meeting.count({ where: { congregationId: b.id } });
    check(pubs === 0 && reus === 0, "la prueba no creó datos que mirar (0 y 0)");
    // La comprobación de verdad: deleteMany apunta a auditLog y a nada más.
    const sql = (await import("node:fs/promises")).readFile;
    const codigo = await sql("src/server/maintenance-actions.ts", "utf8");
    const trozo = codigo.slice(
      codigo.indexOf("deleteAuditLogsAction"),
      codigo.indexOf("Elimina todos los informes de un año"),
    );
    const borrados = [...trozo.matchAll(/prisma\.(\w+)\.delete/g)].map((m) => m[1]);
    check(
      borrados.length === 1 && borrados[0] === "auditLog",
      `la acción solo borra de auditLog (borra de: ${borrados.join(", ") || "nada"})`,
    );
    check(
      trozo.includes("congregationId: cong"),
      "y siempre acotada a la congregación de quien la pulsa",
    );
  }
} finally {
  titulo("7. Limpieza");
  await limpiar();
  const resto = await p.congregation.count({ where: { name: { startsWith: PREFIJO } } });
  check(resto === 0, "no quedó nada de prueba");
  const realesDespues = await p.auditLog.count({
    where: { congregation: { name: { not: { startsWith: PREFIJO } } } },
  });
  check(
    realesDespues === realesAntes,
    `las líneas reales siguen siendo ${realesAntes} (hay ${realesDespues})`,
  );
}

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
await p.$disconnect();
process.exit(fallos === 0 ? 0 : 1);
