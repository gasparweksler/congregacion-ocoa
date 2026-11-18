// ============================================================================
//  Tarjeta "Registro de Publicador de la Congregación" (formulario S-21)
//
//  No se redibuja nada: se rellena el PROPIO formulario oficial en PDF
//  (src/assets/tarjeta-s21.pdf, una tarjeta real con todos los campos
//  vaciados), así la tarjeta descargada es idéntica al modelo impreso.
//
//  Mapa de campos (los nombres reales llevan sufijo de tipo, p. ej.
//  "900_2_Text_SanSerif", por eso se buscan por prefijo):
//    900_1  Nombre              900_8  Anciano
//    900_2  Fecha de nacimiento 900_9  Siervo ministerial
//    900_3  Hombre              900_10 Precursor regular
//    900_4  Mujer               900_11 Precursor especial
//    900_5  Fecha de bautismo   900_12 Misionero
//    900_6  Otras ovejas        900_13 Año de servicio
//    900_7  Ungido
//  Filas de meses 20..31 (Septiembre → Agosto), cada una con:
//    901_NN Participación · 902_NN Cursos · 903_NN Precursor auxiliar
//    904_NN Horas · 905_NN Notas
//  Fila 32: 904_32 total de horas.
// ============================================================================

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, type PDFFont, type PDFForm } from "pdf-lib";
import {
  PUBLISHER_STATUS,
  HOPE,
  PRIVILEGE,
  MONTH_NAMES,
} from "@/lib/constants";

export type CardPublisher = {
  fullName: string;
  sex: string | null;
  birthDate: Date | null;
  baptismDate: Date | null;
  hope: string | null;
  privilege: string | null;
  status: string;
};

export type CardReport = {
  year: number;
  month: number;
  participated: boolean;
  bibleStudies: number;
  hours: number | null;
  auxiliaryPioneer: boolean;
  comment: string | null;
};

/** Primera fila de meses y orden del año de servicio (Septiembre → Agosto). */
const FIRST_ROW = 20;
const TOTAL_ROW = 32;

/**
 * Meses del año de servicio en orden: de Septiembre del año anterior a Agosto
 * del año de servicio. `serviceYear` 2027 => sep-2026 … ago-2027.
 */
export function serviceYearMonths(
  serviceYear: number,
): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const m = 9 + i; // 9..20
    out.push(m <= 12 ? { year: serviceYear - 1, month: m } : { year: serviceYear, month: m - 12 });
  }
  return out;
}

/** Año de servicio al que pertenece una fecha (el de septiembre en adelante). */
export function currentServiceYear(today = new Date()): number {
  return today.getMonth() + 1 >= 9 ? today.getFullYear() + 1 : today.getFullYear();
}

const dmy = (d: Date | null): string =>
  d
    ? `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`
    : "";

let templateBytes: Uint8Array | null = null;
async function loadTemplate(): Promise<Uint8Array> {
  if (!templateBytes) {
    const file = path.join(process.cwd(), "src/assets/tarjeta-s21.pdf");
    templateBytes = new Uint8Array(await readFile(file));
  }
  return templateBytes;
}

/** Busca un campo por prefijo ("900_2" → "900_2_Text_SanSerif"). */
function fieldName(form: PDFForm, prefix: string): string | null {
  const hit = form
    .getFields()
    .map((f) => f.getName())
    .find((n) => n === prefix || n.startsWith(`${prefix}_`));
  return hit ?? null;
}

function setText(form: PDFForm, prefix: string, value: string): void {
  const name = fieldName(form, prefix);
  if (!name) return;
  try {
    form.getTextField(name).setText(value);
  } catch {
    // El campo existe pero no es de texto: se ignora en silencio.
  }
}

// --- Las observaciones de cada mes ------------------------------------------
//
//  La casilla de notas del formulario mide 162 x 17 puntos y viene con letra
//  de 13 puntos: a ese tamaño solo entran unas 25 letras, así que cualquier
//  observación un poco larga se cortaba al descargar la tarjeta. Ahora la
//  letra se encoge hasta que quepa, y si aun así no entra se escribe lo que
//  cabe (con puntos suspensivos) y la observación completa va en una hoja
//  añadida al final, para no perder nada.

/** El tamaño de letra que trae el formulario. */
const NOTA_TAM_FORM = 13;
/** Por debajo de esto ya no se lee en papel. */
const NOTA_TAM_MIN = 6;
/** Líneas que caben de alto en la casilla al tamaño mínimo. */
const NOTA_LINEAS = 2;

export type NotaAjustada = {
  /** Lo que se escribe en la casilla. */
  texto: string;
  /** Tamaño de letra con el que cabe. */
  tam: number;
  /** Si hay que repartirlo en varias líneas. */
  multilinea: boolean;
  /** Falso si hubo que recortarlo (entonces va entero en la hoja final). */
  completa: boolean;
};

/** Reparte un texto en líneas de un ancho dado, como hace el PDF al escribirlo. */
export function enLineas(
  texto: string,
  font: PDFFont,
  tam: number,
  ancho: number,
): string[] {
  const lineas: string[] = [];
  let actual = "";
  const empujar = () => {
    if (actual !== "") lineas.push(actual);
    actual = "";
  };

  for (const palabra of texto.split(" ")) {
    let resto = palabra;
    // Una palabra más ancha que la casilla se parte: si no, se saldría.
    while (font.widthOfTextAtSize(resto, tam) > ancho) {
      let corte = 1;
      while (
        corte < resto.length &&
        font.widthOfTextAtSize(resto.slice(0, corte + 1), tam) <= ancho
      ) {
        corte++;
      }
      empujar();
      lineas.push(resto.slice(0, corte));
      resto = resto.slice(corte);
    }
    const prueba = actual === "" ? resto : `${actual} ${resto}`;
    if (actual === "" || font.widthOfTextAtSize(prueba, tam) <= ancho) {
      actual = prueba;
    } else {
      empujar();
      actual = resto;
    }
  }
  empujar();
  return lineas;
}

/** Lo más largo del texto que cabe en las líneas disponibles, con "…" al final. */
function recortar(
  texto: string,
  font: PDFFont,
  tam: number,
  ancho: number,
  lineas: number,
): string {
  const cabe = (t: string) => enLineas(t, font, tam, ancho).length <= lineas;
  let bajo = 0;
  let alto = texto.length;
  while (bajo < alto) {
    const medio = Math.ceil((bajo + alto) / 2);
    if (cabe(`${texto.slice(0, medio).trimEnd()}…`)) bajo = medio;
    else alto = medio - 1;
  }
  return bajo > 0 ? `${texto.slice(0, bajo).trimEnd()}…` : "…";
}

/**
 * Cómo escribir una observación en su casilla: entera y del tamaño del
 * formulario si cabe, encogida si hace falta, y recortada solo cuando ni
 * siquiera al tamaño mínimo entra.
 */
export function ajustarNota(
  texto: string | null,
  font: PDFFont,
  ancho: number,
  lineas = NOTA_LINEAS,
): NotaAjustada {
  const limpio = (texto ?? "").replace(/\s+/g, " ").trim();
  if (limpio === "") {
    return { texto: "", tam: NOTA_TAM_FORM, multilinea: false, completa: true };
  }

  // 1. En una sola línea, lo más grande que quepa: así se ve igual que el
  //    resto de la tarjeta.
  for (let t = NOTA_TAM_FORM; t >= NOTA_TAM_MIN; t -= 0.5) {
    if (font.widthOfTextAtSize(limpio, t) <= ancho) {
      return { texto: limpio, tam: t, multilinea: false, completa: true };
    }
  }
  // 2. Repartido en varias líneas, con la letra más pequeña que se lee.
  if (enLineas(limpio, font, NOTA_TAM_MIN, ancho).length <= lineas) {
    return { texto: limpio, tam: NOTA_TAM_MIN, multilinea: true, completa: true };
  }
  // 3. No cabe de ninguna manera: lo que entra aquí y lo demás, al final.
  return {
    texto: recortar(limpio, font, NOTA_TAM_MIN, ancho, lineas),
    tam: NOTA_TAM_MIN,
    multilinea: true,
    completa: false,
  };
}

function setCheck(form: PDFForm, prefix: string, on: boolean): void {
  const name = fieldName(form, prefix);
  if (!name) return;
  try {
    const box = form.getCheckBox(name);
    if (on) box.check();
    else box.uncheck();
  } catch {
    // Igual que arriba.
  }
}

/** Escribe una observación en su casilla, con el tamaño que le toca. */
function setNota(form: PDFForm, prefix: string, nota: NotaAjustada): void {
  const name = fieldName(form, prefix);
  if (!name) return;
  try {
    const campo = form.getTextField(name);
    campo.setText(nota.texto);
    if (nota.multilinea) campo.enableMultiline();
    campo.setFontSize(nota.tam);
  } catch {
    // El campo existe pero no es de texto: se ignora en silencio.
  }
}

/** El ancho útil de una casilla (el hueco menos el margen que deja el PDF). */
function anchoDeCasilla(form: PDFForm, prefix: string, porDefecto: number): number {
  const name = fieldName(form, prefix);
  if (!name) return porDefecto;
  try {
    const widget = form.getTextField(name).acroField.getWidgets()[0];
    const ancho = widget.getRectangle().width - 2;
    return ancho > 10 ? ancho : porDefecto;
  } catch {
    return porDefecto;
  }
}

/**
 * La hoja que se añade al final cuando alguna observación no cabía entera en
 * su casilla. Lleva el texto completo de cada mes, para no perder nada.
 */
async function hojaDeObservaciones(
  doc: PDFDocument,
  publisher: CardPublisher,
  serviceYear: number,
  pendientes: Array<{ year: number; month: number; texto: string }>,
): Promise<void> {
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const MARGEN = 50;
  const ANCHO = 595 - MARGEN * 2;

  let pagina = doc.addPage([595, 842]);
  let y = 842 - MARGEN;

  const sitio = (alto: number) => {
    if (y - alto >= MARGEN) return;
    pagina = doc.addPage([595, 842]);
    y = 842 - MARGEN;
  };

  pagina.drawText("Observaciones de los informes", {
    x: MARGEN,
    y,
    size: 14,
    font: negrita,
  });
  y -= 18;
  pagina.drawText(`${publisher.fullName} · año de servicio ${serviceYear}`, {
    x: MARGEN,
    y,
    size: 10,
    font: normal,
  });
  y -= 14;
  pagina.drawText(
    "Estas observaciones no cabían enteras en la tarjeta; aquí están completas.",
    { x: MARGEN, y, size: 9, font: normal },
  );
  y -= 22;

  for (const p of pendientes) {
    sitio(30);
    pagina.drawText(`${MONTH_NAMES[p.month - 1]} de ${p.year}`, {
      x: MARGEN,
      y,
      size: 11,
      font: negrita,
    });
    y -= 15;
    for (const linea of enLineas(p.texto, normal, 10, ANCHO)) {
      sitio(14);
      pagina.drawText(linea, { x: MARGEN, y, size: 10, font: normal });
      y -= 13;
    }
    y -= 8;
  }
}

/**
 * Rellena la tarjeta de un publicador con su historial del año de servicio.
 * Devuelve el PDF listo para descargar.
 */
export async function buildPublisherCard(
  publisher: CardPublisher,
  reports: CardReport[],
  serviceYear: number,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await loadTemplate());
  const form = doc.getForm();

  // --- Encabezado ---
  setText(form, "900_1", publisher.fullName.toUpperCase());
  setText(form, "900_2", dmy(publisher.birthDate));
  setCheck(form, "900_3", publisher.sex === "M");
  setCheck(form, "900_4", publisher.sex === "F");
  setText(form, "900_5", dmy(publisher.baptismDate));
  setCheck(form, "900_6", publisher.hope === HOPE.OTRAS_OVEJAS);
  setCheck(form, "900_7", publisher.hope === HOPE.UNGIDO);
  setCheck(form, "900_8", publisher.privilege === PRIVILEGE.ANCIANO);
  setCheck(form, "900_9", publisher.privilege === PRIVILEGE.SIERVO_MINISTERIAL);
  setCheck(
    form,
    "900_10",
    publisher.status === PUBLISHER_STATUS.PRECURSOR_REGULAR,
  );
  setCheck(
    form,
    "900_11",
    publisher.status === PUBLISHER_STATUS.PRECURSOR_ESPECIAL,
  );
  setCheck(
    form,
    "900_12",
    publisher.status === PUBLISHER_STATUS.MISIONERO_CAMPO,
  );
  setText(form, "900_13", String(serviceYear));

  // --- Filas de meses ---
  const byPeriod = new Map(reports.map((r) => [`${r.year}-${r.month}`, r]));
  let totalHours = 0;

  // Para medir las observaciones con la misma letra con la que se escriben.
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const anchoNota = anchoDeCasilla(form, `905_${FIRST_ROW}`, 160);
  const pendientes: Array<{ year: number; month: number; texto: string }> = [];

  serviceYearMonths(serviceYear).forEach(({ year, month }, i) => {
    const row = FIRST_ROW + i;
    const r = byPeriod.get(`${year}-${month}`);
    if (!r) return; // Mes sin informe: la fila queda en blanco.

    setCheck(form, `901_${row}`, r.participated);
    setText(form, `902_${row}`, r.bibleStudies > 0 ? String(r.bibleStudies) : "");
    setCheck(form, `903_${row}`, r.auxiliaryPioneer);
    const hours = r.hours ?? 0;
    setText(form, `904_${row}`, hours > 0 ? String(hours) : "");

    const nota = ajustarNota(r.comment, helvetica, anchoNota);
    setNota(form, `905_${row}`, nota);
    if (!nota.completa) {
      pendientes.push({
        year,
        month,
        texto: (r.comment ?? "").replace(/\s+/g, " ").trim(),
      });
    }
    totalHours += hours;
  });

  setText(form, `904_${TOTAL_ROW}`, totalHours > 0 ? String(totalHours) : "");

  // Deja los valores visibles aunque el lector no regenere apariencias.
  form.updateFieldAppearances();

  // Lo que no cupo en su casilla, entero, en una hoja al final.
  if (pendientes.length > 0) {
    await hojaDeObservaciones(doc, publisher, serviceYear, pendientes);
  }

  return doc.save();
}

/** Nombre de archivo seguro para la tarjeta de un publicador. */
export function cardFileName(fullName: string, serviceYear: number): string {
  const clean = fullName
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "_");
  return `${clean || "tarjeta"}_${serviceYear}.pdf`;
}
