// ============================================================================
//  Comprueba la puerta que decide sobre qué congregación se actúa al
//  administrar usuarios desde el panel de Plataforma.
//
//  Lo que importa: el Superadministrador puede indicar otra congregación, y
//  cualquier otro usuario queda SIEMPRE en la suya aunque envíe el dato a mano
//  (por ejemplo, manipulando el formulario).
//
//  Solo lee la base; no crea, no modifica y no borra nada.
//    npx tsx scripts/test-usuarios-plataforma.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";
import { targetCongregationId } from "../src/lib/access.js";
import type { SessionUser } from "../src/lib/access.js";

const p = new PrismaClient();
let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};

const congs = await p.congregation.findMany({
  orderBy: { createdAt: "asc" },
  select: { id: true, name: true },
});
if (congs.length < 2) {
  console.log("Hacen falta dos congregaciones para esta prueba.");
  await p.$disconnect();
  process.exit(0);
}
const [propia, ajena] = congs;
console.log(`Propia: ${propia.name} · Ajena: ${ajena.name}\n`);

const base = {
  id: "u1",
  username: "u1",
  groupId: null,
  congregationName: propia.name,
  mustChangePassword: false,
  alsoConfirmador: false,
};
const superadmin: SessionUser = {
  ...base,
  role: "SUPERADMIN",
  congregationId: propia.id,
};
const administrador: SessionUser = {
  ...base,
  role: "SECRETARIO",
  congregationId: propia.id,
};
const superintendente: SessionUser = {
  ...base,
  role: "SUPERINTENDENTE",
  congregationId: propia.id,
};

console.log("Superadministrador");
check(
  targetCongregationId(superadmin, ajena.id) === ajena.id,
  "puede administrar los usuarios de otra congregación",
);
check(
  targetCongregationId(superadmin, "") === propia.id,
  "sin indicar ninguna, queda en la suya",
);

console.log("\nAdministrador de congregación");
check(
  targetCongregationId(administrador, ajena.id) === propia.id,
  "aunque envíe otra congregación a mano, queda en la suya",
);
check(
  targetCongregationId(administrador, "") === propia.id,
  "sin indicar ninguna, queda en la suya",
);

console.log("\nSuperintendente de grupo");
check(
  targetCongregationId(superintendente, ajena.id) === propia.id,
  "aunque envíe otra congregación a mano, queda en la suya",
);

console.log("\nUsuario sin congregación (Superadmin de plataforma)");
const sinCong: SessionUser = { ...base, role: "SUPERADMIN", congregationId: null };
check(
  targetCongregationId(sinCong, ajena.id) === ajena.id,
  "con una congregación indicada, actúa sobre ella",
);
let lanzo = false;
try {
  targetCongregationId(sinCong, "");
} catch {
  lanzo = true;
}
check(lanzo, "sin indicar ninguna, falla en vez de dejar la consulta sin filtro");

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
await p.$disconnect();
process.exit(fallos === 0 ? 0 : 1);
