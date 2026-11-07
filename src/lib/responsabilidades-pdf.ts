// ============================================================================
//  El PDF de "Todas las responsabilidades del mes".
//
//  Dos tablas, una debajo de la otra: audio y vídeo arriba, acomodación y
//  limpieza abajo. Las dos empiezan igual que los demás programas de la
//  aplicación: el mes encabeza la tabla, en su propia fila, y debajo van los
//  títulos de columna y las fechas. Así se lee igual en todos los PDF.
//
//  jsPDF llega como argumento en vez de importarse aquí: así la ruta lo carga
//  cuando hace falta y esta función se puede probar desde un script. Antes el
//  dibujo vivía dentro de la ruta y la prueba tenía su propia copia, que se
//  había quedado atrás (ignoraba la paleta elegida).
// ============================================================================

import type { jsPDF } from "jspdf";
import type autoTableFn from "jspdf-autotable";
import type { CellHookData } from "jspdf-autotable";
import { paletaDe, type PaletaId, type Rgb } from "@/lib/programa-paletas";
import { weekdayNameOfISO } from "@/lib/dates";

/** Las responsabilidades de una fecha, ya con el nombre de cada hermano. */
export type FilaResponsabilidad = {
  /** "2026-09-03" */
  dateISO: string;
  audio: string;
  video: string;
  /** Los dos que pasan el micrófono, ya unidos con " / ". */
  microfono: string;
  plataforma: string;
  entrada: string;
  auditorio: string;
  /** El grupo de limpieza de esa semana. */
  limpieza: string;
};

export type DatosResponsabilidades = {
  /** "SEPTIEMBRE 2026": encabeza las dos tablas. */
  periodo: string;
  /** "Congregación Ocoa": va bajo cada título. */
  congregacion?: string;
  filas: FilaResponsabilidad[];
  paleta?: PaletaId | string | null;
};

// Colores suaves rotativos para los grupos de limpieza (como la referencia).
// No siguen la paleta elegida a propósito: aquí el color no decora, dice de
// qué grupo es la semana. Con cinco tonos del mismo color dejarían de
// distinguirse, sobre todo impresos en blanco y negro.
const GROUP_FILLS: Rgb[] = [
  [252, 224, 168], // ámbar
  [246, 178, 178], // rojo suave
  [178, 233, 200], // verde
  [178, 200, 240], // azul
  [222, 198, 240], // violeta
  [200, 224, 210], // gris verdoso
];

const TITULO_1 = "ASIGNACIONES PARA LAS REUNIONES AUDIO Y VIDEO";
const TITULO_2 = "ASIGNACIONES PARA LAS REUNIONES ACOMODACIÓN Y LIMPIEZA";

const CABECERA_1 = ["DIA/MES", "AUDIO", "VIDEO", "MICROFONO", "PLATAFORMA"];
const CABECERA_2 = [
  "DIA/MES",
  "ACOMODADOR ENTRADA",
  "ACOMODADOR AUDITORIO",
  "LIMPIEZA POR GRUPOS",
];

/** Lo alto que ocupa, como poco, el título de la segunda tabla con su inicio. */
const ALTO_MINIMO_SEGUNDA = 130;

/** Una celda de la columna de limpieza, que puede abarcar varias filas. */
type CeldaCombinada = {
  content: string;
  rowSpan?: number;
  styles?: Record<string, unknown>;
};

export function dibujarResponsabilidades(
  doc: jsPDF,
  autoTable: typeof autoTableFn,
  datos: DatosResponsabilidades,
): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 36;
  const paleta = paletaDe(datos.paleta ?? "azules");
  const nombre = (datos.congregacion ?? "").trim();
  const filas = datos.filas;

  /** El título de una tabla, centrado. */
  const titulo = (texto: string, y: number): void => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...paleta.titulo);
    doc.text(texto, pageW / 2, y, {
      align: "center",
      maxWidth: pageW - marginX * 2,
    });
  };

  /** El nombre de la congregación bajo un título. Devuelve la y siguiente. */
  const subtitulo = (y: number): number => {
    if (!nombre) return y;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...paleta.titulo);
    doc.text(nombre, pageW / 2, y, { align: "center" });
    return y + 14;
  };

  /** El mes encabeza la tabla; los títulos de columna van debajo, más claros. */
  const estilarCabecera = (data: CellHookData): void => {
    if (data.section !== "head") return;
    if (data.row.index === 0) {
      // El mes: la fila fuerte de la paleta, algo mayor.
      data.cell.styles.fontSize = 10.5;
      data.cell.styles.cellPadding = 5;
    } else {
      data.cell.styles.fillColor = paleta.columnaDia;
      data.cell.styles.textColor = paleta.titulo;
    }
  };

  const estilos = {
    fontSize: 9,
    halign: "center" as const,
    valign: "middle" as const,
    cellPadding: 4,
    lineColor: paleta.linea,
    lineWidth: 0.5,
  };
  const estilosCabecera = {
    fillColor: paleta.cabecera,
    textColor: paleta.cabeceraTexto,
    fontStyle: "bold" as const,
  };

  /** "Jueves 3" */
  const columnaFecha = (f: FilaResponsabilidad) =>
    `${weekdayNameOfISO(f.dateISO)} ${Number(f.dateISO.split("-")[2])}`;

  // ---- Tabla 1: audio y vídeo ----
  titulo(TITULO_1, 40);
  autoTable(doc, {
    startY: subtitulo(56),
    margin: { left: marginX, right: marginX },
    head: [
      [{ content: datos.periodo, colSpan: CABECERA_1.length }],
      CABECERA_1.map((c) => ({ content: c })),
    ],
    body: filas.map((f) => [
      columnaFecha(f),
      f.audio,
      f.video,
      f.microfono,
      f.plataforma,
    ]),
    styles: estilos,
    headStyles: estilosCabecera,
    columnStyles: { 0: { fontStyle: "bold", fillColor: paleta.columnaDia } },
    didParseCell: estilarCabecera,
  });

  // ---- Tabla 2: acomodación y limpieza ----
  let y =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 28;
  // Si lo que queda de página no da ni para el título con el principio de la
  // tabla, la segunda mitad empieza en una página nueva: antes el título podía
  // quedar pegado al borde de abajo, o directamente fuera del papel.
  if (y + ALTO_MINIMO_SEGUNDA > pageH - marginX) {
    doc.addPage();
    y = 40;
  }
  titulo(TITULO_2, y);

  autoTable(doc, {
    startY: subtitulo(y + 16),
    margin: { left: marginX, right: marginX },
    head: [
      [{ content: datos.periodo, colSpan: CABECERA_2.length }],
      CABECERA_2.map((c) => ({ content: c })),
    ],
    body: cuerpoDeLimpieza(filas, columnaFecha),
    styles: estilos,
    headStyles: estilosCabecera,
    columnStyles: {
      0: { fontStyle: "bold", fillColor: paleta.columnaDia, cellWidth: 90 },
      3: { cellWidth: 150 }, // Limpieza más ancha (celda grande).
    },
    didParseCell: estilarCabecera,
  });
}

/**
 * El cuerpo de la tabla de acomodación y limpieza.
 *
 * Las semanas seguidas del mismo grupo de limpieza se juntan en una sola
 * celda alta (rowSpan), como en el programa impreso, y cada grupo lleva su
 * color para reconocerlo de un vistazo.
 */
function cuerpoDeLimpieza(
  filas: FilaResponsabilidad[],
  columnaFecha: (f: FilaResponsabilidad) => string,
): (string | CeldaCombinada)[][] {
  const colorDelGrupo = new Map<string, number>();
  const cuerpo: (string | CeldaCombinada)[][] = [];

  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    const grupo = f.limpieza || "";
    const fila: (string | CeldaCombinada)[] = [
      columnaFecha(f),
      f.entrada,
      f.auditorio,
    ];
    const anterior = i > 0 ? filas[i - 1].limpieza || "" : null;

    if (grupo && grupo === anterior) {
      // La misma semana de limpieza: se agranda la celda de arriba.
      for (let j = cuerpo.length - 1; j >= 0; j--) {
        const ultima = cuerpo[j][3];
        if (ultima && typeof ultima === "object") {
          ultima.rowSpan = (ultima.rowSpan ?? 1) + 1;
          break;
        }
      }
    } else {
      let fondo: Rgb | undefined;
      if (grupo) {
        if (!colorDelGrupo.has(grupo)) {
          colorDelGrupo.set(grupo, colorDelGrupo.size % GROUP_FILLS.length);
        }
        fondo = GROUP_FILLS[colorDelGrupo.get(grupo)!];
      }
      fila.push({
        content: grupo,
        rowSpan: 1,
        styles: {
          fontStyle: "bold",
          fontSize: 11,
          fillColor: fondo ?? [255, 255, 255],
        },
      });
    }
    cuerpo.push(fila);
  }
  return cuerpo;
}
