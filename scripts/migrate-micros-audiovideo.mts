// ============================================================================
//  Añade a Congregation los dos ajustes de las responsabilidades mensuales:
//
//    micCount        cuántos hermanos pasan el micrófono (1 o 2). Por defecto 2,
//                    que es lo que hacía el sistema cuando estaba fijo en el
//                    código: así ninguna congregación cambia de comportamiento.
//    audioAlsoVideo  "El mismo hermano hace Audio y Video". Por defecto false,
//                    o sea, todo sigue como está hasta que alguien lo active.
//
//  Ningún dato guardado se modifica: lo que ya esté escrito en "Pasa Micrófono 2"
//  o en "Video" sigue en la base aunque la congregación deje de usar esas
//  casillas. Solo se dejan de repartir y de imprimir.
//
//  Idempotente: se puede ejecutar las veces que haga falta. El puerto 5432 está
//  bloqueado desde esta máquina, así que va por SQL a través del pooler.
//    npm run db:migrate-micros
// ============================================================================
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const sql = (q: string) => p.$executeRawUnsafe(q);

const COLUMNAS: { nombre: string; tipo: string }[] = [
  { nombre: "micCount", tipo: "INTEGER NOT NULL DEFAULT 2" },
  { nombre: "audioAlsoVideo", tipo: "BOOLEAN NOT NULL DEFAULT false" },
];

console.log("--- Columnas ---");
for (const c of COLUMNAS) {
  await sql(`ALTER TABLE "Congregation" ADD COLUMN IF NOT EXISTS "${c.nombre}" ${c.tipo}`);
  console.log(`  ${c.nombre}: lista`);
}

console.log("\n--- Verificación ---");
const cols = await p.$queryRawUnsafe<
  {
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }[]
>(
  `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
    WHERE table_name = 'Congregation'
      AND column_name IN ('micCount','audioAlsoVideo')
    ORDER BY column_name`,
);
for (const c of cols) {
  console.log(
    `  ${c.column_name.padEnd(16)} ${c.data_type.padEnd(8)} nulo: ${c.is_nullable.padEnd(3)} por defecto: ${c.column_default ?? "—"}`,
  );
}
if (cols.length !== COLUMNAS.length) {
  console.log(`\nFALTAN COLUMNAS: se esperaban ${COLUMNAS.length} y hay ${cols.length}.`);
  await p.$disconnect();
  process.exit(1);
}

// Cada congregación arranca como estaba: 2 micrófonos y Video por separado.
const congs = await p.congregation.findMany({
  select: { name: true, micCount: true, audioAlsoVideo: true },
  orderBy: { name: "asc" },
});
console.log("");
for (const c of congs) {
  console.log(
    `  ${c.name.padEnd(22)} micrófonos: ${c.micCount} · audio hace video: ${c.audioAlsoVideo ? "sí" : "no"}`,
  );
}

// Y nada de lo ya escrito se perdió.
const conMic2 = await p.meetingAssignment.count({
  where: { slotKey: "r_microfono_2", NOT: { primaryName: null } },
});
const conVideo = await p.meetingAssignment.count({
  where: { slotKey: "r_video", NOT: { primaryName: null } },
});
console.log(
  `\n  casillas con nombre guardado · Pasa Micrófono 2: ${conMic2} · Video: ${conVideo}`,
);

await p.$disconnect();
console.log("\nListo.");
