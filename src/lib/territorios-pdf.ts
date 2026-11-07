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

/** La columna de grupos solo aparece si alguna salida es de un grupo. */
const COLUMNA_GRUPOS = "Grupos";

/**
 * Tamaños de letra con los que se intenta dibujar la tabla, de mayor a
 * menor. Se usa el primero con el que el programa entero cabe en una hoja.
 * El último es el suelo: por debajo dejaría de leerse, y antes que encoger
 * más se prefiere pasar a una segunda hoja con todo legible.
 */
const ESCALAS = [
  { fontSize: 9, cellPadding: 4, margen: 36, titulo: 14 },
  { fontSize: 8.5, cellPadding: 3.4, margen: 36, titulo: 14 },
  { fontSize: 8, cellPadding: 2.8, margen: 36, titulo: 14 },
  { fontSize: 7.5, cellPadding: 2.3, margen: 32, titulo: 13 },
  { fontSize: 7, cellPadding: 1.9, margen: 32, titulo: 13 },
  { fontSize: 6.5, cellPadding: 1.5, margen: 28, titulo: 12 },
  { fontSize: 6, cellPadding: 1.2, margen: 28, titulo: 12 },
  // Los dos últimos son para meses de predicación todos los días, mañana y
  // tarde: letra pequeña, pero el mes entero de un vistazo y en un papel.
  { fontSize: 5.5, cellPadding: 1, margen: 24, titulo: 11 },
  { fontSize: 5, cellPadding: 0.9, margen: 24, titulo: 11 },
] as const;

type Escala = (typeof ESCALAS)[number];

/** Color de fondo de la columna de grupos cuando la comparten varios. */
const FONDO_COMPARTIDA: [number, number, number] = [252, 240, 214];

/**
 * Dibuja el programa, entero, en una sola hoja.
 *
 * El documento que llega tiene que estar en blanco: se dibuja la tabla con
 * la letra más grande y, si no cabe en la hoja, se borra lo dibujado y se
 * repite más pequeño, hasta que entre. Por debajo del último tamaño de
 * ESCALAS no se baja: antes que dejar el programa ilegible se prefiere una
 * segunda hoja con todo legible.
 *
 * Después van los mapas, cada uno en su hoja, que esos sí son aparte.
 */
export function dibujarProgramaPredicacion(
  doc: jsPDF,
  autoTable: typeof autoTableFn,
  datos: DatosPrograma,
): void {
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();

  for (let i = 0; i < ESCALAS.length; i++) {
    if (i > 0) vaciar(doc, ancho, alto);
    pintarPrograma(doc, autoTable, datos, ESCALAS[i]);
    if (doc.getNumberOfPages() === 1) break;
  }

  for (const mapa of datos.mapas ?? []) {
    dibujarMapa(doc, mapa, paletaDe(datos.paleta ?? "azules").titulo);
  }
}

/** Deja el documento como recién abierto, con una hoja en blanco. */
function vaciar(doc: jsPDF, ancho: number, alto: number): void {
  for (let p = doc.getNumberOfPages(); p >= 1; p--) doc.deletePage(p);
  doc.addPage([ancho, alto]);
  doc.setPage(1);
}

/** El título, el nombre de la congregación y la tabla, a un tamaño dado. */
function pintarPrograma(
  doc: jsPDF,
  autoTable: typeof autoTableFn,
  datos: DatosPrograma,
  escala: Escala,
): void {
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = escala.margen;
  const paleta = paletaDe(datos.paleta ?? "azules");
  const conGrupos = datos.filas.some((f) => f.esDeGrupo);
  const cabecera = conGrupos ? [...CABECERA, COLUMNA_GRUPOS] : CABECERA;

  // El título y el nombre de la congregación también encogen con la tabla:
  // en un mes muy cargado, cada punto de arriba es una fila más abajo.
  const alturaTitulo = escala.titulo * 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(escala.titulo);
  doc.setTextColor(...paleta.titulo);
  doc.text(datos.titulo.trim().toUpperCase(), pageW / 2, alturaTitulo, {
    align: "center",
    maxWidth: pageW - marginX * 2,
  });

  let y = alturaTitulo + escala.titulo + 4;
  const nombre = (datos.congregacion ?? "").trim();
  if (nombre) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(escala.titulo - 3);
    doc.setTextColor(...paleta.titulo);
    doc.text(nombre, pageW / 2, y, { align: "center" });
    y += escala.titulo + 2;
  }

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [
      [{ content: datos.periodo, colSpan: cabecera.length }],
      cabecera.map((c) => ({ content: c })),
    ],
    body: datos.filas.map((f) => {
      const fila = [f.fecha, f.horario, f.lugar, f.territorio, f.capitan];
      return conGrupos ? [...fila, f.grupos] : fila;
    }),
    styles: {
      fontSize: escala.fontSize,
      halign: "center",
      valign: "middle",
      cellPadding: escala.cellPadding,
      lineColor: paleta.linea,
      lineWidth: 0.5,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: paleta.cabecera,
      textColor: paleta.cabeceraTexto,
      fontStyle: "bold",
    },
    columnStyles: {
      // La fecha, destacada como la columna del día en los otros programas.
      // Los anchos siguen al tamaño de letra: "Miércoles 25" y "09:30 HRS"
      // ocupan lo mismo en caracteres, encoja lo que encoja la tabla.
      0: {
        fontStyle: "bold",
        fillColor: paleta.columnaDia,
        cellWidth: 7.2 * escala.fontSize,
      },
      1: { cellWidth: 6.6 * escala.fontSize },
    },
    didParseCell: (data) => {
      if (data.section === "head") {
        if (data.row.index === 0) {
          data.cell.styles.fontSize = escala.fontSize + 1.5;
          data.cell.styles.cellPadding = escala.cellPadding + 1;
        } else {
          data.cell.styles.fillColor = paleta.columnaDia;
          data.cell.styles.textColor = paleta.titulo;
        }
        return;
      }
      // La columna de grupos dice de un vistazo de quién es cada salida:
      // la de toda la congregación en gris, la de un grupo en negrita y la
      // compartida además con fondo, que es la que se lee peor de corrido.
      if (!conGrupos || data.column.index !== cabecera.length - 1) return;
      const fila = datos.filas[data.row.index];
      if (!fila) return;
      if (!fila.esDeGrupo) {
        data.cell.styles.textColor = [120, 120, 120];
        data.cell.styles.fontStyle = "italic";
      } else {
        data.cell.styles.fontStyle = "bold";
        if (fila.compartida) data.cell.styles.fillColor = FONDO_COMPARTIDA;
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
