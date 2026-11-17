// ============================================================================
//  Añade a Meeting los datos de la reunión de FIN DE SEMANA que no son
//  asignación de nadie, para poder imprimir su programa:
//
//    speakerName      el orador del discurso público ("Raúl Aguilera - Cabildo")
//    talkNumber       el número del discurso ("10")
//    talkTitle        el tema ("Seamos honrados en todo")
//    hospitalityGroup el grupo que atiende ("Grupo Nro 04", "Congregación")
//
//  Son cuatro columnas de texto que admiten nulo, igual que las canciones y la
//  lectura semanal del jueves. Quedan NULL en todas las reuniones ya cargadas,
//  que es la verdad: hasta ahora no se guardaban. Nada existente se toca.
//
//  Idempotente: se puede ejecutar las veces que haga falta. El puerto 5432
//  está bloqueado desde esta máquina, así que va por SQL a través del pooler.
//    npm run db:migrate-finde
// ============================================================================
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const sql = (q: string) => p.$executeRawUnsafe(q);

const COLUMNAS = [
  "speakerName",
  "talkNumber",
  "talkTitle",
  "hospitalityGroup",
] as const;

console.log("--- Columnas ---");
for (const col of COLUMNAS) {
  await sql(`ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "${col}" TEXT`);
  console.log(`  ${col}: lista`);
}

console.log("\n--- Verificación ---");
const cols = await p.$queryRawUnsafe<
  { column_name: string; data_type: string; is_nullable: string }[]
>(
  `SELECT column_name, data_type, is_nullable FROM information_schema.columns
   WHERE table_name = 'Meeting'
     AND column_name IN ('speakerName','talkNumber','talkTitle','hospitalityGroup')
   ORDER BY column_name`,
);
for (const c of cols) {
  console.log(
    `  ${c.column_name.padEnd(18)} ${c.data_type.padEnd(10)} admite nulo: ${c.is_nullable}`,
  );
}
if (cols.length !== COLUMNAS.length) {
  console.log(`\nFALTAN COLUMNAS: se esperaban ${COLUMNAS.length} y hay ${cols.length}.`);
  await p.$disconnect();
  process.exit(1);
}

// Nada se modifica: se comprueba que las reuniones siguen todas ahí y que
// estos campos nacen vacíos, no con un valor inventado.
const total = await p.meeting.count();
const finde = await p.meeting.count({ where: { day: "SABADO" } });
const conDatos = await p.$queryRawUnsafe<{ n: bigint }[]>(
  `SELECT COUNT(*) n FROM "Meeting" WHERE "speakerName" IS NOT NULL`,
);
console.log(
  `\n  reuniones: ${total} (${finde} de fin de semana) · con orador ya escrito: ${Number(
    conDatos[0].n,
  )}`,
);

await p.$disconnect();
console.log("\nListo.");
