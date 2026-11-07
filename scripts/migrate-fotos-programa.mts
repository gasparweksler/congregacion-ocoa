// ============================================================================
//  Crea la tabla "ProgramPhoto": las fotos de la franja de arriba del
//  programa de predicación, que sube cada congregación desde la pantalla.
//
//  No toca ningún dato: la tabla nace vacía y, mientras no haya fotos, el
//  PDF sale igual que hasta ahora. Idempotente: se puede volver a ejecutar.
//  El puerto 5432 está bloqueado desde esta máquina, así que va por SQL a
//  través del pooler.
//    npx tsx scripts/migrate-fotos-programa.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

await p.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "ProgramPhoto" (
    "id" TEXT NOT NULL,
    "congregationId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProgramPhoto_pkey" PRIMARY KEY ("id")
  )
`);
console.log('  tabla "ProgramPhoto": lista');

await p.$executeRawUnsafe(`
  CREATE INDEX IF NOT EXISTS "ProgramPhoto_congregationId_order_idx"
  ON "ProgramPhoto"("congregationId", "order")
`);
console.log("  índice por congregación: listo");

const columnas = await p.$queryRawUnsafe<{ column_name: string }[]>(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'ProgramPhoto'
`);
const nombres = columnas.map((c) => c.column_name).sort();
console.log(`  columnas: ${nombres.join(", ")}`);

const faltan = [
  "id", "congregationId", "order", "data", "mime", "bytes",
  "createdAt", "updatedAt",
].filter((c) => !nombres.includes(c));
if (faltan.length > 0) throw new Error(`faltan columnas: ${faltan.join(", ")}`);

const cuantas = await p.programPhoto.count();
console.log(`\nTodo correcto: la tabla está y tiene ${cuantas} foto(s).`);

await p.$disconnect();
