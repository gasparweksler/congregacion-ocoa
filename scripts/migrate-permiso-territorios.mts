// ============================================================================
//  Añade la columna "alsoTerritorios" a User: el permiso
//  "Sup. de Servicio - Territorios", que da acceso a los territorios, al
//  programa de predicación y a sus estadísticas.
//
//  No toca ningún dato: los usuarios que ya existen se quedan en false, es
//  decir, como estaban. Idempotente. El puerto 5432 está bloqueado desde
//  esta máquina, así que va por SQL a través del pooler.
//    npx tsx scripts/migrate-permiso-territorios.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

const antes = await p.user.count();
console.log(`Usuarios antes: ${antes}`);

await p.$executeRawUnsafe(`
  ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "alsoTerritorios" BOOLEAN NOT NULL DEFAULT false
`);
console.log('  columna "alsoTerritorios": lista');

const filas = await p.$queryRawUnsafe<{ column_name: string }[]>(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'User' AND column_name = 'alsoTerritorios'
`);
const despues = await p.user.count();
const conPermiso = await p.user.count({ where: { alsoTerritorios: true } });

console.log(`Usuarios después: ${despues} · con el permiso: ${conPermiso}`);
if (filas.length !== 1) throw new Error("la columna no quedó creada");
if (antes !== despues) throw new Error("cambió el número de usuarios");
console.log("\nTodo correcto: la columna está y no se tocó ningún usuario.");

await p.$disconnect();
