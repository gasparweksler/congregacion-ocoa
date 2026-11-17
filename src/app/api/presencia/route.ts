// ============================================================================
//  Señal de vida ("latido") de una pestaña abierta.
//
//  La manda el componente <Presencia/> cada poco rato mientras alguien tiene
//  la aplicación abierta y a la vista. Así el panel de Plataforma puede
//  distinguir entre "tiene la sesión iniciada" (que dura días) y "está
//  conectado ahora mismo".
//
//  - POST /api/presencia          -> estoy aquí
//  - POST /api/presencia?adios=1  -> me voy (cerrar sesión o cerrar la pestaña)
//
//  Solo escribe en la fila del usuario de la sesión: nadie puede marcar a
//  otro, ni de su congregación ni de ninguna otra. Se usa SQL directo a
//  propósito, para no tocar `updatedAt` con cada latido.
// ============================================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/access";

// Nunca cachear: cada llamada tiene que llegar a la base de datos.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getSessionUser();
  // Sin sesión no hay nada que marcar. 204 igualmente, para que una pestaña
  // vieja con la sesión caducada no llene la consola de errores.
  if (!user) return new NextResponse(null, { status: 204 });

  const adios = new URL(request.url).searchParams.get("adios") === "1";

  try {
    if (adios) {
      // Deja de estar conectado al instante. El último acceso se conserva.
      await prisma.$executeRaw`UPDATE "User" SET "lastSeenAt" = NULL WHERE "id" = ${user.id}`;
    } else {
      // La hora va como parámetro (no con el NOW() de Postgres) para que se
      // guarde en el mismo formato con el que Prisma lee las fechas, sin
      // depender de la zona horaria que tenga configurada la base.
      const ahora = new Date();
      await prisma.$executeRaw`UPDATE "User" SET "lastSeenAt" = ${ahora}, "lastActiveAt" = ${ahora} WHERE "id" = ${user.id}`;
    }
  } catch (error) {
    // Un latido perdido no es grave: el siguiente llega en segundos. Lo que no
    // puede es romperle la página a nadie.
    console.error("presencia: no se pudo guardar el latido", error);
    return new NextResponse(null, { status: 204 });
  }

  return new NextResponse(null, { status: 204 });
}
