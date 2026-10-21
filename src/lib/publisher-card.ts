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
import { PDFDocument, type PDFForm } from "pdf-lib";
import { PUBLISHER_STATUS, HOPE, PRIVILEGE } from "@/lib/constants";

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
  // "Precursor especial" y "Misionero" no existen en el sistema: quedan vacías.
  setText(form, "900_13", String(serviceYear));

  // --- Filas de meses ---
  const byPeriod = new Map(reports.map((r) => [`${r.year}-${r.month}`, r]));
  let totalHours = 0;

  serviceYearMonths(serviceYear).forEach(({ year, month }, i) => {
    const row = FIRST_ROW + i;
    const r = byPeriod.get(`${year}-${month}`);
    if (!r) return; // Mes sin informe: la fila queda en blanco.

    setCheck(form, `901_${row}`, r.participated);
    setText(form, `902_${row}`, r.bibleStudies > 0 ? String(r.bibleStudies) : "");
    setCheck(form, `903_${row}`, r.auxiliaryPioneer);
    const hours = r.hours ?? 0;
    setText(form, `904_${row}`, hours > 0 ? String(hours) : "");
    setText(form, `905_${row}`, r.comment ?? "");
    totalHours += hours;
  });

  setText(form, `904_${TOTAL_ROW}`, totalHours > 0 ? String(totalHours) : "");

  // Deja los valores visibles aunque el lector no regenere apariencias.
  form.updateFieldAppearances();
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
