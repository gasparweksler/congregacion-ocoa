// ============================================================================
//  GET /api/historial-excel?anio=&mes=&grupo=&tipo=
//  Descarga en Excel el historial de informes del período, con los mismos
//  filtros que muestra la pantalla "Historial". Solo lectura.
//  Acceso: quien puede ver informes; los no secretarios quedan limitados a su
//  propio grupo (igual que la pantalla).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import {
  requireReportsAccess,
  isSecretary,
  scopedGroupId,
  congregationId,
} from "@/lib/access";
import { monthName } from "@/lib/constants";
import { parsePeriod } from "@/lib/period";
import { buildHistoryWorkbook } from "@/lib/excel";
import { logAudit } from "@/lib/audit";

// ExcelJS requiere el runtime de Node.js (no Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await requireReportsAccess();

  const { searchParams } = request.nextUrl;
  // "todos" (sin año/mes) es válido: la pantalla de Historial de informes
  // permite listar todos los períodos.
  const anioRaw = searchParams.get("anio");
  const mesRaw = searchParams.get("mes");
  const todos = searchParams.get("todos") === "1";
  const periodo = parsePeriod(anioRaw ?? undefined, mesRaw ?? undefined);
  const year = todos && !anioRaw ? null : periodo.year;
  const month = todos && !mesRaw ? null : periodo.month;
  const tipo = searchParams.get("tipo") || undefined;

  // Mismo alcance que la pantalla: el secretario puede filtrar por grupo (o
  // ver todos); el resto queda fijado a su grupo.
  const scope = scopedGroupId(user);
  const groupId = isSecretary(user) ? searchParams.get("grupo") || null : scope;

  const buffer = (await buildHistoryWorkbook(
    congregationId(user),
    year,
    month,
    groupId,
    tipo,
  )) as ArrayBuffer;

  const etiqueta =
    year && month
      ? `${monthName(month)} ${year}`
      : year
        ? `año ${year}`
        : "todos los períodos";
  await logAudit({
    userId: user.id,
    action: "EXPORTAR",
    entity: "Informe",
    details: `Historial exportado: ${etiqueta}${tipo ? ` (${tipo})` : ""}.`,
  });

  const filename = `historial_${etiqueta.toLowerCase().replace(/\s+/g, "_")}${
    tipo ? `_${tipo}` : ""
  }.xlsx`;
  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
