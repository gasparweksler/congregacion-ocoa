// ============================================================================
//  Dos ajustes para la asignación automática de responsabilidades:
//   - Congregation.videoSameAsAudio: el interruptor "Repetir los de Sonido" de
//     la categoría Video.
//   - La categoría ATALAYA ya cabe en la tabla ResponsibilityVolunteer (es una
//     fila más), así que no hace falta nada nuevo para ella.
//
//  Idempotente y no toca ningún dato existente.
//    npx tsx scripts/migrate-atalaya-video.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

await p.$executeRawUnsafe(
  `ALTER TABLE "Congregation" ADD COLUMN IF NOT EXISTS "videoSameAsAudio" BOOLEAN NOT NULL DEFAULT false`,
);
console.log("--- Columna ---");
const cols = await p.$queryRawUnsafe<{ column_name: string; data_type: string; column_default: string }[]>(
  `SELECT column_name, data_type, column_default FROM information_schema.columns
    WHERE table_name = 'Congregation' AND column_name = 'videoSameAsAudio'`,
);
for (const c of cols) {
  console.log(`  ${c.column_name} ${c.data_type} por defecto: ${c.column_default}`);
}
if (cols.length !== 1) {
  console.log("FALTA LA COLUMNA.");
  await p.$disconnect();
  process.exit(1);
}

const congs = await p.congregation.findMany({
  select: { name: true, videoSameAsAudio: true },
  orderBy: { name: "asc" },
});
console.log("");
for (const c of congs) {
  console.log(`  ${c.name.padEnd(26)} repetir sonido en vídeo: ${c.videoSameAsAudio ? "sí" : "no"}`);
}

await p.$disconnect();
console.log("\nListo.");
