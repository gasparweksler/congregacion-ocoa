// ============================================================================
//  Crea la tabla AssignmentHistory: el historial de asignaciones de reuniones
//  ya eliminadas.
//
//  Hasta ahora, al borrar una reunión sus asignaciones se borraban en cascada y
//  desaparecían de las Estadísticas. Ahora se copian aquí antes de borrarlas,
//  en la misma transacción, si quien elimina pide conservar el historial.
//
//  Idempotente y no modifica ningún dato existente: solo crea la tabla.
//  El puerto 5432 está bloqueado desde esta máquina, así que va por SQL a
//  través del pooler.
//    npx tsx scripts/migrate-historial-asignaciones.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const sql = (q: string) => p.$executeRawUnsafe(q);

console.log("--- Tabla ---");
await sql(`
  CREATE TABLE IF NOT EXISTS "AssignmentHistory" (
    "id"              TEXT PRIMARY KEY,
    "congregationId"  TEXT NOT NULL,
    "meetingDate"     TIMESTAMP(3) NOT NULL,
    "day"             TEXT NOT NULL,
    "weekLabel"       TEXT,
    "meetingId"       TEXT,
    "slotKey"         TEXT NOT NULL,
    "section"         TEXT NOT NULL,
    "label"           TEXT NOT NULL,
    "order"           INTEGER NOT NULL DEFAULT 0,
    "primaryName"     TEXT,
    "primaryStatus"   TEXT,
    "primaryDone"     BOOLEAN,
    "secondaryName"   TEXT,
    "secondaryStatus" TEXT,
    "secondaryDone"   BOOLEAN,
    "deletedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedById"     TEXT
  )
`);
console.log("  AssignmentHistory: lista");

// Si se borra la congregación, su historial se va con ella (igual que el resto).
await sql(`
  DO $$ BEGIN
    ALTER TABLE "AssignmentHistory"
      ADD CONSTRAINT "AssignmentHistory_congregationId_fkey"
      FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$
`);
console.log("  clave foránea a Congregation: lista");

await sql(
  `CREATE INDEX IF NOT EXISTS "AssignmentHistory_congregationId_idx" ON "AssignmentHistory"("congregationId")`,
);
await sql(
  `CREATE INDEX IF NOT EXISTS "AssignmentHistory_meetingDate_idx" ON "AssignmentHistory"("meetingDate")`,
);
console.log("  índices: listos");

console.log("\n--- Verificación ---");
const cols = await p.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(
  `SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'AssignmentHistory' ORDER BY ordinal_position`,
);
console.log(`  columnas: ${cols.length}`);
for (const c of cols) console.log(`    ${c.column_name.padEnd(16)} ${c.data_type}`);
if (cols.length !== 18) {
  console.log(`\nFALTAN COLUMNAS: se esperaban 18 y hay ${cols.length}.`);
  await p.$disconnect();
  process.exit(1);
}

// Nada se toca: las reuniones y sus asignaciones siguen intactas.
const [reuniones, asignaciones, historial] = await Promise.all([
  p.meeting.count(),
  p.meetingAssignment.count(),
  p.assignmentHistory.count(),
]);
console.log(
  `\n  reuniones: ${reuniones} · asignaciones: ${asignaciones} · historial guardado: ${historial}`,
);

await p.$disconnect();
console.log("\nListo.");
