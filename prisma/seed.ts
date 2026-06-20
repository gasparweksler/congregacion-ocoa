// ============================================================================
//  Carga inicial de datos (seed)
//  Crea el usuario Secretario inicial y, si la base está vacía, algunos datos
//  de demostración (un grupo con superintendente, auxiliar y publicadores).
//  Es idempotente: se puede ejecutar varias veces sin duplicar.
//
//  Ejecutar con:  npm run db:seed
// ============================================================================

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function hash(plain: string) {
  return bcrypt.hash(plain, 10);
}

async function main() {
  // --- 1) Secretario inicial -------------------------------------------------
  const secUser = process.env.SEED_SECRETARIO_USUARIO ?? "secretario";
  const secPass = process.env.SEED_SECRETARIO_PASSWORD ?? "Ocoa2026";
  const secName =
    process.env.SEED_SECRETARIO_NOMBRE ?? "Secretario de la Congregación";

  const secretario = await prisma.user.upsert({
    where: { username: secUser },
    update: {},
    create: {
      username: secUser,
      name: secName,
      passwordHash: await hash(secPass),
      plainPassword: secPass,
      role: "SECRETARIO",
      mustChangePassword: true, // se le pedirá cambiarla al primer ingreso
    },
  });
  console.log(`✔ Secretario listo: ${secretario.username}`);

  // --- 2) Datos de demostración (solo si no hay grupos) ----------------------
  const groupCount = await prisma.group.count();
  if (groupCount > 0) {
    console.log("ℹ Ya existen grupos; se omiten los datos de demostración.");
    return;
  }

  const grupo = await prisma.group.create({
    data: { name: "Grupo 1 (Demostración)" },
  });
  console.log(`✔ Grupo de demostración creado: ${grupo.name}`);

  await prisma.user.create({
    data: {
      username: "super1",
      name: "Superintendente de Demostración",
      passwordHash: await hash("Ocoa2026"),
      plainPassword: "Ocoa2026",
      role: "SUPERINTENDENTE",
      groupId: grupo.id,
      mustChangePassword: true,
    },
  });
  await prisma.user.create({
    data: {
      username: "aux1",
      name: "Auxiliar de Demostración",
      passwordHash: await hash("Ocoa2026"),
      plainPassword: "Ocoa2026",
      role: "AUXILIAR",
      groupId: grupo.id,
      mustChangePassword: true,
    },
  });
  console.log("✔ Superintendente (super1) y Auxiliar (aux1) creados.");

  // Publicadores de ejemplo con distintos estados.
  const demoPublishers: Array<{
    fullName: string;
    sex: "M" | "F";
    status: string;
  }> = [
    { fullName: "Juan Pérez", sex: "M", status: "BAUTIZADO" },
    { fullName: "María González", sex: "F", status: "PRECURSOR_REGULAR" },
    { fullName: "Pedro Ramírez", sex: "M", status: "NO_BAUTIZADO" },
    { fullName: "Ana Torres", sex: "F", status: "PRECURSOR_AUXILIAR" },
    { fullName: "Luis Fernández", sex: "M", status: "INACTIVO" },
  ];

  for (const p of demoPublishers) {
    const pub = await prisma.publisher.create({
      data: {
        fullName: p.fullName,
        sex: p.sex,
        status: p.status,
        groupId: grupo.id,
        statusChanges: {
          create: { status: p.status, changedById: secretario.id },
        },
      },
    });

    // Un informe de ejemplo para el mes anterior.
    const now = new Date();
    const month = now.getMonth() === 0 ? 12 : now.getMonth(); // mes anterior (1..12)
    const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const isPioneer = p.status.startsWith("PRECURSOR");

    await prisma.monthlyReport.create({
      data: {
        publisherId: pub.id,
        year,
        month,
        participated: p.status !== "INACTIVO",
        bibleStudies: p.status === "INACTIVO" ? 0 : 1,
        hours: isPioneer ? (p.status === "PRECURSOR_REGULAR" ? 50 : 30) : null,
        statusAtReport: p.status,
        submittedById: secretario.id,
      },
    });
  }
  console.log(`✔ ${demoPublishers.length} publicadores de ejemplo creados con informe.`);
  console.log("\n✅ Carga inicial completada.");
  console.log("   Secretario:    usuario 'secretario'  contraseña 'Ocoa2026'");
  console.log("   Superintendente: usuario 'super1'    contraseña 'Ocoa2026'");
  console.log("   Auxiliar:        usuario 'aux1'       contraseña 'Ocoa2026'");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
