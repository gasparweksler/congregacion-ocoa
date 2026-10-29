// ============================================================================
//  Carreras al dar de alta: "mirar si existe" y después "crear".
//
//  Varias acciones comprueban primero si el nombre está libre y crean después.
//  Entre esas dos consultas hay ~300 ms de hueco. Si dos personas crean lo
//  mismo a la vez, las dos ven "libre" y la segunda choca contra la base.
//
//  sinDuplicar() traduce ese choque en el mismo aviso amable. Aquí se
//  comprueba que así sea, y que la base nunca acabe con dos filas iguales.
//
//    npx tsx scripts/test-carreras-alta.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";
import { sinDuplicar } from "../src/server/actions-shared.js";

const p = new PrismaClient();
const PREFIJO = "ZZ Carrera";
let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};

async function limpiar() {
  const congs = await p.congregation.findMany({
    where: { name: { startsWith: PREFIJO } },
    select: { id: true },
  });
  const ids = congs.map((c) => c.id);
  await p.user.deleteMany({ where: { username: { startsWith: "zz-carrera" } } });
  if (ids.length) {
    await p.auditLog.deleteMany({ where: { congregationId: { in: ids } } });
    await p.user.deleteMany({ where: { congregationId: { in: ids } } });
    await p.congregation.deleteMany({ where: { id: { in: ids } } });
  }
}

/** Reproduce el orden real: findUnique → (hueco) → create. */
async function altaUsuarioComoLaApp(
  username: string,
  congId: string,
  huecoMs: number,
): Promise<"creado" | "avisado" | { roto: string }> {
  const exists = await p.user.findUnique({ where: { username } });
  if (exists) return "avisado"; // el aviso amable de la acción
  await new Promise((r) => setTimeout(r, huecoMs));
  // Igual que createUserAction: el choque se traduce en el mismo aviso.
  const alta = await sinDuplicar(
    () =>
      p.user.create({
        data: {
          username,
          passwordHash: "x".repeat(60),
          name: "Prueba",
          role: "SECRETARIO",
          congregationId: congId,
        },
      }),
    "Ese nombre de usuario ya está en uso.",
  );
  return alta.ok ? "creado" : "avisado";
}

async function altaGrupoComoLaApp(
  name: string,
  congId: string,
  huecoMs: number,
): Promise<"creado" | "avisado" | { roto: string }> {
  const exists = await p.group.findUnique({
    where: { congregationId_name: { congregationId: congId, name } },
  });
  if (exists) return "avisado";
  await new Promise((r) => setTimeout(r, huecoMs));
  // Igual que createGroupAction.
  const alta = await sinDuplicar(
    () => p.group.create({ data: { name, congregationId: congId } }),
    "Ya existe un grupo con ese nombre.",
  );
  return alta.ok ? "creado" : "avisado";
}

console.log("CARRERAS AL DAR DE ALTA\n");
await limpiar();

try {
  const congA = await p.congregation.create({
    data: { name: `${PREFIJO} A`, slug: "zz-carrera-a" },
  });
  const congB = await p.congregation.create({
    data: { name: `${PREFIJO} B`, slug: "zz-carrera-b" },
  });

  // --- 1. Dos congregaciones distintas, el mismo nombre de usuario ---
  console.log("1. Dos congregaciones crean el usuario 'secretario' a la vez");
  const r1 = await Promise.all([
    altaUsuarioComoLaApp("zz-carrera-secretario", congA.id, 300),
    altaUsuarioComoLaApp("zz-carrera-secretario", congB.id, 300),
  ]);
  console.log(`  resultados: ${r1.map((r) => (typeof r === "string" ? r : "ROTO " + r.roto)).join(" | ")}`);
  const rotos1 = r1.filter((r) => typeof r !== "string");
  check(
    rotos1.length === 0,
    rotos1.length === 0
      ? "la segunda recibió un aviso amable"
      : `la segunda se rompió con un error sin atrapar (${(rotos1[0] as { roto: string }).roto})`,
  );
  const cuantos1 = await p.user.count({
    where: { username: "zz-carrera-secretario" },
  });
  check(cuantos1 === 1, `quedó UN solo usuario con ese nombre (hay ${cuantos1})`);

  // --- 2. La misma congregación, el mismo grupo ---
  console.log("\n2. Dos personas crean 'Grupo 1' en la misma congregación a la vez");
  const r2 = await Promise.all([
    altaGrupoComoLaApp("Grupo 1", congA.id, 300),
    altaGrupoComoLaApp("Grupo 1", congA.id, 300),
  ]);
  console.log(`  resultados: ${r2.map((r) => (typeof r === "string" ? r : "ROTO " + r.roto)).join(" | ")}`);
  const rotos2 = r2.filter((r) => typeof r !== "string");
  check(
    rotos2.length === 0,
    rotos2.length === 0
      ? "la segunda recibió un aviso amable"
      : `la segunda se rompió con un error sin atrapar (${(rotos2[0] as { roto: string }).roto})`,
  );
  const cuantos2 = await p.group.count({
    where: { congregationId: congA.id, name: "Grupo 1" },
  });
  check(cuantos2 === 1, `quedó UN solo grupo con ese nombre (hay ${cuantos2})`);

  // --- 3. Lo mismo pero separado en el tiempo: así es como se usa de verdad ---
  console.log("\n3. Lo mismo, pero una después de la otra (uso normal)");
  const a = await altaGrupoComoLaApp("Grupo 2", congB.id, 0);
  const b = await altaGrupoComoLaApp("Grupo 2", congB.id, 0);
  console.log(`  resultados: ${[a, b].map((r) => (typeof r === "string" ? r : "ROTO")).join(" | ")}`);
  check(a === "creado" && b === "avisado", "la segunda recibe el aviso de siempre");
} finally {
  console.log("\n4. Limpieza");
  await limpiar();
  const resto = await p.congregation.count({
    where: { name: { startsWith: PREFIJO } },
  });
  check(resto === 0, "no quedó nada de prueba");
}

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
await p.$disconnect();
process.exit(fallos === 0 ? 0 : 1);
