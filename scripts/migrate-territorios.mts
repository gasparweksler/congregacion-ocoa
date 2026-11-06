// ============================================================================
//  Crea las tablas de TERRITORIOS (sección Superintendente de Servicio):
//
//    Territory       los territorios de la congregación (número y nombre)
//    TerritoryMap    el mapa de cada uno (la imagen, en su propia tabla)
//    TerritoryVisit  cada vez que se predicó un territorio, anotada a mano
//    ServiceOuting   las salidas del programa mensual de predicación
//    ServicePreset   capitanes y lugares de encuentro guardados
//
//  Solo crea tablas; no toca ningún dato existente. Idempotente: se puede
//  volver a ejecutar sin miedo. El puerto 5432 está bloqueado desde esta
//  máquina, así que va por SQL a través del pooler.
//    npx tsx scripts/migrate-territorios.mts
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

console.log("--- Tablas ---");

await sql(`
  CREATE TABLE IF NOT EXISTS "Territory" (
    "id"             TEXT PRIMARY KEY,
    "number"         INTEGER NOT NULL,
    "name"           TEXT NOT NULL,
    "order"          INTEGER NOT NULL,
    "congregationId" TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log("  Territory: lista");

await sql(`
  CREATE TABLE IF NOT EXISTS "TerritoryMap" (
    "territoryId"    TEXT PRIMARY KEY,
    "congregationId" TEXT NOT NULL,
    "data"           BYTEA NOT NULL,
    "mime"           TEXT NOT NULL,
    "bytes"          INTEGER NOT NULL,
    "sourcePage"     INTEGER,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log("  TerritoryMap: lista");

await sql(`
  CREATE TABLE IF NOT EXISTS "TerritoryVisit" (
    "id"             TEXT PRIMARY KEY,
    "territoryId"    TEXT NOT NULL,
    "congregationId" TEXT NOT NULL,
    "date"           TIMESTAMP(3) NOT NULL,
    "note"           TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log("  TerritoryVisit: lista");

await sql(`
  CREATE TABLE IF NOT EXISTS "ServiceOuting" (
    "id"             TEXT PRIMARY KEY,
    "congregationId" TEXT NOT NULL,
    "date"           TIMESTAMP(3) NOT NULL,
    "turno"          TEXT NOT NULL,
    "time"           TEXT NOT NULL,
    "place"          TEXT NOT NULL,
    "territoryId"    TEXT,
    "captainName"    TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log("  ServiceOuting: lista");

await sql(`
  CREATE TABLE IF NOT EXISTS "ServicePreset" (
    "id"             TEXT PRIMARY KEY,
    "congregationId" TEXT NOT NULL,
    "kind"           TEXT NOT NULL,
    "value"          TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log("  ServicePreset: lista");

console.log("\n--- Claves foráneas ---");
await fk(
  "Territory -> Congregation",
  `ALTER TABLE "Territory" ADD CONSTRAINT "Territory_congregationId_fkey"
     FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id")
     ON DELETE CASCADE ON UPDATE CASCADE`,
);
await fk(
  "TerritoryMap -> Territory",
  `ALTER TABLE "TerritoryMap" ADD CONSTRAINT "TerritoryMap_territoryId_fkey"
     FOREIGN KEY ("territoryId") REFERENCES "Territory"("id")
     ON DELETE CASCADE ON UPDATE CASCADE`,
);
await fk(
  "TerritoryVisit -> Territory",
  `ALTER TABLE "TerritoryVisit" ADD CONSTRAINT "TerritoryVisit_territoryId_fkey"
     FOREIGN KEY ("territoryId") REFERENCES "Territory"("id")
     ON DELETE CASCADE ON UPDATE CASCADE`,
);
await fk(
  "TerritoryVisit -> Congregation",
  `ALTER TABLE "TerritoryVisit" ADD CONSTRAINT "TerritoryVisit_congregationId_fkey"
     FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id")
     ON DELETE CASCADE ON UPDATE CASCADE`,
);
await fk(
  "ServiceOuting -> Congregation",
  `ALTER TABLE "ServiceOuting" ADD CONSTRAINT "ServiceOuting_congregationId_fkey"
     FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id")
     ON DELETE CASCADE ON UPDATE CASCADE`,
);
await fk(
  // Si se borra un territorio, su salida se queda sin territorio, no se borra:
  // el programa del mes sigue contando lo que se hizo.
  "ServiceOuting -> Territory",
  `ALTER TABLE "ServiceOuting" ADD CONSTRAINT "ServiceOuting_territoryId_fkey"
     FOREIGN KEY ("territoryId") REFERENCES "Territory"("id")
     ON DELETE SET NULL ON UPDATE CASCADE`,
);
await fk(
  "ServicePreset -> Congregation",
  `ALTER TABLE "ServicePreset" ADD CONSTRAINT "ServicePreset_congregationId_fkey"
     FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id")
     ON DELETE CASCADE ON UPDATE CASCADE`,
);

console.log("\n--- Índices ---");
for (const q of [
  `CREATE UNIQUE INDEX IF NOT EXISTS "Territory_congregationId_number_key" ON "Territory"("congregationId", "number")`,
  `CREATE INDEX IF NOT EXISTS "Territory_congregationId_order_idx" ON "Territory"("congregationId", "order")`,
  `CREATE INDEX IF NOT EXISTS "TerritoryMap_congregationId_idx" ON "TerritoryMap"("congregationId")`,
  `CREATE INDEX IF NOT EXISTS "TerritoryVisit_congregationId_date_idx" ON "TerritoryVisit"("congregationId", "date")`,
  `CREATE INDEX IF NOT EXISTS "TerritoryVisit_territoryId_date_idx" ON "TerritoryVisit"("territoryId", "date")`,
  `CREATE INDEX IF NOT EXISTS "ServiceOuting_congregationId_date_idx" ON "ServiceOuting"("congregationId", "date")`,
  `CREATE INDEX IF NOT EXISTS "ServiceOuting_territoryId_idx" ON "ServiceOuting"("territoryId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ServicePreset_congregationId_kind_value_key" ON "ServicePreset"("congregationId", "kind", "value")`,
  `CREATE INDEX IF NOT EXISTS "ServicePreset_congregationId_kind_idx" ON "ServicePreset"("congregationId", "kind")`,
]) {
  await sql(q);
}
console.log("  índices: listos");

console.log("\n--- Comprobación ---");
const tablas = await p.$queryRawUnsafe<{ table_name: string; n: bigint }[]>(
  `SELECT table_name, (SELECT COUNT(*) FROM information_schema.columns c
                        WHERE c.table_name = t.table_name) AS n
     FROM information_schema.tables t
    WHERE table_name IN ('Territory','TerritoryMap','TerritoryVisit','ServiceOuting','ServicePreset')
    ORDER BY table_name`,
);
for (const t of tablas) console.log(`  ${t.table_name.padEnd(15)} ${t.n} columnas`);
if (tablas.length !== 5) {
  console.log(`\nFALTAN TABLAS: se esperaban 5 y hay ${tablas.length}.`);
  await p.$disconnect();
  process.exit(1);
}

const [territorios, visitas, salidas, guardados] = await Promise.all([
  p.territory.count(),
  p.territoryVisit.count(),
  p.serviceOuting.count(),
  p.servicePreset.count(),
]);
console.log(
  `\n  territorios: ${territorios} · veces predicadas: ${visitas} · salidas: ${salidas} · guardados: ${guardados}`,
);

await p.$disconnect();
console.log("\nListo.");
