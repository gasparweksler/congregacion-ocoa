// ============================================================================
//  GET /api/responsabilidades-pdf?anio=&mes=
//  Genera un PDF (formato propio, tipo programa impreso) con las
//  responsabilidades de todas las reuniones del mes. Optimizado para Carta/A4.
// ============================================================================

import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { getMonthlyResponsibilities } from "@/server/monthly-resp-actions";
import { requireMeetingsAccess, congregationId } from "@/lib/access";
import { congregationLabelOf } from "@/lib/congregation-label";
import { paletaDe } from "@/lib/programa-paletas";
import { parsePeriod } from "@/lib/period";
import { monthName } from "@/lib/constants";
import { weekdayNameOfISO } from "@/lib/dates";

export const dynamic = "force-dynamic";

// El día de cada fecha se toma de la fecha misma (weekdayNameOfISO): el día de
// reunión ya no es fijo, lo elige cada congregación.

// Colores suaves rotativos para los grupos de limpieza (como la referencia).
// No siguen la paleta elegida a propósito: aquí el color no decora, dice de
// qué grupo es la semana. Con cinco tonos del mismo color dejarían de
// distinguirse, sobre todo impresos en blanco y negro.
const GROUP_FILLS: [number, number, number][] = [
  [252, 224, 168], // ámbar
  [246, 178, 178], // rojo suave
  [178, 233, 200], // verde
  [178, 200, 240], // azul
  [222, 198, 240], // violeta
  [200, 224, 210], // gris verdoso
];

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
  const period = `${monthName(month).toUpperCase()} ${year}`;
  const congregacion = await congregationLabelOf(congregationId(user));
  const paleta = paletaDe(searchParams.get("paleta"));

  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 36;

  /** El nombre de la congregación bajo un título. Devuelve la y siguiente. */
  const subtitulo = (y: number): number => {
    if (!congregacion) return y;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...paleta.titulo);
    doc.text(congregacion, pageW / 2, y, { align: "center" });
    return y + 14;
  };

  const dateCol = (r: (typeof rows)[number]) =>
    `${weekdayNameOfISO(r.dateISO)} ${Number(r.dateISO.split("-")[2])}`;

  // ---- Tabla 1: Audio y Video ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...paleta.titulo);
  doc.text("ASIGNACIONES PARA LAS REUNIONES AUDIO Y VIDEO", pageW / 2, 40, {
    align: "center",
  });

  autoTable(doc, {
    startY: subtitulo(56),
    margin: { left: marginX, right: marginX },
    head: [
      [
        { content: "DIA/MES" },
        { content: "AUDIO" },
        { content: "VIDEO" },
        { content: "MICROFONO" },
        { content: "PLATAFORMA" },
      ],
      [{ content: period, colSpan: 5 }],
    ],
    body: rows.map((r) => [
      dateCol(r),
      r.values.r_audio?.name || "",
      r.values.r_video?.name || "",
      // Dos "Pasa Micrófono" combinados (nombre1 / nombre2), como el impreso.
      [r.values.r_microfono?.name, r.values.r_microfono_2?.name]
        .filter((n) => n && n.trim())
        .join(" / "),
      r.values.r_acom_plataforma?.name || "",
    ]),
    styles: {
      fontSize: 9,
      halign: "center",
      valign: "middle",
      cellPadding: 4,
      lineColor: paleta.linea,
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: paleta.cabecera,
      textColor: paleta.cabeceraTexto,
      fontStyle: "bold",
    },
    columnStyles: { 0: { fontStyle: "bold", fillColor: paleta.columnaDia } },
    didParseCell: (data) => {
      // Fila del período (segunda del head) centrada y destacada.
      if (data.section === "head" && data.row.index === 1) {
        data.cell.styles.fillColor = [255, 255, 255];
        data.cell.styles.textColor = paleta.titulo;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  // ---- Tabla 2: Acomodación y Limpieza ----
  // Fusiona limpieza igual consecutiva en una celda más grande (rowSpan).
  const groupIndex = new Map<string, number>();
  let nextColor = 0;
  const limpiezaBody: (
    | string
    | { content: string; rowSpan?: number; styles?: Record<string, unknown> }
  )[][] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const g = r.values.r_limpieza?.name || "";
    const row: (
      | string
      | { content: string; rowSpan?: number; styles?: Record<string, unknown> }
    )[] = [
      dateCol(r),
      r.values.r_acom_entrada?.name || "",
      r.values.r_acom_auditorio?.name || "",
    ];
    // ¿La fila anterior tiene el mismo grupo? -> se fusiona (no repetir celda).
    const prevG = i > 0 ? rows[i - 1].values.r_limpieza?.name || "" : null;
    if (g && g === prevG) {
      // Aumenta el rowSpan de la celda de limpieza previa.
      for (let j = limpiezaBody.length - 1; j >= 0; j--) {
        const last = limpiezaBody[j][3];
        if (last && typeof last === "object") {
          last.rowSpan = (last.rowSpan ?? 1) + 1;
          break;
        }
      }
    } else {
      let fill: [number, number, number] | undefined;
      if (g) {
        if (!groupIndex.has(g)) {
          groupIndex.set(g, nextColor % GROUP_FILLS.length);
          nextColor++;
        }
        fill = GROUP_FILLS[groupIndex.get(g)!];
      }
      row.push({
        content: g,
        rowSpan: 1,
        styles: {
          fontStyle: "bold",
          fontSize: 11,
          fillColor: fill ?? [255, 255, 255],
        },
      });
    }
    limpiezaBody.push(row);
  }

  const afterY =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 28;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...paleta.titulo);
  doc.text(
    "ASIGNACIONES PARA LAS REUNIONES ACOMODACIÓN Y LIMPIEZA",
    pageW / 2,
    afterY,
    { align: "center" },
  );

  autoTable(doc, {
    startY: subtitulo(afterY + 16),
    margin: { left: marginX, right: marginX },
    head: [
      [
        { content: "DIA/MES" },
        { content: "ACOMODADOR ENTRADA" },
        { content: "ACOMODADOR AUDITORIO" },
        { content: "LIMPIEZA POR GRUPOS" },
      ],
      [{ content: period, colSpan: 4 }],
    ],
    body: limpiezaBody,
    styles: {
      fontSize: 9,
      halign: "center",
      valign: "middle",
      cellPadding: 4,
      lineColor: paleta.linea,
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: paleta.cabecera,
      textColor: paleta.cabeceraTexto,
      fontStyle: "bold",
    },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: paleta.columnaDia, cellWidth: 90 },
      3: { cellWidth: 150 }, // Limpieza más ancha (celda grande).
    },
    didParseCell: (data) => {
      if (data.section === "head" && data.row.index === 1) {
        data.cell.styles.fillColor = [255, 255, 255];
        data.cell.styles.textColor = paleta.titulo;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  const buffer = doc.output("arraybuffer");
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="responsabilidades_${monthName(month)}_${year}.pdf"`,
    },
  });
}
