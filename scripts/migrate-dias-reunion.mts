// ============================================================================
//  Añade a Congregation los días de reunión propios de cada congregación.
//
//  Hasta ahora estaban fijos en el código: jueves (entre semana) y sábado (fin
//  de semana). Se guardan como los devuelve Date.getDay(): 0 = domingo … 6 =
//  sábado, y las congregaciones existentes arrancan con esos mismos valores,
//  así que nada cambia de comportamiento hasta que alguien los modifique.
//
//  Idempotente. El puerto 5432 está bloqueado desde esta máquina, así que va
//  por SQL a través del pooler.
//    npx tsx scripts/migrate-dias-reunion.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const sql = (q: string) => p.$executeRawUnsafe(q);

console.log("--- Columnas ---");
// NOT NULL con valor por defecto: las filas existentes quedan en jueves/sábado,
// que es exactamente lo que el sistema hacía antes.
await sql(
  `ALTER TABLE "Congregation" ADD COLUMN IF NOT EXISTS "midweekDay" INTEGER NOT NULL DEFAULT 4`,
);
await sql(
  `ALTER TABLE "Congregation" ADD COLUMN IF NOT EXISTS "weekendDay" INTEGER NOT NULL DEFAULT 6`,
);
console.log("  midweekDay y weekendDay: listas");

console.log("\n--- Verificación ---");
const cols = await p.$queryRawUnsafe<
  { column_name: string; data_type: string; is_nullable: string; column_default: string }[]
>(
  `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
    WHERE table_name = 'Congregation'
      AND column_name IN ('midweekDay','weekendDay')
    ORDER BY column_name`,
);
for (const c of cols) {
  console.log(
    `  ${c.column_name.padEnd(11)} ${c.data_type.padEnd(8)} nulo: ${c.is_nullable} · por defecto: ${c.column_default}`,
  );
}
if (cols.length !== 2) {
  console.log(`\nFALTAN COLUMNAS: se esperaban 2 y hay ${cols.length}.`);
  await p.$disconnect();
  process.exit(1);
}

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const congs = await p.$queryRawUnsafe<
  { name: string; midweekDay: number; weekendDay: number }[]
>(`SELECT name, "midweekDay", "weekendDay" FROM "Congregation" ORDER BY name`);
console.log("");
for (const c of congs) {
  console.log(
    `  ${c.name.padEnd(26)} entre semana: ${DIAS[c.midweekDay]} · fin de semana: ${DIAS[c.weekendDay]}`,
  );
}

await p.$disconnect();
console.log("\nListo.");
