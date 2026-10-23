// ============================================================================
//  PDF del programa "Vida y Ministerio Cristianos", listo para imprimir.
//  Reproduce la maqueta del programa impreso: cabecera, una tabla por semana
//  con las barras de sección en color (Tesoros, Seamos Mejores Maestros,
//  Nuestra Vida Cristiana) y el nombre de cada hermano a la derecha.
//
//  Los títulos salen TAL CUAL están guardados (incluido el número de parte, la
//  duración y la cita bíblica), no se reescriben aquí.
//
//  Limitación conocida: el número de canción y la "Lectura semanal de la
//  Biblia" NO se guardan en la base de datos (la carga masiva solo toma los
//  títulos y los nombres del Excel), así que no aparecen en vez de inventarse.
// ============================================================================

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

type Assignment = {
  slotKey: string;
  section: string;
  label: string;
  order: number;
  primaryName: string | null;
  secondaryName: string | null;
};

export type ProgramMeeting = {
  date: Date;
  weekLabel: string | null;
  assignments: Assignment[];
};

// Secciones del programa, en el orden del impreso. Las responsabilidades
// (micrófono, acomodadores, sonido…) no forman parte de este programa.
const ORDEN = [
  "PRESIDENCIA",
  "ORACION_INICIO",
  "TESOROS",
  "SMM",
  "VC",
  "ORACION_FINAL",
] as const;

// Barras de color de las tres secciones principales, como en el impreso.
const BARRA: Record<string, { titulo: string; color: [number, number, number] }> = {
  TESOROS: { titulo: "TESOROS DE LA BIBLIA", color: [49, 121, 145] },
  SMM: { titulo: "SEAMOS MEJORES MAESTROS", color: [176, 141, 42] },
  VC: { titulo: "NUESTRA VIDA CRISTIANA", color: [180, 66, 63] },
};

type Celda = { content: string; colSpan?: number; styles?: Record<string, unknown> };
type Fila = (string | Celda)[];

/** Responsable y Auxiliar, uno debajo del otro. */
const nombres = (a: Assignment): string =>
  [a.primaryName?.trim(), a.secondaryName?.trim()].filter(Boolean).join("\n");

/** Fecha larga, por si la semana no tiene etiqueta guardada. */
function fechaLarga(d: Date): string {
  return d
    .toLocaleDateString("es-CL", { day: "numeric", month: "long" })
    .toUpperCase();
}

export function buildProgramaPdf(
  meetings: ProgramMeeting[],
  periodo: string,
): ArrayBuffer {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 36;

  // --- Cabecera ---
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(110, 120, 130);
  doc.text("PROGRAMA", pageW / 2, 50, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(20, 40, 75);
  doc.text("VIDA Y MINISTERIO CRISTIANOS", pageW / 2, 76, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(80, 90, 100);
  doc.text(periodo, pageW / 2, 97, { align: "center" });
  doc.setDrawColor(40, 60, 90);
  doc.setLineWidth(1.2);
  doc.rect(marginX, 30, pageW - marginX * 2, 82);

  let y = 128;

  for (const m of meetings) {
    const body: Fila[] = [];

    body.push([
      {
        content: (m.weekLabel ?? fechaLarga(m.date)).toUpperCase(),
        colSpan: 2,
        styles: {
          fontStyle: "bold",
          fillColor: [232, 237, 243],
          fontSize: 10,
          halign: "center",
        },
      },
    ]);

    for (const sec of ORDEN) {
      const partes = m.assignments
        .filter((a) => a.section === sec)
        .sort((a, b) => a.order - b.order);
      if (partes.length === 0) continue;

      const barra = BARRA[sec];
      if (barra) {
        body.push([
          {
            content: barra.titulo,
            colSpan: 2,
            styles: {
              fillColor: barra.color,
              textColor: [255, 255, 255],
              fontStyle: "bold",
              halign: "center",
              fontSize: 9,
            },
          },
        ]);
      }

      for (const a of partes) {
        // Presidencia y oraciones van con viñeta, como en el impreso; las
        // partes numeradas ya traen su número en el título guardado.
        const conVinneta = !barra;
        body.push([
          { content: `${conVinneta ? "• " : ""}${a.label}` },
          nombres(a),
        ]);
      }
    }

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX, top: 40, bottom: 40 },
      body,
      theme: "grid",
      // Cada semana se imprime entera: si no cabe en lo que queda de hoja,
      // pasa completa a la siguiente (nunca se parte por la mitad).
      pageBreak: "avoid",
      rowPageBreak: "avoid",
      styles: {
        fontSize: 8.5,
        cellPadding: 3.5,
        valign: "middle",
        lineColor: [150, 160, 170],
        lineWidth: 0.4,
        textColor: [25, 35, 50],
        overflow: "linebreak",
      },
      columnStyles: {
        0: { cellWidth: (pageW - marginX * 2) * 0.66 },
        1: { halign: "center", fontStyle: "bold" },
      },
    });
    y =
      (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
        .finalY + 14;
  }

  if (meetings.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(120, 120, 120);
    doc.text(
      "No hay reuniones registradas en el período seleccionado.",
      pageW / 2,
      y + 20,
      { align: "center" },
    );
  }

  return doc.output("arraybuffer");
}
