// ============================================================================
//  Paletas de color de los programas.
//
//  Los mismos colores sirven para el ejemplo que se ve en pantalla y para el
//  PDF que se descarga, así que lo que se elige es exactamente lo que sale
//  impreso. Van como terna RGB porque es lo que pide jsPDF.
//
//  Los tonos son suaves a propósito: estos programas se imprimen, muchas veces
//  en blanco y negro, y un fondo oscuro se come el texto.
// ============================================================================

export type PaletaId = "azules" | "verdes" | "rojos" | "amarillos" | "grises";

export type Rgb = [number, number, number];

export type Paleta = {
  id: PaletaId;
  nombre: string;
  /** Fondo de la fila de títulos de la tabla. */
  cabecera: Rgb;
  /** Texto sobre esa fila. */
  cabeceraTexto: Rgb;
  /** Fondo de la columna del día (la primera). */
  columnaDia: Rgb;
  /** Líneas de la cuadrícula. */
  linea: Rgb;
  /** Título del programa y nombre de la congregación. */
  titulo: Rgb;

  // --- Solo las usa el programa de predicación -----------------------------
  //  Ese programa va en una franja de color con el título dentro, la fila de
  //  columnas en un tono que contrasta y los días alternando dos fondos, como
  //  el que la congregación venía haciendo a mano.

  /** Fondo de la franja del título. */
  franja: Rgb;
  /** Texto dentro de la franja. */
  franjaTexto: Rgb;
  /** Fondo de la fila de nombres de columna. */
  acento: Rgb;
  /** Texto sobre esa fila. */
  acentoTexto: Rgb;
  /** Fondo de los días impares (el primero, el tercero…). */
  filaImpar: Rgb;
  /** Fondo de los días pares, para que cada día se vea separado del otro. */
  filaPar: Rgb;
  /** Fondo del bloque de predicación por grupos. */
  grupoFondo: Rgb;
  /** "PREDICACIÓN POR GRUPO", que tiene que saltar a la vista. */
  grupoTexto: Rgb;
};

/**
 * Las cinco, en el orden en que se enseñan. "Azules" es la de siempre: quien
 * no toque nada sigue bajando el PDF exactamente igual que antes.
 */
export const PALETAS: Paleta[] = [
  {
    id: "azules",
    nombre: "Azules",
    cabecera: [149, 180, 216],
    cabeceraTexto: [20, 30, 50],
    columnaDia: [235, 240, 248],
    linea: [148, 163, 184],
    titulo: [30, 41, 59],
    franja: [47, 84, 150],
    franjaTexto: [255, 255, 255],
    acento: [244, 170, 110],
    acentoTexto: [50, 28, 8],
    filaImpar: [222, 234, 248],
    filaPar: [189, 211, 238],
    grupoFondo: [222, 242, 250],
    grupoTexto: [192, 0, 0],
  },
  {
    id: "verdes",
    nombre: "Verdes",
    cabecera: [168, 208, 168],
    cabeceraTexto: [20, 40, 20],
    columnaDia: [235, 244, 235],
    linea: [150, 178, 150],
    titulo: [26, 54, 32],
    franja: [56, 118, 70],
    franjaTexto: [255, 255, 255],
    acento: [244, 196, 110],
    acentoTexto: [50, 34, 8],
    filaImpar: [226, 240, 226],
    filaPar: [198, 222, 198],
    grupoFondo: [234, 246, 228],
    grupoTexto: [168, 42, 42],
  },
  {
    id: "rojos",
    nombre: "Rojos",
    cabecera: [226, 160, 160],
    cabeceraTexto: [60, 18, 18],
    columnaDia: [250, 237, 237],
    linea: [196, 150, 150],
    titulo: [90, 24, 24],
    franja: [150, 50, 50],
    franjaTexto: [255, 255, 255],
    acento: [240, 190, 130],
    acentoTexto: [56, 30, 10],
    filaImpar: [250, 232, 232],
    filaPar: [240, 208, 208],
    grupoFondo: [252, 240, 230],
    grupoTexto: [120, 20, 20],
  },
  {
    id: "amarillos",
    nombre: "Amarillos",
    cabecera: [240, 208, 140],
    cabeceraTexto: [60, 44, 10],
    columnaDia: [253, 246, 230],
    linea: [200, 175, 120],
    titulo: [92, 66, 14],
    franja: [176, 122, 26],
    franjaTexto: [255, 255, 255],
    acento: [246, 214, 150],
    acentoTexto: [60, 42, 8],
    filaImpar: [253, 244, 224],
    filaPar: [246, 228, 190],
    grupoFondo: [252, 246, 228],
    grupoTexto: [168, 42, 42],
  },
  {
    id: "grises",
    nombre: "Grises",
    cabecera: [196, 202, 208],
    cabeceraTexto: [30, 35, 40],
    columnaDia: [241, 243, 245],
    linea: [160, 168, 176],
    titulo: [38, 43, 48],
    franja: [78, 86, 94],
    franjaTexto: [255, 255, 255],
    acento: [206, 212, 218],
    acentoTexto: [28, 32, 36],
    filaImpar: [242, 244, 246],
    filaPar: [222, 226, 230],
    grupoFondo: [236, 240, 244],
    grupoTexto: [90, 96, 102],
  },
];

/** La paleta elegida; si el identificador no existe, la de siempre. */
export function paletaDe(id: PaletaId | string | null | undefined): Paleta {
  return PALETAS.find((p) => p.id === id) ?? PALETAS[0];
}

/** Para pintar el ejemplo en pantalla. */
export const css = ([r, g, b]: Rgb): string => `rgb(${r} ${g} ${b})`;
