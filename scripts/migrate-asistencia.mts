// ============================================================================
//  Crea la tabla de ASISTENCIA A LAS REUNIONES (registro S-88):
//
//    MeetingAttendance  una fila por reunión y fecha: si hubo reunión, cuánta
//                       asistencia hubo y las observaciones.
//
//  Solo crea la tabla; no toca ningún dato existente. Idempotente: se puede
//  volver a ejecutar sin miedo. El puerto 5432 está bloqueado desde esta
//  máquina, así que va por SQL a través del pooler.
//
//      npm run db:migrate-asistencia
// ============================================================================
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const sql = (q: string) => p.$executeRawUnsafe(q);

/** Añade una clave foránea sin romper si ya estaba. */
async function fk(nombre: string, sentencia: string): Promise<void> {
  await sql(
    `DO $$ BEGIN ${sentencia}; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  );
  console.log(`  clave foránea ${nombre}: lista`);
}

console.log("--- Tabla ---");

await sql(`
  CREATE TABLE IF NOT EXISTS "MeetingAttendance" (
    "id"             TEXT PRIMARY KEY,
    "congregationId" TEXT NOT NULL,
    "date"           TIMESTAMP(3) NOT NULL,
    "day"            TEXT NOT NULL,
    "held"           BOOLEAN NOT NULL DEFAULT true,
    "count"          INTEGER,
    "note"           TEXT NOT NULL DEFAULT '',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log("  MeetingAttendance: lista");

console.log("\n--- Índices ---");
// Una sola fila por congregación, fecha y tipo de reunión: así dos personas
// anotando a la vez no crean dos registros del mismo día.
await sql(`
  CREATE UNIQUE INDEX IF NOT EXISTS "MeetingAttendance_congregationId_date_day_key"
    ON "MeetingAttendance" ("congregationId", "date", "day")
`);
console.log("  único (congregación, fecha, tipo): listo");
await sql(`
  CREATE INDEX IF NOT EXISTS "MeetingAttendance_congregationId_date_idx"
    ON "MeetingAttendance" ("congregationId", "date")
`);
console.log("  índice (congregación, fecha): listo");

console.log("\n--- Claves foráneas ---");
await fk(
  "MeetingAttendance -> Congregation",
  `ALTER TABLE "MeetingAttendance" ADD CONSTRAINT "MeetingAttendance_congregationId_fkey"
     FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id")
     ON DELETE CASCADE ON UPDATE CASCADE`,
);

console.log("\n--- Comprobación ---");
const columnas = await p.$queryRawUnsafe<{ column_name: string }[]>(
  `SELECT column_name FROM information_schema.columns
    WHERE table_name = 'MeetingAttendance' ORDER BY ordinal_position`,
);
console.log(`  columnas: ${columnas.map((c) => c.column_name).join(", ")}`);
const esperadas = [
  "id",
  "congregationId",
  "date",
  "day",
  "held",
  "count",
  "note",
  "createdAt",
  "updatedAt",
];
const faltan = esperadas.filter(
  (e) => !columnas.some((c) => c.column_name === e),
);
if (faltan.length > 0) {
  console.log(`\nFALTAN COLUMNAS: ${faltan.join(", ")}`);
  await p.$disconnect();
  process.exit(1);
}

const filas = await p.meetingAttendance.count();
console.log(`  filas de asistencia guardadas: ${filas}`);

await p.$disconnect();
console.log("\nListo.");
