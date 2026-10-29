// ============================================================================
//  El PDF de un programa libre.
//
//  Mismo aspecto que el de las responsabilidades: título centrado, una tabla
//  por mes con su período en la cabecera, y la columna del día destacada.
//
//  jsPDF llega como argumento en vez de importarse aquí: así el editor lo
//  carga solo cuando se pulsa "Descargar" (son cientos de kilobytes) y esta
//  función se puede probar desde un script. Los tipos sí se importan, pero
//  `import type` desaparece al compilar y no arrastra la librería.
// ============================================================================

import type { jsPDF } from "jspdf";
import type autoTableFn from "jspdf-autotable";
import { tablasDelPrograma, type Fila, type Programa } from "@/lib/programa-libre";
import { paletaDe } from "@/lib/programa-paletas";

export function dibujarPrograma(
  doc: jsPDF,
  autoTable: typeof autoTableFn,
  p: Programa,
  filas: Fila[],
  /** "Congregación Ocoa": va bajo el título. */
  congregacion = "",
): void {
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 36;
  const paleta = paletaDe(p.paleta);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...paleta.titulo);
  doc.text(p.titulo.trim().toUpperCase(), pageW / 2, 42, {
    align: "center",
    maxWidth: pageW - marginX * 2,
  });

  let y = 60;
  const nombre = congregacion.trim();
  if (nombre) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...paleta.titulo);
    doc.text(nombre, pageW / 2, 60, { align: "center" });
    y = 76;
  }
  for (const tabla of tablasDelPrograma(p, filas)) {
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [
        tabla.cabecera.map((c) => ({ content: c })),
        [{ content: tabla.periodo, colSpan: tabla.cabecera.length }],
      ],
      body: tabla.cuerpo,
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
      },
      didParseCell: (data) => {
        // La fila del período (la segunda de la cabecera) va destacada.
        if (data.section === "head" && data.row.index === 1) {
          data.cell.styles.fillColor = [255, 255, 255];
          data.cell.styles.textColor = paleta.titulo;
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
    y =
      (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
        .finalY + 24;
  }
}
