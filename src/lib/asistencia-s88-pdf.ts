// ============================================================================
//  Registro de asistencia a las reuniones de congregación (S-88-S), en PDF.
//
//  Se dibuja con la misma distribución del formulario oficial, medida sobre
//  el original: A4 vertical, dos bloques (entre semana arriba, fin de semana
//  abajo), y dentro de cada bloque dos tablas iguales, una por año de
//  servicio. Cada tabla lleva los doce meses de septiembre a agosto y, al
//  pie, el promedio del año.
//
//  Solo se replica la distribución y los rótulos del formulario: no se
//  reproduce ningún logotipo ni ninguna marca.
//
//  El dibujo vive aquí, y no dentro de la ruta, para que la prueba
//  (scripts/test-asistencia-pdf.mts) compruebe exactamente el mismo PDF que
//  se descarga.
// ============================================================================

import type { jsPDF } from "jspdf";

/** Lo que se imprime de un mes en una de las dos tablas. */
export type CeldaS88 = {
  /** Reuniones celebradas con asistencia anotada. */
  reuniones: number;
  /** Suma de las asistencias. */
  total: number;
  /** Promedio por reunión, ya redondeado. */
  promedio: number | null;
};

/** Un año de servicio completo, de septiembre a agosto. */
export type ColumnaS88 = {
  anio: number;
  /** 12 meses en orden: septiembre … agosto. */
  meses: Array<{ entreSemana: CeldaS88; finDeSemana: CeldaS88 }>;
};

export type DatosS88 = {
  /** La columna de la izquierda (el año elegido) y la de la derecha. */
  columnas: [ColumnaS88, ColumnaS88 | null];
};

const MESES_S88 = [
  "Septiembre", "Octubre", "Noviembre", "Diciembre",
  "Enero", "Febrero", "Marzo", "Abril",
  "Mayo", "Junio", "Julio", "Agosto",
];

// --- Medidas tomadas del formulario original (en puntos, A4) ---------------
const ANCHO_LINEA = 0.7;
/** Izquierda de cada tabla: la del año elegido y la del año siguiente. */
const TABLA_X = [18, 299];
/** Anchos de las cuatro columnas: mes, nº de reuniones, total, promedio. */
const COLS = [80, 68, 64, 62];
const FILA = 20;
/** Cada bloque: dónde empieza su rótulo, su cabecera y su primera fila. */
const BLOQUES = [
  {
    titulo: "Reunión de entre semana",
    tipo: "entreSemana" as const,
    yTitulo: 85,
    yCabecera: 96,
    yFilas: 127,
  },
  {
    titulo: "Reunión del fin de semana",
    tipo: "finDeSemana" as const,
    yTitulo: 434,
    yCabecera: 445,
    yFilas: 476,
  },
];

/** Los bordes de las cuatro columnas de una tabla. */
function bordes(x0: number): number[] {
  const out = [x0];
  for (const w of COLS) out.push(out[out.length - 1] + w);
  return out;
}

/** Texto centrado dentro de una columna. */
function centrado(
  doc: jsPDF,
  texto: string,
  x0: number,
  x1: number,
  y: number,
): void {
  doc.text(texto, (x0 + x1) / 2, y, { align: "center" });
}

/** La cabecera de una tabla: el año de servicio y los tres títulos. */
function cabecera(doc: jsPDF, x0: number, yTop: number, anio: number | null): void {
  const b = bordes(x0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("Año de servicio", x0 + 4, yTop + 10);
  if (anio !== null) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(String(anio), x0 + 4, yTop + 25);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
  }

  centrado(doc, "Número de", b[1], b[2], yTop + 14);
  centrado(doc, "reuniones", b[1], b[2], yTop + 23);
  centrado(doc, "Asistencia", b[2], b[3], yTop + 14);
  centrado(doc, "total", b[2], b[3], yTop + 23);
  centrado(doc, "Promedio de", b[3], b[4], yTop + 10);
  centrado(doc, "asistencia", b[3], b[4], yTop + 19);
  centrado(doc, "semanal", b[3], b[4], yTop + 28);
}

/** La rejilla de una tabla: cabecera + 12 meses + fila del promedio. */
function rejilla(doc: jsPDF, x0: number, yCabecera: number, yFilas: number): void {
  const b = bordes(x0);
  const ancho = b[4] - b[0];
  const alto = yFilas - yCabecera + FILA * 13;

  doc.setLineWidth(ANCHO_LINEA);
  doc.setDrawColor(0, 0, 0);
  // El contorno y la línea que separa la cabecera.
  doc.rect(x0, yCabecera, ancho, alto);
  doc.line(x0, yFilas, x0 + ancho, yFilas);
  // Las filas de los meses y la del promedio.
  for (let i = 1; i <= 13; i++) {
    const y = yFilas + i * FILA;
    doc.line(x0, y, x0 + ancho, y);
  }
  // Las columnas, de arriba abajo.
  for (let i = 1; i < b.length - 1; i++) {
    doc.line(b[i], yCabecera, b[i], yCabecera + alto);
  }
}

/** Los doce meses de una tabla, y el promedio del año al pie. */
function filas(
  doc: jsPDF,
  x0: number,
  yFilas: number,
  columna: ColumnaS88 | null,
  tipo: "entreSemana" | "finDeSemana",
): void {
  const b = bordes(x0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  let reunionesAnio = 0;
  let totalAnio = 0;

  for (let i = 0; i < 12; i++) {
    const y = yFilas + i * FILA + 14;
    doc.text(MESES_S88[i], x0 + 3, y);
    const celda = columna?.meses[i]?.[tipo];
    if (!celda || celda.reuniones === 0) continue;
    reunionesAnio += celda.reuniones;
    totalAnio += celda.total;
    centrado(doc, String(celda.reuniones), b[1], b[2], y);
    centrado(doc, String(celda.total), b[2], b[3], y);
    centrado(doc, String(celda.promedio ?? ""), b[3], b[4], y);
  }

  // La fila del pie: el rótulo ocupa las tres primeras columnas.
  const yPie = yFilas + 12 * FILA + 14;
  doc.setFontSize(9);
  centrado(doc, "Promedio de asistencia mensual", b[0], b[3], yPie);
  if (reunionesAnio > 0) {
    doc.setFont("helvetica", "bold");
    centrado(
      doc,
      String(Math.round(totalAnio / reunionesAnio)),
      b[3],
      b[4],
      yPie,
    );
    doc.setFont("helvetica", "normal");
  }
}

/**
 * Dibuja el formulario entero en la página actual del documento.
 * El documento tiene que estar en puntos y en A4 vertical.
 */
export function dibujarS88(doc: jsPDF, datos: DatosS88): void {
  doc.setTextColor(0, 0, 0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(
    "REGISTRO DE ASISTENCIA A LAS REUNIONES DE CONGREGACIÓN",
    297.5,
    52,
    { align: "center" },
  );

  for (const bloque of BLOQUES) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(bloque.titulo, 21, bloque.yTitulo);

    for (let t = 0; t < 2; t++) {
      const x0 = TABLA_X[t];
      const columna = datos.columnas[t];
      rejilla(doc, x0, bloque.yCabecera, bloque.yFilas);
      cabecera(doc, x0, bloque.yCabecera, columna?.anio ?? null);
      filas(doc, x0, bloque.yFilas, columna, bloque.tipo);
    }
  }

  // El código del formulario, como en el original.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.text("S-88-S   12/18", 17, 799);
}
