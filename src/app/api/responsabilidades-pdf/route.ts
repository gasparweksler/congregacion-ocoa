// ============================================================================
//  GET /api/responsabilidades-pdf?anio=&mes=&paleta=
//  Genera un PDF (formato propio, tipo programa impreso) con las
//  responsabilidades de todas las reuniones del mes. Optimizado para Carta/A4.
//
//  El dibujo vive en src/lib/responsabilidades-pdf.ts: así es el mismo código
//  que prueba scripts/test-resp-pdf.mts, sin copias que se queden atrás.
// ============================================================================

import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { getMonthlyResponsibilities } from "@/server/monthly-resp-actions";
import { requireMeetingsAccess, congregationId } from "@/lib/access";
import { congregationLabelOf } from "@/lib/congregation-label";
import { parsePeriod } from "@/lib/period";
import { monthName } from "@/lib/constants";
import {
  dibujarResponsabilidades,
  type FilaResponsabilidad,
} from "@/lib/responsabilidades-pdf";

export const dynamic = "force-dynamic";

// El día de cada fecha se toma de la fecha misma: el día de reunión ya no es
// fijo, lo elige cada congregación.

export async function GET(request: Request) {
  // getMonthlyResponsibilities ya exige la sesión; aquí hace falta además el
  // nombre de la congregación para la cabecera.
  const user = await requireMeetingsAccess();
  const { searchParams } = new URL(request.url);
  const { year, month } = parsePeriod(
    searchParams.get("anio") ?? undefined,
    searchParams.get("mes") ?? undefined,
  );

  const rows = await getMonthlyResponsibilities(year, month);
  const congregacion = await congregationLabelOf(congregationId(user));

  const filas: FilaResponsabilidad[] = rows.map((r) => ({
    dateISO: r.dateISO,
    audio: r.values.r_audio?.name || "",
    video: r.values.r_video?.name || "",
    // Dos "Pasa Micrófono" combinados (nombre1 / nombre2), como el impreso.
    microfono: [r.values.r_microfono?.name, r.values.r_microfono_2?.name]
      .filter((n) => n && n.trim())
      .join(" / "),
    plataforma: r.values.r_acom_plataforma?.name || "",
    entrada: r.values.r_acom_entrada?.name || "",
    auditorio: r.values.r_acom_auditorio?.name || "",
    limpieza: r.values.r_limpieza?.name || "",
  }));

  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  dibujarResponsabilidades(doc, autoTable, {
    periodo: `${monthName(month).toUpperCase()} ${year}`,
    congregacion,
    filas,
    paleta: searchParams.get("paleta"),
  });

  const buffer = doc.output("arraybuffer");
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="responsabilidades_${monthName(month)}_${year}.pdf"`,
    },
  });
}
