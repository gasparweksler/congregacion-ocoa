// ============================================================================
//  GET /api/plantilla-publicadores
//  Plantilla vacía para dar de alta publicadores en bloque. Se genera al vuelo
//  a partir de las mismas columnas y valores que admite el formulario, así que
//  no puede quedar desfasada respecto de la aplicación.
// ============================================================================

import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireUser } from "@/lib/access";
import { buildPublishersTemplate } from "@/lib/publishers-xlsx";

export const dynamic = "force-dynamic";

const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET() {
  await requireUser();

  const wb = new ExcelJS.Workbook();
  wb.creator = "Mi Congregación";
  buildPublishersTemplate(wb);
  const buffer = await wb.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition":
        'attachment; filename="Planilla de publicadores.xlsx"',
    },
  });
}
