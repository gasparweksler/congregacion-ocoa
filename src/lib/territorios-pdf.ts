// ============================================================================
//  El PDF del programa de predicación del mes.
//
//  Mismo aspecto que los demás programas de la aplicación: título centrado,
//  el nombre de la congregación debajo y una tabla ordenada por fecha.
//
//  Si se pide, al final van los mapas de los territorios del mes, uno por
//  página, para repartir el programa y el mapa en un solo papel.
//
//  jsPDF llega como argumento en vez de importarse aquí: así el navegador lo
//  carga solo cuando se pulsa "Descargar" (son cientos de kilobytes) y esta
//  función se puede probar desde un script.
// ============================================================================

import type { jsPDF } from "jspdf";
import type autoTableFn from "jspdf-autotable";
import { paletaDe, type PaletaId } from "@/lib/programa-paletas";
import type { FilaPrograma } from "@/lib/territorios";

/** Un mapa listo para pegar en el PDF. */
export type MapaParaPdf = {
  /** "3 - Vista Hermosa" */
  titulo: string;
  /** La imagen en base64 ("data:image/jpeg;base64,…"). */
  dataUrl: string;
  /** Tamaño real de la imagen, para no deformarla. */
  ancho: number;
  alto: number;
};

export type DatosPrograma = {
  /** "Programa de Predicación" */
  titulo: string;
  /** "Enero 2027" */
  periodo: string;
  /** "Congregación Ocoa" */
  congregacion?: string;
  filas: FilaPrograma[];
  /** Vacío o ausente: el PDF va sin mapas. */
  mapas?: MapaParaPdf[];
  paleta?: PaletaId;
};

const CABECERA = [
  "Fecha",
  "Horario",
  "Lugar de encuentro",
  "Territorio",
  "Capitán",
];

export function dibujarProgramaPredicacion(
  doc: jsPDF,
  autoTable: typeof autoTableFn,
  datos: DatosPrograma,
): void {
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 36;
  const paleta = paletaDe(datos.paleta ?? "azules");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...paleta.titulo);
  doc.text(datos.titulo.trim().toUpperCase(), pageW / 2, 42, {
    align: "center",
    maxWidth: pageW - marginX * 2,
  });

  let y = 60;
  const nombre = (datos.congregacion ?? "").trim();
  if (nombre) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...paleta.titulo);
    doc.text(nombre, pageW / 2, y, { align: "center" });
    y += 16;
  }

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [
      [{ content: datos.periodo, colSpan: CABECERA.length }],
      CABECERA.map((c) => ({ content: c })),
    ],
    body: datos.filas.map((f) => [
      f.fecha,
      f.horario,
      f.lugar,
      f.territorio,
      f.capitan,
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
    columnStyles: {
      // La fecha, destacada como la columna del día en los otros programas.
      0: { fontStyle: "bold", fillColor: paleta.columnaDia, cellWidth: 104 },
      1: { cellWidth: 74 },
    },
    didParseCell: (data) => {
      if (data.section !== "head") return;
      if (data.row.index === 0) {
        data.cell.styles.fontSize = 10.5;
        data.cell.styles.cellPadding = 5;
      } else {
        data.cell.styles.fillColor = paleta.columnaDia;
        data.cell.styles.textColor = paleta.titulo;
      }
    },
  });

  if (datos.filas.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text("No hay salidas en este mes.", pageW / 2, y + 40, {
      align: "center",
    });
  }

  for (const mapa of datos.mapas ?? []) {
    dibujarMapa(doc, mapa, paleta.titulo);
  }
}

/** Un mapa a página completa, con su territorio arriba. */
function dibujarMapa(
  doc: jsPDF,
  mapa: MapaParaPdf,
  colorTitulo: readonly [number, number, number],
): void {
  doc.addPage();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 36;
  const arriba = 56;
  const abajo = 36;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...colorTitulo);
  doc.text(mapa.titulo, pageW / 2, 40, {
    align: "center",
    maxWidth: pageW - marginX * 2,
  });

  const disponibleW = pageW - marginX * 2;
  const disponibleH = pageH - arriba - abajo;
  const { w, h } = encajar(mapa.ancho, mapa.alto, disponibleW, disponibleH);
  const formato = mapa.dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
  doc.addImage(
    mapa.dataUrl,
    formato,
    marginX + (disponibleW - w) / 2,
    arriba + (disponibleH - h) / 2,
    w,
    h,
  );
}

/**
 * El tamaño con el que una imagen cabe dentro de un hueco sin deformarse.
 * Se exporta para poder comprobarlo desde las pruebas.
 */
export function encajar(
  ancho: number,
  alto: number,
  huecoAncho: number,
  huecoAlto: number,
): { w: number; h: number } {
  if (!(ancho > 0) || !(alto > 0)) return { w: huecoAncho, h: huecoAlto };
  const escala = Math.min(huecoAncho / ancho, huecoAlto / alto);
  return { w: ancho * escala, h: alto * escala };
}
