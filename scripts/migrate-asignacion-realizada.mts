// ============================================================================
//  Añade a MeetingAssignment el registro de si la asignación se REALIZÓ.
//
//  Tres estados por hermano, no dos: true (sí), false (no) y NULL (sin
//  registrar). NULL es el valor de todo el historial existente, porque es la
//  verdad: hasta ahora el sistema solo guardaba la confirmación previa, no el
//  cumplimiento. Así ninguna estadística da por realizado algo que nadie marcó.
//
//  Idempotente. El puerto 5432 está bloqueado desde esta máquina, así que va
//  por SQL a través del pooler.
//    npx tsx scripts/migrate-asignacion-realizada.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const sql = (q: string) => p.$executeRawUnsafe(q);

console.log("--- Columnas ---");
await sql(`ALTER TABLE "MeetingAssignment" ADD COLUMN IF NOT EXISTS "primaryDone" BOOLEAN`);
await sql(`ALTER TABLE "MeetingAssignment" ADD COLUMN IF NOT EXISTS "secondaryDone" BOOLEAN`);
// Momento en que se marcó, para poder auditar y ordenar.
await sql(`ALTER TABLE "MeetingAssignment" ADD COLUMN IF NOT EXISTS "doneMarkedAt" TIMESTAMP(3)`);

console.log("--- Verificación ---");
const cols = await p.$queryRawUnsafe<
  { column_name: string; data_type: string; is_nullable: string }[]
>(
  `SELECT column_name, data_type, is_nullable FROM information_schema.columns
   WHERE table_name = 'MeetingAssignment'
     AND column_name IN ('primaryDone','secondaryDone','doneMarkedAt')
   ORDER BY column_name`,
);
for (const c of cols) {
  console.log(`  ${c.column_name.padEnd(14)} ${c.data_type.padEnd(28)} admite nulo: ${c.is_nullable}`);
}

const total = await p.meetingAssignment.count();
const sinRegistrar = await p.$queryRawUnsafe<{ n: bigint }[]>(
  `SELECT COUNT(*) n FROM "MeetingAssignment" WHERE "primaryDone" IS NULL`,
);
console.log(`\nAsignaciones: ${total} · sin registrar: ${sinRegistrar[0].n}`);
console.log(
  Number(sinRegistrar[0].n) === total
    ? "OK: el historial existente quedó como 'sin registrar', sin inventar nada."
    : "!! Alguna fila ya traía valor; revisar.",
);
await p.$disconnect();
