// ============================================================================
//  Crea la tabla ResponsibilityVolunteer: los hermanos disponibles para cada
//  tipo de responsabilidad (acomodadores, micrófono, plataforma, audio, vídeo).
//
//  Solo crea la tabla; no toca ningún dato existente.
//  Idempotente. El puerto 5432 está bloqueado desde esta máquina, así que va
//  por SQL a través del pooler.
//    npx tsx scripts/migrate-responsables.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const sql = (q: string) => p.$executeRawUnsafe(q);

console.log("--- Tabla ---");
await sql(`
  CREATE TABLE IF NOT EXISTS "ResponsibilityVolunteer" (
    "id"             TEXT PRIMARY KEY,
    "congregationId" TEXT NOT NULL,
    "category"       TEXT NOT NULL,
    "publisherId"    TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log("  ResponsibilityVolunteer: lista");

for (const [nombre, sentencia] of [
  [
    "congregación",
    `ALTER TABLE "ResponsibilityVolunteer"
       ADD CONSTRAINT "ResponsibilityVolunteer_congregationId_fkey"
       FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id")
       ON DELETE CASCADE ON UPDATE CASCADE`,
  ],
  [
    "publicador",
    `ALTER TABLE "ResponsibilityVolunteer"
       ADD CONSTRAINT "ResponsibilityVolunteer_publisherId_fkey"
       FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id")
       ON DELETE CASCADE ON UPDATE CASCADE`,
  ],
] as const) {
  await sql(
    `DO $$ BEGIN ${sentencia}; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  );
  console.log(`  clave foránea a ${nombre}: lista`);
}

// Un hermano una sola vez por categoría.
await sql(
  `CREATE UNIQUE INDEX IF NOT EXISTS "ResponsibilityVolunteer_congregationId_category_publisherId_key"
     ON "ResponsibilityVolunteer"("congregationId", "category", "publisherId")`,
);
await sql(
  `CREATE INDEX IF NOT EXISTS "ResponsibilityVolunteer_congregationId_idx" ON "ResponsibilityVolunteer"("congregationId")`,
);
await sql(
  `CREATE INDEX IF NOT EXISTS "ResponsibilityVolunteer_publisherId_idx" ON "ResponsibilityVolunteer"("publisherId")`,
);
console.log("  índices: listos");

console.log("\n--- Verificación ---");
const cols = await p.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(
  `SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'ResponsibilityVolunteer' ORDER BY ordinal_position`,
);
for (const c of cols) console.log(`  ${c.column_name.padEnd(15)} ${c.data_type}`);
if (cols.length !== 5) {
  console.log(`\nFALTAN COLUMNAS: se esperaban 5 y hay ${cols.length}.`);
  await p.$disconnect();
  process.exit(1);
}

const [publicadores, reuniones, voluntarios] = await Promise.all([
  p.publisher.count(),
  p.meeting.count(),
  p.responsibilityVolunteer.count(),
]);
console.log(
  `\n  publicadores: ${publicadores} · reuniones: ${reuniones} · disponibles registrados: ${voluntarios}`,
);

await p.$disconnect();
console.log("\nListo.");
