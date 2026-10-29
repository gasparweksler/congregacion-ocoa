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
  },
  {
    id: "verdes",
    nombre: "Verdes",
    cabecera: [168, 208, 168],
    cabeceraTexto: [20, 40, 20],
    columnaDia: [235, 244, 235],
    linea: [150, 178, 150],
    titulo: [26, 54, 32],
  },
  {
    id: "rojos",
    nombre: "Rojos",
    cabecera: [226, 160, 160],
    cabeceraTexto: [60, 18, 18],
    columnaDia: [250, 237, 237],
    linea: [196, 150, 150],
    titulo: [90, 24, 24],
  },
  {
    id: "amarillos",
    nombre: "Amarillos",
    cabecera: [240, 208, 140],
    cabeceraTexto: [60, 44, 10],
    columnaDia: [253, 246, 230],
    linea: [200, 175, 120],
    titulo: [92, 66, 14],
  },
  {
    id: "grises",
    nombre: "Grises",
    cabecera: [196, 202, 208],
    cabeceraTexto: [30, 35, 40],
    columnaDia: [241, 243, 245],
    linea: [160, 168, 176],
    titulo: [38, 43, 48],
  },
];

/** La paleta elegida; si el identificador no existe, la de siempre. */
export function paletaDe(id: PaletaId | string | null | undefined): Paleta {
  return PALETAS.find((p) => p.id === id) ?? PALETAS[0];
}

/** Para pintar el ejemplo en pantalla. */
export const css = ([r, g, b]: Rgb): string => `rgb(${r} ${g} ${b})`;
