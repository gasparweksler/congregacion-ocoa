// ============================================================================
//  El PDF del programa de predicación del mes.
//
//  Copia el programa que la congregación venía haciendo a mano: arriba una
//  franja con las fotos que haya subido, debajo el título sobre fondo de
//  color y después la tabla —día, fecha, hora, lugar, territorio y
//  encargado—, con las salidas del mismo día juntas en un solo bloque.
//
//  Cuando un día sale la predicación por grupos, ese día lleva su propio
//  recuadro: la hora, el aviso "PREDICACIÓN POR GRUPO" y una línea por cada
//  grupo o pareja de grupos, con su lugar, su territorio y su encargado.
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
import type { CellInput, RowInput } from "jspdf-autotable";
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

/** Una foto de la franja de arriba. */
export type FotoParaPdf = {
  /** La imagen en base64 ("data:image/jpeg;base64,…"). */
  dataUrl: string;
  /** Tamaño real, para repartir el ancho sin deformar ninguna. */
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
  /** Vacío o ausente: el programa empieza directamente por el título. */
  fotos?: FotoParaPdf[];
  paleta?: PaletaId;
};

const CABECERA = [
  "Día",
  "Fecha",
  "Hora",
  "Lugar de encuentro",
  "Territorio",
  "Encargado",
];

/** El aviso que encabeza el recuadro de los grupos. */
const AVISO_GRUPOS = "PREDICACIÓN POR GRUPO";

/**
 * Tamaños de letra con los que se intenta dibujar la tabla, de mayor a
 * menor. Se usa el primero con el que el programa entero cabe en una hoja.
 * El último es el suelo: por debajo dejaría de leerse, y antes que encoger
 * más se prefiere pasar a una segunda hoja con todo legible.
 */
const ESCALAS = [
  { fontSize: 9, cellPadding: 4, margen: 36, titulo: 14, fotos: 104 },
  { fontSize: 8.5, cellPadding: 3.4, margen: 36, titulo: 14, fotos: 96 },
  { fontSize: 8, cellPadding: 2.8, margen: 36, titulo: 14, fotos: 88 },
  { fontSize: 7.5, cellPadding: 2.3, margen: 32, titulo: 13, fotos: 78 },
  { fontSize: 7, cellPadding: 1.9, margen: 32, titulo: 13, fotos: 68 },
  { fontSize: 6.5, cellPadding: 1.5, margen: 28, titulo: 12, fotos: 58 },
  { fontSize: 6, cellPadding: 1.2, margen: 28, titulo: 12, fotos: 48 },
  // Los dos últimos son para meses de predicación todos los días, mañana y
  // tarde: letra pequeña, pero el mes entero de un vistazo y en un papel.
  { fontSize: 5.5, cellPadding: 1, margen: 24, titulo: 11, fotos: 40 },
  { fontSize: 5, cellPadding: 0.9, margen: 24, titulo: 11, fotos: 34 },
] as const;

type Escala = (typeof ESCALAS)[number];

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

/**
 * Cada fila del impreso, ya decidida: qué celdas lleva y de qué tipo es,
 * para poder pintarla después sin volver a razonar nada.
 */
type FilaDibujo = {
  celdas: CellInput[];
  tipo: "normal" | "aviso" | "grupo";
  /** Días alternos, para que cada día se distinga del siguiente. */
  par: boolean;
};

/**
 * Reparte las salidas en las filas del impreso.
 *
 * Las del mismo día van en un bloque: el nombre del día y el número se
 * escriben una sola vez, en una celda que abarca todas sus filas. Si ese día
 * hay salidas de grupos, van después de las de toda la congregación, con su
 * aviso delante; y si varios grupos salen a la misma hora, comparten aviso.
 */
function filasDelImpreso(filas: FilaPrograma[]): FilaDibujo[] {
  const dias: { iso: string; dia: string; fecha: string; filas: FilaPrograma[] }[] = [];
  for (const f of filas) {
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo.iso === f.iso) ultimo.filas.push(f);
    else dias.push({ iso: f.iso, dia: f.dia, fecha: f.fecha, filas: [f] });
  }

  const salida: FilaDibujo[] = [];
  dias.forEach((dia, i) => {
    const par = i % 2 === 1;
    const generales = dia.filas.filter((f) => !f.esDeGrupo);
    const deGrupo = dia.filas.filter((f) => f.esDeGrupo);

    // Las de los grupos, por hora: un aviso por cada hora distinta.
    const porHora: { hora: string; filas: FilaPrograma[] }[] = [];
    for (const f of deGrupo) {
      const ultimo = porHora[porHora.length - 1];
      if (ultimo && ultimo.hora === f.horario) ultimo.filas.push(f);
      else porHora.push({ hora: f.horario, filas: [f] });
    }

    const cuantas =
      generales.length + porHora.reduce((n, h) => n + 1 + h.filas.length, 0);

    const delDia: FilaDibujo[] = [];
    for (const f of generales) {
      delDia.push({
        tipo: "normal",
        par,
        celdas: [f.horario, f.lugar, f.territorio, f.capitan],
      });
    }
    for (const hora of porHora) {
      delDia.push({
        tipo: "aviso",
        par,
        celdas: [hora.hora, { content: AVISO_GRUPOS, colSpan: 3 }],
      });
      for (const f of hora.filas) {
        delDia.push({
          tipo: "grupo",
          par,
          celdas: [f.gruposCorto, f.lugar, f.territorio, f.capitan],
        });
      }
    }

    // El día y el número, una vez, abarcando todo el bloque.
    delDia[0].celdas.unshift(
      { content: dia.dia, rowSpan: cuantas },
      { content: dia.fecha, rowSpan: cuantas },
    );
    salida.push(...delDia);
  });
  return salida;
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
  const cuerpo = filasDelImpreso(datos.filas);

  // Arriba, la franja de fotos de la congregación, si subió alguna.
  let y = dibujarFranjaDeFotos(
    doc,
    datos.fotos ?? [],
    escala,
    marginX,
    paleta.franja,
  );

  const nombre = (datos.congregacion ?? "").trim();
  if (nombre) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(escala.titulo - 3);
    doc.setTextColor(...paleta.titulo);
    doc.text(nombre, pageW / 2, y + escala.titulo - 3, { align: "center" });
    y += escala.titulo + 2;
  }

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [
      [{ content: tituloDelImpreso(datos), colSpan: CABECERA.length }],
      CABECERA.map((c) => ({ content: c })),
    ],
    body: cuerpo.map((f) => f.celdas as RowInput),
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
      fillColor: paleta.acento,
      textColor: paleta.acentoTexto,
      fontStyle: "bold",
    },
    columnStyles: {
      // Los anchos siguen al tamaño de letra: "Miércoles" y "09:30 HRS"
      // ocupan lo mismo en caracteres, encoja lo que encoja la tabla.
      0: { fontStyle: "bold", cellWidth: 6 * escala.fontSize },
      1: { fontStyle: "bold", cellWidth: 4.2 * escala.fontSize },
      2: { cellWidth: 6.6 * escala.fontSize },
    },
    didParseCell: (data) => {
      if (data.section === "head") {
        // La primera fila es la franja del título, con el mes dentro.
        if (data.row.index === 0) {
          data.cell.styles.fillColor = paleta.franja;
          data.cell.styles.textColor = paleta.franjaTexto;
          data.cell.styles.fontSize = escala.fontSize + 3;
          data.cell.styles.cellPadding = escala.cellPadding + 1;
        }
        return;
      }
      const fila = cuerpo[data.row.index];
      if (!fila) return;
      data.cell.styles.fillColor = fila.par ? paleta.filaPar : paleta.filaImpar;
      if (fila.tipo === "aviso") {
        data.cell.styles.fillColor = paleta.grupoFondo;
        data.cell.styles.fontStyle = "bolditalic";
        // Las celdas del día (las que abarcan el bloque) no son el aviso.
        if (data.cell.colSpan > 1) data.cell.styles.textColor = paleta.grupoTexto;
      } else if (fila.tipo === "grupo") {
        data.cell.styles.fillColor = paleta.grupoFondo;
        data.cell.styles.fontStyle = "bolditalic";
      }
    },
  });

  if (datos.filas.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text("No hay salidas en este mes.", pageW / 2, y + 60, {
      align: "center",
    });
  }
}

/** "PROGRAMA DE PREDICACIÓN MES DE NOVIEMBRE 2026". */
function tituloDelImpreso(datos: DatosPrograma): string {
  const titulo = datos.titulo.trim();
  const periodo = datos.periodo.trim();
  if (!periodo) return titulo.toUpperCase();
  // "Del 1 al 15 de noviembre de 2026" ya se explica solo; "Noviembre 2026"
  // pide el "mes de" delante, como lo escribía la congregación.
  const unido = /^del\s/i.test(periodo)
    ? `${titulo} ${periodo}`
    : `${titulo} mes de ${periodo}`;
  return unido.toUpperCase();
}

/**
 * La franja de fotos de arriba: todas con la misma altura y repartidas a lo
 * ancho de la hoja, sin recortar ninguna ni deformarla. Devuelve dónde
 * empieza lo que va debajo.
 */
function dibujarFranjaDeFotos(
  doc: jsPDF,
  fotos: FotoParaPdf[],
  escala: Escala,
  marginX: number,
  marco: readonly [number, number, number],
): number {
  const arriba = escala.margen * 0.6;
  const buenas = fotos.filter((f) => f.ancho > 0 && f.alto > 0);
  if (buenas.length === 0) return arriba;

  const pageW = doc.internal.pageSize.getWidth();
  const disponible = pageW - marginX * 2;
  const separacion = 3;
  const huecos = separacion * (buenas.length - 1);
  const proporciones = buenas.map((f) => f.ancho / f.alto);
  const suma = proporciones.reduce((a, b) => a + b, 0);

  // Altura con la que, puestas en fila, llenan el ancho justo. Si sale más
  // alta de lo que se le deja a la franja, manda el tope y la fila se centra.
  const alto = Math.min((disponible - huecos) / suma, escala.fotos);
  const ancho = proporciones.map((p) => p * alto);
  const total = ancho.reduce((a, b) => a + b, 0) + huecos;

  const izquierda = marginX + (disponible - total) / 2;
  let x = izquierda;
  for (let i = 0; i < buenas.length; i++) {
    const formato = buenas[i].dataUrl.startsWith("data:image/png")
      ? "PNG"
      : "JPEG";
    doc.addImage(buenas[i].dataUrl, formato, x, arriba, ancho[i], alto);
    x += ancho[i] + separacion;
  }

  // El marco de alrededor, como en el programa que se hacía a mano.
  doc.setDrawColor(...marco);
  doc.setLineWidth(1.5);
  doc.rect(izquierda - 3, arriba - 3, total + 6, alto + 6);

  return arriba + alto + 8;
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
