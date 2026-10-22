// ============================================================================
//  Fase 1 de la plataforma multi-congregación: solo BASE DE DATOS.
//  Idempotente (se puede volver a ejecutar). No cambia el comportamiento de la
//  aplicación: al terminar, todas las filas existentes pertenecen a "Ocoa".
//    npx tsx scripts/migrate-multicongregacion.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const sql = (q: string) => p.$executeRawUnsafe(q);

// Tablas con dueño propio. AuditLog y User admiten nulo: el Superadmin no
// pertenece a ninguna congregación y sus acciones pueden no tener uno.
const TENANT_TABLES = [
  "Group", "Publisher", "MonthlyReport", "Meeting",
  "AuxiliaryPioneerSignup", "AuxPioneerSetting",
] as const;
const NULLABLE_TABLES = ["User", "AuditLog"] as const;

console.log("--- 1. Tabla Congregation ---");
await sql(`
  CREATE TABLE IF NOT EXISTS "Congregation" (
    "id"        TEXT PRIMARY KEY,
    "name"      TEXT NOT NULL,
    "slug"      TEXT NOT NULL,
    "active"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
await sql(`CREATE UNIQUE INDEX IF NOT EXISTS "Congregation_slug_key" ON "Congregation"("slug")`);
await sql(`CREATE UNIQUE INDEX IF NOT EXISTS "Congregation_name_key" ON "Congregation"("name")`);

console.log("--- 2. Congregación Ocoa ---");
let ocoa = await p.$queryRawUnsafe<{ id: string }[]>(
  `SELECT id FROM "Congregation" WHERE slug = 'ocoa'`,
);
if (ocoa.length === 0) {
  await sql(`INSERT INTO "Congregation"("id","name","slug") VALUES ('ocoa_default','Ocoa','ocoa')`);
  ocoa = await p.$queryRawUnsafe(`SELECT id FROM "Congregation" WHERE slug = 'ocoa'`);
}
const ocoaId = ocoa[0].id;
console.log(`  Ocoa → ${ocoaId}`);

console.log("--- 3. Columna congregationId (aún admite nulo) ---");
for (const t of [...TENANT_TABLES, ...NULLABLE_TABLES]) {
  await sql(`ALTER TABLE "${t}" ADD COLUMN IF NOT EXISTS "congregationId" TEXT`);
  console.log(`  ${t}`);
}

console.log("--- 4. Asignar todo lo existente a Ocoa ---");
for (const t of [...TENANT_TABLES, ...NULLABLE_TABLES]) {
  const n = await sql(
    `UPDATE "${t}" SET "congregationId" = '${ocoaId}' WHERE "congregationId" IS NULL`,
  );
  console.log(`  ${t}: ${n} fila(s)`);
}

console.log("--- 5. Clave foránea e índice ---");
for (const t of [...TENANT_TABLES, ...NULLABLE_TABLES]) {
  await sql(`CREATE INDEX IF NOT EXISTS "${t}_congregationId_idx" ON "${t}"("congregationId")`);
  // onDelete: Cascade en las del inquilino; SetNull donde admite nulo.
  const onDelete = (NULLABLE_TABLES as readonly string[]).includes(t)
    ? "SET NULL"
    : "CASCADE";
  await sql(`
    DO $$ BEGIN
      ALTER TABLE "${t}" ADD CONSTRAINT "${t}_congregationId_fkey"
        FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id")
        ON DELETE ${onDelete} ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
  console.log(`  ${t} (ON DELETE ${onDelete})`);
}

console.log("--- 6. Obligatoria donde corresponde ---");
for (const t of TENANT_TABLES) {
  await sql(`ALTER TABLE "${t}" ALTER COLUMN "congregationId" SET NOT NULL`);
  console.log(`  ${t} NOT NULL`);
}

console.log("--- 7. Restricciones únicas por congregación ---");
// Group.name era único GLOBAL: dos congregaciones no podrían tener "Grupo 1".
await sql(`DROP INDEX IF EXISTS "Group_name_key"`);
await sql(`CREATE UNIQUE INDEX IF NOT EXISTS "Group_congregationId_name_key" ON "Group"("congregationId","name")`);
console.log("  Group: (congregationId, name)");

await sql(`DROP INDEX IF EXISTS "AuxPioneerSetting_year_month_key"`);
await sql(`CREATE UNIQUE INDEX IF NOT EXISTS "AuxPioneerSetting_congregationId_year_month_key" ON "AuxPioneerSetting"("congregationId","year","month")`);
console.log("  AuxPioneerSetting: (congregationId, year, month)");

await sql(`DROP INDEX IF EXISTS "AuxiliaryPioneerSignup_nameKey_year_month_key"`);
await sql(`CREATE UNIQUE INDEX IF NOT EXISTS "AuxiliaryPioneerSignup_congregationId_nameKey_year_month_key" ON "AuxiliaryPioneerSignup"("congregationId","nameKey","year","month")`);
console.log("  AuxiliaryPioneerSignup: (congregationId, nameKey, year, month)");

await sql(`DROP INDEX IF EXISTS "Meeting_date_day_key"`);
await sql(`CREATE UNIQUE INDEX IF NOT EXISTS "Meeting_congregationId_date_day_key" ON "Meeting"("congregationId","date","day")`);
console.log("  Meeting: (congregationId, date, day)");

// User.username SIGUE siendo único global: así el inicio de sesión no cambia
// (el hermano solo escribe usuario y contraseña, sin elegir congregación).

console.log("\n--- Verificación ---");
for (const t of [...TENANT_TABLES, ...NULLABLE_TABLES]) {
  const r = await p.$queryRawUnsafe<{ total: bigint; sin: bigint; ocoa: bigint }[]>(
    `SELECT COUNT(*) total,
            COUNT(*) FILTER (WHERE "congregationId" IS NULL) sin,
            COUNT(*) FILTER (WHERE "congregationId" = '${ocoaId}') ocoa
     FROM "${t}"`,
  );
  const { total, sin, ocoa: enOcoa } = r[0];
  const ok = Number(sin) === 0 && Number(enOcoa) === Number(total);
  console.log(`  ${ok ? "OK " : "!! "}${t}: ${total} fila(s), sin congregación ${sin}, en Ocoa ${enOcoa}`);
}
await p.$disconnect();
