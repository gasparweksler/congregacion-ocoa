// ============================================================================
//  Crea lo que necesita el módulo de CAPITANES DE PREDICACIÓN:
//
//    CaptainTimeSlot     los horarios que configura cada congregación
//    CaptainSurvey       la encuesta de un mes (con su enlace)
//    CaptainResponse     lo que contesta cada hermano
//    CaptainResponseDay  cada día que puede, con sus horarios y modalidad
//    User.alsoCapitan    la casilla "Capitán" de cada usuario
//
//  Solo crea tablas y una columna nueva; no toca ningún dato existente.
//  Idempotente: se puede volver a ejecutar sin miedo. El puerto 5432 está
//  bloqueado desde esta máquina, así que va por SQL a través del pooler.
//
//      npm run db:migrate-capitanes
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

console.log("--- Columna nueva en Usuarios ---");
await sql(
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "alsoCapitan" BOOLEAN NOT NULL DEFAULT false`,
);
console.log("  User.alsoCapitan: lista");

console.log("\n--- Tablas ---");

await sql(`
  CREATE TABLE IF NOT EXISTS "CaptainTimeSlot" (
    "id"             TEXT PRIMARY KEY,
    "congregationId" TEXT NOT NULL,
    "label"          TEXT NOT NULL,
    "order"          INTEGER NOT NULL DEFAULT 0,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log("  CaptainTimeSlot: lista");

await sql(`
  CREATE TABLE IF NOT EXISTS "CaptainSurvey" (
    "id"             TEXT PRIMARY KEY,
    "congregationId" TEXT NOT NULL,
    "year"           INTEGER NOT NULL,
    "month"          INTEGER NOT NULL,
    "token"          TEXT NOT NULL,
    "open"           BOOLEAN NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log("  CaptainSurvey: lista");

await sql(`
  CREATE TABLE IF NOT EXISTS "CaptainResponse" (
    "id"             TEXT PRIMARY KEY,
    "surveyId"       TEXT NOT NULL,
    "congregationId" TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "nameKey"        TEXT NOT NULL,
    "userId"         TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log("  CaptainResponse: lista");

await sql(`
  CREATE TABLE IF NOT EXISTS "CaptainResponseDay" (
    "id"           TEXT PRIMARY KEY,
    "responseId"   TEXT NOT NULL,
    "date"         TIMESTAMP(3) NOT NULL,
    "slots"        TEXT NOT NULL DEFAULT '',
    "houseToHouse" BOOLEAN NOT NULL DEFAULT true,
    "zoom"         BOOLEAN NOT NULL DEFAULT false
  )
`);
console.log("  CaptainResponseDay: lista");

console.log("\n--- Índices ---");
const indice = async (nombre: string, sentencia: string) => {
  await sql(sentencia);
  console.log(`  ${nombre}: listo`);
};

// Sin horarios repetidos en una misma congregación.
await indice(
  "único (congregación, horario)",
  `CREATE UNIQUE INDEX IF NOT EXISTS "CaptainTimeSlot_congregationId_label_key"
     ON "CaptainTimeSlot" ("congregationId", "label")`,
);
await indice(
  "horarios por congregación",
  `CREATE INDEX IF NOT EXISTS "CaptainTimeSlot_congregationId_idx"
     ON "CaptainTimeSlot" ("congregationId")`,
);
// Una sola encuesta por congregación y mes, y un enlace irrepetible.
await indice(
  "único (congregación, año, mes)",
  `CREATE UNIQUE INDEX IF NOT EXISTS "CaptainSurvey_congregationId_year_month_key"
     ON "CaptainSurvey" ("congregationId", "year", "month")`,
);
await indice(
  "único (enlace)",
  `CREATE UNIQUE INDEX IF NOT EXISTS "CaptainSurvey_token_key"
     ON "CaptainSurvey" ("token")`,
);
await indice(
  "encuestas por congregación",
  `CREATE INDEX IF NOT EXISTS "CaptainSurvey_congregationId_idx"
     ON "CaptainSurvey" ("congregationId")`,
);
// Una respuesta por hermano y encuesta: responder otra vez corrige la suya.
await indice(
  "único (encuesta, hermano)",
  `CREATE UNIQUE INDEX IF NOT EXISTS "CaptainResponse_surveyId_nameKey_key"
     ON "CaptainResponse" ("surveyId", "nameKey")`,
);
await indice(
  "respuestas por congregación",
  `CREATE INDEX IF NOT EXISTS "CaptainResponse_congregationId_idx"
     ON "CaptainResponse" ("congregationId")`,
);
await indice(
  "respuestas por encuesta",
  `CREATE INDEX IF NOT EXISTS "CaptainResponse_surveyId_idx"
     ON "CaptainResponse" ("surveyId")`,
);
// Un día no puede estar dos veces en la misma respuesta.
await indice(
  "único (respuesta, día)",
  `CREATE UNIQUE INDEX IF NOT EXISTS "CaptainResponseDay_responseId_date_key"
     ON "CaptainResponseDay" ("responseId", "date")`,
);
await indice(
  "días por respuesta",
  `CREATE INDEX IF NOT EXISTS "CaptainResponseDay_responseId_idx"
     ON "CaptainResponseDay" ("responseId")`,
);

console.log("\n--- Claves foráneas ---");
await fk(
  "CaptainTimeSlot -> Congregation",
  `ALTER TABLE "CaptainTimeSlot" ADD CONSTRAINT "CaptainTimeSlot_congregationId_fkey"
     FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id")
     ON DELETE CASCADE ON UPDATE CASCADE`,
);
await fk(
  "CaptainSurvey -> Congregation",
  `ALTER TABLE "CaptainSurvey" ADD CONSTRAINT "CaptainSurvey_congregationId_fkey"
     FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id")
     ON DELETE CASCADE ON UPDATE CASCADE`,
);
await fk(
  "CaptainResponse -> CaptainSurvey",
  `ALTER TABLE "CaptainResponse" ADD CONSTRAINT "CaptainResponse_surveyId_fkey"
     FOREIGN KEY ("surveyId") REFERENCES "CaptainSurvey"("id")
     ON DELETE CASCADE ON UPDATE CASCADE`,
);
await fk(
  "CaptainResponse -> Congregation",
  `ALTER TABLE "CaptainResponse" ADD CONSTRAINT "CaptainResponse_congregationId_fkey"
     FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id")
     ON DELETE CASCADE ON UPDATE CASCADE`,
);
await fk(
  "CaptainResponse -> User",
  `ALTER TABLE "CaptainResponse" ADD CONSTRAINT "CaptainResponse_userId_fkey"
     FOREIGN KEY ("userId") REFERENCES "User"("id")
     ON DELETE SET NULL ON UPDATE CASCADE`,
);
await fk(
  "CaptainResponseDay -> CaptainResponse",
  `ALTER TABLE "CaptainResponseDay" ADD CONSTRAINT "CaptainResponseDay_responseId_fkey"
     FOREIGN KEY ("responseId") REFERENCES "CaptainResponse"("id")
     ON DELETE CASCADE ON UPDATE CASCADE`,
);

console.log("\n--- Comprobación ---");
for (const tabla of [
  "CaptainTimeSlot",
  "CaptainSurvey",
  "CaptainResponse",
  "CaptainResponseDay",
]) {
  const columnas = await p.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = '${tabla}' ORDER BY ordinal_position`,
  );
  console.log(`  ${tabla}: ${columnas.map((c) => c.column_name).join(", ")}`);
  if (columnas.length === 0) {
    console.log(`\nLA TABLA ${tabla} NO SE CREÓ`);
    await p.$disconnect();
    process.exit(1);
  }
}

const capitanes = await p.$queryRawUnsafe<{ n: bigint }[]>(
  `SELECT COUNT(*)::bigint AS n FROM "User" WHERE "alsoCapitan" = true`,
);
console.log(`  usuarios con la casilla Capitán: ${capitanes[0].n}`);
console.log(`  horarios configurados: ${await p.captainTimeSlot.count()}`);
console.log(`  encuestas: ${await p.captainSurvey.count()}`);
console.log(`  respuestas: ${await p.captainResponse.count()}`);

await p.$disconnect();
console.log("\nListo.");
