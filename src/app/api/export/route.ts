// ============================================================================
//  Endpoint de exportación a Excel (solo Secretario)
//  GET /api/export?tipo=publicadores|informes|estadisticas&anio=&mes=&grupo=
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/access";
import { ROLES, monthName } from "@/lib/constants";
import { parsePeriod } from "@/lib/period";
import {
  buildPublishersWorkbook,
  buildReportsWorkbook,
  buildStatsWorkbook,
} from "@/lib/excel";
import { logAudit } from "@/lib/audit";

// ExcelJS requiere el runtime de Node.js (no Edge).
export const runtime = "nodejs";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function fileResponse(buffer: ArrayBuffer, filename: string) {
  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: NextRequest) {
  // Control de acceso: solo el Secretario puede exportar.
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (user.role !== ROLES.SECRETARIO) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const tipo = searchParams.get("tipo") ?? "publicadores";
  const grupo = searchParams.get("grupo") || undefined;
  const { year, month } = parsePeriod(
    searchParams.get("anio") ?? undefined,
    searchParams.get("mes") ?? undefined,
  );

  try {
    let buffer: ArrayBuffer;
    let filename: string;

    switch (tipo) {
      case "informes":
        buffer = (await buildReportsWorkbook(year, month, grupo)) as ArrayBuffer;
        filename = `informes_${monthName(month)}_${year}.xlsx`;
        break;
      case "estadisticas":
        buffer = (await buildStatsWorkbook(year, month)) as ArrayBuffer;
        filename = `estadisticas_${monthName(month)}_${year}.xlsx`;
        break;
      case "publicadores":
      default:
        buffer = (await buildPublishersWorkbook(grupo)) as ArrayBuffer;
        filename = `publicadores.xlsx`;
        break;
    }

    await logAudit({
      userId: user.id,
      action: "EXPORTAR",
      entity: "Exportación",
      details: `Exportó "${tipo}" (${monthName(month)} ${year}).`,
    });

    return fileResponse(buffer, filename);
  } catch (error) {
    console.error("Error al exportar:", error);
    return NextResponse.json(
      { error: "No se pudo generar el archivo." },
      { status: 500 },
    );
  }
}
