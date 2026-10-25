// ============================================================================
//  Planilla de publicadores: se genera la plantilla vacía y se lee la rellena.
//
//  Módulo PURO (sin base de datos) para poder probarlo aislado. Las columnas
//  son exactamente los campos del formulario "Nuevo Publicador", y los valores
//  admitidos son los mismos que valida publisherSchema: así la planilla no
//  puede meter nada que el formulario rechazaría.
// ============================================================================

import type ExcelJS from "exceljs";
import {
  PUBLISHER_STATUS_LABELS,
  PUBLISHER_STATUS_VALUES,
  HOPE_LABELS,
  HOPE_VALUES,
  PRIVILEGE_LABELS,
  PRIVILEGE_VALUES,
  type PublisherStatus,
} from "@/lib/constants";

/** Columnas de la planilla, en orden. */
export const PUB_COLUMNS = [
  { key: "fullName", header: "Nombre completo", width: 34, required: true },
  { key: "groupNumber", header: "Número de grupo", width: 16, required: true },
  { key: "status", header: "Situación", width: 26, required: true },
  { key: "sex", header: "Sexo (H/M)", width: 12, required: false },
  { key: "birthDate", header: "Fecha de nacimiento", width: 20, required: false },
  { key: "baptismDate", header: "Fecha de bautismo", width: 20, required: false },
  { key: "hope", header: "Esperanza", width: 20, required: false },
  { key: "privilege", header: "Privilegio", width: 22, required: false },
] as const;

/** Lo que se lee de una fila, ya normalizado. */
export type PublisherRow = {
  /** Fila del Excel, para poder señalarla en los errores. */
  row: number;
  fullName: string;
  groupNumber: number | null;
  status: string;
  sex: "M" | "F" | null;
  /** "aaaa-mm-dd" o null. */
  birthDate: string | null;
  baptismDate: string | null;
  hope: string | null;
  privilege: string | null;
};

export type RowError = { row: number; column: string; message: string };

export type ParseResult = {
  rows: PublisherRow[];
  errors: RowError[];
};

// ---------------------------------------------------------------------------
//  Lectura de celdas
// ---------------------------------------------------------------------------
function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return isoDate(value);
  if (typeof value === "object") {
    const v = value as { text?: string; result?: unknown; richText?: unknown[] };
    if (typeof v.text === "string") return v.text;
    if (v.result != null) return String(v.result);
    if (Array.isArray(v.richText))
      return v.richText.map((t) => (t as { text?: string }).text ?? "").join("");
  }
  return String(value);
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

const norm = (s: string) =>
  clean(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function isoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Fecha escrita a mano. Se admite lo que la gente usa de verdad:
 * "12/03/1980", "12-03-1980" y "1980-03-12", además de una fecha real de Excel.
 * Día y mes en ese orden (formato de Chile), nunca al revés.
 */
export function parseFecha(raw: string): string | null | undefined {
  const t = clean(raw);
  if (!t) return null;

  // Ya viene en aaaa-mm-dd (o es una fecha de Excel, ya convertida arriba).
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return armar(Number(m[1]), Number(m[2]), Number(m[3]));

  // dd/mm/aaaa o dd-mm-aaaa
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return armar(Number(m[3]), Number(m[2]), Number(m[1]));

  return undefined; // no se entiende
}

function armar(y: number, mo: number, d: number): string | undefined {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  const fecha = new Date(y, mo - 1, d, 12, 0, 0);
  // Rechaza el 31 de febrero y similares.
  if (fecha.getMonth() !== mo - 1 || fecha.getDate() !== d) return undefined;
  if (y < 1900 || y > new Date().getFullYear()) return undefined;
  return isoDate(fecha);
}

/** Busca un valor de lista por su etiqueta o por su clave interna. */
function porEtiqueta(
  raw: string,
  valores: readonly string[],
  etiquetas: Record<string, string>,
): string | null | undefined {
  const t = norm(raw);
  if (!t) return null;
  for (const v of valores) {
    if (norm(v) === t || norm(etiquetas[v] ?? "") === t) return v;
  }
  return undefined;
}

/** Sexo: se acepta H/V/M para hombre y M/F para mujer, como lo escribe la gente. */
export function parseSexo(raw: string): "M" | "F" | null | undefined {
  const t = norm(raw);
  if (!t) return null;
  if (["h", "v", "hombre", "varon", "masculino"].includes(t)) return "M";
  if (["f", "mujer", "femenino", "hermana"].includes(t)) return "F";
  // "M" es ambiguo en español (masculino / mujer). En la plantilla la columna
  // dice "Sexo (H/M)", así que M = Mujer.
  if (t === "m") return "F";
  return undefined;
}

// ---------------------------------------------------------------------------
//  Plantilla vacía
// ---------------------------------------------------------------------------
/** Rellena un libro con la plantilla: encabezados, anchos y una hoja de ayuda. */
export function buildPublishersTemplate(wb: ExcelJS.Workbook): void {
  const ws = wb.addWorksheet("Publicadores");
  ws.columns = PUB_COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
  }));

  const cabecera = ws.getRow(1);
  cabecera.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cabecera.height = 22;
  cabecera.alignment = { vertical: "middle" };
  for (let i = 1; i <= PUB_COLUMNS.length; i++) {
    const celda = cabecera.getCell(i);
    celda.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F766E" }, // el verde de la aplicación
    };
    // Las obligatorias se marcan, para que se vea de un vistazo.
    if (PUB_COLUMNS[i - 1].required) celda.value = `${PUB_COLUMNS[i - 1].header} *`;
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];

  // Hoja con los valores admitidos: evita tener que adivinarlos.
  const ayuda = wb.addWorksheet("Valores admitidos");
  ayuda.columns = [
    { header: "Columna", key: "col", width: 24 },
    { header: "Qué escribir", key: "val", width: 60 },
  ];
  ayuda.getRow(1).font = { bold: true };
  const filas: [string, string][] = [
    ["Nombre completo *", "Obligatorio. Tal como debe aparecer en la aplicación."],
    [
      "Número de grupo *",
      "Obligatorio. Solo el número (1, 2, 3…). El grupo debe existir ya en Grupos.",
    ],
    [
      "Situación *",
      `Obligatorio. Una de: ${PUBLISHER_STATUS_VALUES.map(
        (v) => PUBLISHER_STATUS_LABELS[v as PublisherStatus],
      ).join(" · ")}`,
    ],
    ["Sexo (H/M)", "Opcional. H = hombre, M = mujer. Se puede dejar vacío."],
    ["Fecha de nacimiento", "Opcional. dd/mm/aaaa (por ejemplo 12/03/1980)."],
    ["Fecha de bautismo", "Opcional. dd/mm/aaaa. Vacío si no está bautizado."],
    [
      "Esperanza",
      `Opcional. ${HOPE_VALUES.map((v) => HOPE_LABELS[v as keyof typeof HOPE_LABELS]).join(" · ")}`,
    ],
    [
      "Privilegio",
      `Opcional. ${PRIVILEGE_VALUES.map(
        (v) => PRIVILEGE_LABELS[v as keyof typeof PRIVILEGE_LABELS],
      ).join(" · ")}`,
    ],
  ];
  for (const [col, val] of filas) ayuda.addRow({ col, val });
  ayuda.getColumn("val").alignment = { wrapText: true, vertical: "top" };
}

// ---------------------------------------------------------------------------
//  Lectura de la planilla rellena
// ---------------------------------------------------------------------------
export function parsePublishersSheet(wb: ExcelJS.Workbook): ParseResult {
  const ws =
    wb.getWorksheet("Publicadores") ?? wb.worksheets[0] ?? null;
  if (!ws) {
    return {
      rows: [],
      errors: [{ row: 0, column: "", message: "El archivo no tiene ninguna hoja." }],
    };
  }

  // La posición de cada columna se busca por su encabezado, para que mover una
  // columna de sitio no estropee la lectura.
  const indice = new Map<string, number>();
  const cab = ws.getRow(1);
  for (let c = 1; c <= Math.max(ws.columnCount, PUB_COLUMNS.length); c++) {
    const t = norm(cellText(cab.getCell(c).value)).replace(/\s*\*$/, "");
    if (!t) continue;
    const col = PUB_COLUMNS.find((x) => norm(x.header) === t);
    if (col && !indice.has(col.key)) indice.set(col.key, c);
  }

  const faltan = PUB_COLUMNS.filter((c) => c.required && !indice.has(c.key));
  if (faltan.length > 0) {
    return {
      rows: [],
      errors: faltan.map((c) => ({
        row: 1,
        column: c.header,
        message: `Falta la columna "${c.header}" en la primera fila.`,
      })),
    };
  }

  const rows: PublisherRow[] = [];
  const errors: RowError[] = [];
  const vistos = new Map<string, number>(); // nombre normalizado -> fila

  const leer = (r: number, key: string) => {
    const c = indice.get(key);
    return c ? cellText(ws.getRow(r).getCell(c).value) : "";
  };

  for (let r = 2; r <= ws.rowCount; r++) {
    const fullName = clean(leer(r, "fullName"));
    const grupoTxt = clean(leer(r, "groupNumber"));
    const statusTxt = clean(leer(r, "status"));
    const sexoTxt = leer(r, "sex");
    const nacTxt = leer(r, "birthDate");
    const bauTxt = leer(r, "baptismDate");
    const espTxt = leer(r, "hope");
    const privTxt = leer(r, "privilege");

    // Fila completamente vacía: se salta sin avisar (son normales al final).
    if (
      !fullName && !grupoTxt && !statusTxt && !clean(sexoTxt) &&
      !clean(nacTxt) && !clean(bauTxt) && !clean(espTxt) && !clean(privTxt)
    ) {
      continue;
    }

    const errorsAntes = errors.length;

    if (fullName.length < 2) {
      errors.push({
        row: r,
        column: "Nombre completo",
        message: "Falta el nombre completo.",
      });
    } else {
      const k = norm(fullName);
      const previa = vistos.get(k);
      if (previa) {
        errors.push({
          row: r,
          column: "Nombre completo",
          message: `"${fullName}" ya aparece en la fila ${previa} de esta misma planilla.`,
        });
      } else {
        vistos.set(k, r);
      }
    }

    let groupNumber: number | null = null;
    if (!grupoTxt) {
      errors.push({
        row: r,
        column: "Número de grupo",
        message: "Falta el número de grupo.",
      });
    } else {
      // Se admite "3" y también "Grupo 3".
      const m = grupoTxt.match(/(\d{1,3})/);
      if (!m) {
        errors.push({
          row: r,
          column: "Número de grupo",
          message: `"${grupoTxt}" no es un número de grupo.`,
        });
      } else {
        groupNumber = Number(m[1]);
      }
    }

    const status = porEtiqueta(
      statusTxt,
      PUBLISHER_STATUS_VALUES,
      PUBLISHER_STATUS_LABELS as Record<string, string>,
    );
    if (!statusTxt) {
      errors.push({ row: r, column: "Situación", message: "Falta la situación." });
    } else if (status === undefined) {
      errors.push({
        row: r,
        column: "Situación",
        message: `"${statusTxt}" no es una situación válida. Mira la hoja "Valores admitidos".`,
      });
    }

    const sex = parseSexo(sexoTxt);
    if (sex === undefined) {
      errors.push({
        row: r,
        column: "Sexo (H/M)",
        message: `"${clean(sexoTxt)}" no se entiende. Escribe H o M, o déjalo vacío.`,
      });
    }

    const birthDate = parseFecha(nacTxt);
    if (birthDate === undefined) {
      errors.push({
        row: r,
        column: "Fecha de nacimiento",
        message: `"${clean(nacTxt)}" no es una fecha. Usa dd/mm/aaaa.`,
      });
    }
    const baptismDate = parseFecha(bauTxt);
    if (baptismDate === undefined) {
      errors.push({
        row: r,
        column: "Fecha de bautismo",
        message: `"${clean(bauTxt)}" no es una fecha. Usa dd/mm/aaaa.`,
      });
    }

    const hope = porEtiqueta(espTxt, HOPE_VALUES, HOPE_LABELS as Record<string, string>);
    if (hope === undefined) {
      errors.push({
        row: r,
        column: "Esperanza",
        message: `"${clean(espTxt)}" no es un valor válido.`,
      });
    }
    const privilege = porEtiqueta(
      privTxt,
      PRIVILEGE_VALUES,
      PRIVILEGE_LABELS as Record<string, string>,
    );
    if (privilege === undefined) {
      errors.push({
        row: r,
        column: "Privilegio",
        message: `"${clean(privTxt)}" no es un valor válido.`,
      });
    }

    // Solo entran las filas sin ningún error.
    if (errors.length === errorsAntes) {
      rows.push({
        row: r,
        fullName,
        groupNumber,
        status: status as string,
        sex: sex as "M" | "F" | null,
        birthDate: birthDate as string | null,
        baptismDate: baptismDate as string | null,
        hope: hope as string | null,
        privilege: privilege as string | null,
      });
    }
  }

  return { rows, errors };
}
