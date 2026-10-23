// ============================================================================
//  GET /api/plantilla-vymc
//  Entrega la planilla en blanco del programa "Vida y Ministerio" para que el
//  administrador la complete y la suba después en la carga masiva.
//
//  Se sirve el archivo TAL CUAL (src/assets/plantilla-vymc.xlsx): no se genera
//  ni se reconstruye nada, para que conserve exactamente los encabezados,
//  columnas, hojas y formatos del original.
// ============================================================================

import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireMeetingsAccess } from "@/lib/access";
import { logAudit } from "@/lib/audit";

// Lee del disco: necesita el runtime de Node.js (no Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireMeetingsAccess();

  const file = path.join(process.cwd(), "src/assets/plantilla-vymc.xlsx");
  const bytes = await readFile(file);

  await logAudit({
    userId: user.id,
    action: "EXPORTAR",
    entity: "Reunion",
    details: "Descarga de la planilla en blanco de Vida y Ministerio.",
  });

  return new NextResponse(bytes, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="VyMC Modelo.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
