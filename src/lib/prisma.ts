// ============================================================================
//  Cliente Prisma (singleton)
//  En desarrollo, Next.js recarga los módulos en caliente; sin este patrón se
//  crearían múltiples conexiones a la base de datos. Reutilizamos una única
//  instancia guardándola en el objeto global.
// ============================================================================

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
