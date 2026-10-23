// ============================================================================
//  Añade a Meeting los datos del programa impreso que no son asignaciones:
//  la "Lectura semanal de la Biblia" y el número de las tres canciones.
//
//  Se leen de la planilla al importar y se usan para generar el PDF. Quedan
//  NULL en todas las reuniones ya cargadas, que es la verdad: hasta ahora la
//  carga masiva no leía esos datos, así que nunca se guardaron.
//
//  Idempotente. El puerto 5432 está bloqueado desde esta máquina, así que va
//  por SQL a través del pooler.
//    npx tsx scripts/migrate-programa-canciones.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const sql = (q: string) => p.$executeRawUnsafe(q);

console.log("--- Columnas ---");
for (const col of ["weeklyReading", "songStart", "songMiddle", "songEnd"]) {
  await sql(`ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "${col}" TEXT`);
  console.log(`  ${col}: lista`);
}

console.log("\n--- Verificación ---");
const cols = await p.$queryRawUnsafe<
  { column_name: string; data_type: string; is_nullable: string }[]
>(
  `SELECT column_name, data_type, is_nullable FROM information_schema.columns
   WHERE table_name = 'Meeting'
     AND column_name IN ('weeklyReading','songStart','songMiddle','songEnd')
   ORDER BY column_name`,
);
for (const c of cols) {
  console.log(
    `  ${c.column_name.padEnd(14)} ${c.data_type.padEnd(10)} admite nulo: ${c.is_nullable}`,
  );
}
if (cols.length !== 4) {
  console.log(`\nFALTAN COLUMNAS: se esperaban 4 y hay ${cols.length}.`);
  await p.$disconnect();
  process.exit(1);
}

// Nada se modifica: las reuniones existentes conservan sus asignaciones y
// quedan con estos campos vacíos hasta que se vuelva a importar la planilla.
const total = await p.meeting.count();
const sinDatos = await p.$queryRawUnsafe<{ n: bigint }[]>(
  `SELECT COUNT(*) n FROM "Meeting" WHERE "weeklyReading" IS NULL`,
);
console.log(
  `\n  reuniones: ${total} · sin lectura semanal todavía: ${Number(sinDatos[0].n)}`,
);

await p.$disconnect();
console.log("\nListo.");
