// ============================================================================
//  Asigna (o retira) el rol de Superadministrador a un usuario.
//  Por defecto solo INFORMA; con --apply escribe. Conserva la congregación del
//  usuario, así que sigue administrando la suya con normalidad.
//    npx tsx scripts/set-superadmin.mts <usuario>
//    npx tsx scripts/set-superadmin.mts <usuario> --apply
//    npx tsx scripts/set-superadmin.mts <usuario> --quitar --apply
// ============================================================================
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const username = process.argv[2];
const apply = process.argv.includes("--apply");
const quitar = process.argv.includes("--quitar");

if (!username) {
  console.error("Falta el nombre de usuario.");
  process.exit(1);
}

const user = await prisma.user.findUnique({
  where: { username },
  select: {
    id: true,
    name: true,
    username: true,
    role: true,
    congregation: { select: { name: true } },
  },
});
if (!user) {
  console.error(`No existe el usuario "${username}".`);
  await prisma.$disconnect();
  process.exit(1);
}

const nuevoRol = quitar ? "SECRETARIO" : "SUPERADMIN";
console.log(`Usuario:      ${user.username} (${user.name})`);
console.log(`Congregación: ${user.congregation?.name ?? "(ninguna)"}`);
console.log(`Rol actual:   ${user.role}`);
console.log(`Rol nuevo:    ${nuevoRol}`);

if (user.role === nuevoRol) {
  console.log("\nYa tiene ese rol: no hay nada que cambiar.");
  await prisma.$disconnect();
  process.exit(0);
}

if (!apply) {
  console.log("\n(Solo informe: NO se escribió nada. Añade --apply.)");
  await prisma.$disconnect();
  process.exit(0);
}

await prisma.user.update({ where: { id: user.id }, data: { role: nuevoRol } });
await prisma.auditLog.create({
  data: {
    userId: user.id,
    action: "EDITAR",
    entity: "Usuario",
    entityId: user.id,
    details: `Rol cambiado a ${nuevoRol} desde scripts/set-superadmin.mts.`,
  },
});
console.log("\nListo. Debe cerrar sesión y volver a entrar para que el rol surta efecto.");
await prisma.$disconnect();
