// ============================================================================
//  Añade a User dos columnas para saber quién está conectado:
//
//   - lastSeenAt   : la última señal de vida de una pestaña abierta con la
//                    aplicación. Se borra al cerrar sesión o al cerrar la
//                    pestaña, así que "tiene valor reciente" = está conectado.
//   - lastActiveAt : la última vez que la persona usó la plataforma. No se
//                    borra nunca, para poder decir "entró hace 3 días".
//
//  Nacen NULL en todos los usuarios, que es la verdad: hasta ahora no se
//  guardaba. Nadie aparece conectado hasta que su navegador avise. Ningún dato
//  existente se toca.
//
//  Idempotente: se puede ejecutar las veces que haga falta. El puerto 5432
//  está bloqueado desde esta máquina, así que va por SQL a través del pooler.
//    npm run db:migrate-presencia
// ============================================================================
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

console.log("--- Columnas ---");
for (const columna of ["lastSeenAt", "lastActiveAt"]) {
  await p.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "${columna}" TIMESTAMP(3)`,
  );
  console.log(`  ${columna}: lista`);
}

console.log("\n--- Verificación ---");
const cols = await p.$queryRawUnsafe<
  { column_name: string; data_type: string; is_nullable: string }[]
>(
  `SELECT column_name, data_type, is_nullable FROM information_schema.columns
    WHERE table_name = 'User' AND column_name IN ('lastSeenAt', 'lastActiveAt')
    ORDER BY column_name`,
);
if (cols.length !== 2) {
  console.log("FALTA ALGUNA COLUMNA.");
  await p.$disconnect();
  process.exit(1);
}
for (const c of cols) {
  console.log(`  ${c.column_name} ${c.data_type} · admite nulo: ${c.is_nullable}`);
}

const total = await p.user.count();
const conSenal = await p.user.count({ where: { NOT: { lastSeenAt: null } } });
const conAcceso = await p.user.count({ where: { NOT: { lastActiveAt: null } } });
console.log(
  `\n  usuarios: ${total} · con señal de vida: ${conSenal} · con último acceso: ${conAcceso}`,
);

await p.$disconnect();
console.log("\nListo.");
