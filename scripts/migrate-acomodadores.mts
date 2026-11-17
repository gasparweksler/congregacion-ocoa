// ============================================================================
//  Añade a Congregation la columna "ushersMerged": el interruptor
//  "Un solo hermano como acomodador de entrada y de auditorio".
//
//  Nace en false en todas las congregaciones, que es lo que hacía el sistema
//  hasta ahora (dos acomodadores). Ningún nombre guardado se toca: lo que haya
//  escrito en "Acomodador de Auditorio" sigue ahí aunque se active.
//
//  Idempotente: se puede ejecutar las veces que haga falta. El puerto 5432
//  está bloqueado desde esta máquina, así que va por SQL a través del pooler.
//    npm run db:migrate-acomodadores
// ============================================================================
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

console.log("--- Columna ---");
await p.$executeRawUnsafe(
  `ALTER TABLE "Congregation" ADD COLUMN IF NOT EXISTS "ushersMerged" BOOLEAN NOT NULL DEFAULT false`,
);
console.log("  ushersMerged: lista");

console.log("\n--- Verificación ---");
const cols = await p.$queryRawUnsafe<
  { column_name: string; data_type: string; column_default: string | null }[]
>(
  `SELECT column_name, data_type, column_default FROM information_schema.columns
    WHERE table_name = 'Congregation' AND column_name = 'ushersMerged'`,
);
if (cols.length !== 1) {
  console.log("FALTA LA COLUMNA.");
  await p.$disconnect();
  process.exit(1);
}
console.log(
  `  ${cols[0].column_name} ${cols[0].data_type} · por defecto ${cols[0].column_default}`,
);

const congs = await p.congregation.findMany({
  orderBy: { name: "asc" },
  select: { name: true, ushersMerged: true },
});
for (const c of congs) {
  console.log(
    `  ${c.name.padEnd(26)} ${c.ushersMerged ? "un solo acomodador" : "dos acomodadores"}`,
  );
}

// Lo que ya estuviera escrito en las dos casillas sigue intacto.
const entrada = await p.meetingAssignment.count({
  where: { slotKey: "r_acom_entrada", NOT: { primaryName: null } },
});
const auditorio = await p.meetingAssignment.count({
  where: { slotKey: "r_acom_auditorio", NOT: { primaryName: null } },
});
console.log(
  `\n  nombres guardados · entrada: ${entrada} · auditorio: ${auditorio} (no se toca ninguno)`,
);

await p.$disconnect();
console.log("\nListo.");
