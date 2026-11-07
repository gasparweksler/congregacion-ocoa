// ============================================================================
//  Añade la columna "groups" a ServiceOuting: qué grupos salen a predicar en
//  cada salida, por nombre y separados por "|" ("Grupo 1|Grupo 2"). Vacío
//  significa toda la congregación, que es como estaban todas hasta ahora.
//
//  No toca ningún dato: las salidas que ya existen se quedan con "" y siguen
//  siendo de toda la congregación. Idempotente: se puede volver a ejecutar.
//  El puerto 5432 está bloqueado desde esta máquina, así que va por SQL a
//  través del pooler.
//    npx tsx scripts/migrate-salidas-grupos.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

const antes = await p.serviceOuting.count();
console.log(`Salidas guardadas antes: ${antes}`);

await p.$executeRawUnsafe(`
  ALTER TABLE "ServiceOuting"
  ADD COLUMN IF NOT EXISTS "groups" TEXT NOT NULL DEFAULT ''
`);
console.log('  columna "groups": lista');

const filas = await p.$queryRawUnsafe<{ column_name: string }[]>(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'ServiceOuting' AND column_name = 'groups'
`);
const despues = await p.serviceOuting.count();

console.log(`Salidas guardadas después: ${despues}`);
if (filas.length !== 1) throw new Error("la columna no quedó creada");
if (antes !== despues) throw new Error("cambió el número de salidas");
console.log("\nTodo correcto: la columna está y no se tocó ninguna salida.");

await p.$disconnect();
