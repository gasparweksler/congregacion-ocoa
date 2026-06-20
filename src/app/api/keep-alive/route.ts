// ============================================================================
//  Keep-alive (mantener despierta la base de datos)
//  Vercel Cron llama a esta ruta una vez al día. Hace una consulta mínima a la
//  base de datos de Supabase para que cuente como "actividad" y no se pause por
//  inactividad (el plan gratuito de Supabase pausa tras ~7 días sin uso).
// ============================================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Nunca cachear: debe ejecutarse de verdad cada vez.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Si se define CRON_SECRET en Vercel, se exige (Vercel lo envía como header).
  // Si no está definido, la ruta funciona igual (la consulta es inofensiva).
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new NextResponse("No autorizado", { status: 401 });
    }
  }

  try {
    // Consulta trivial que mantiene viva la conexión con Supabase.
    const usuarios = await prisma.user.count();
    return NextResponse.json({
      ok: true,
      usuarios,
      ts: new Date().toISOString(),
    });
  } catch (error) {
    console.error("keep-alive falló:", error);
    return NextResponse.json(
      { ok: false, error: "No se pudo contactar la base de datos." },
      { status: 500 },
    );
  }
}
