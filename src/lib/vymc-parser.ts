// ============================================================================
//  Parseo del Excel del programa "Vida y Ministerio Cristianos" (VyMC).
//  Módulo puro (sin acceso a base de datos) para poder probarlo de forma
//  aislada. Lo usa la carga masiva de reuniones.
//
//  Formatos soportados: el título de cada parte puede venir en una celda
//  COMBINADA que abarca varias columnas (hasta la 8), con el nombre del
//  hermano en la columna 9; o el nombre directamente en la columna 8.
// ============================================================================

import type ExcelJS from "exceljs";

const MESES: Record<string, number> = {
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
  JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
};

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const v = value as { text?: string; result?: unknown; richText?: unknown[] };
    if (typeof v.text === "string") return v.text;
    if (v.result != null) return String(v.result);
    if (Array.isArray(v.richText))
      return v.richText.map((t) => (t as { text?: string }).text ?? "").join("");
  }
  return String(value);
}

function raw(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function titleCase(s: string): string {
  const l = s.toLowerCase();
  return l.charAt(0).toUpperCase() + l.slice(1);
}

/**
 * Lee un nombre de la fila `r` probando las columnas en orden.
 * `exclude` evita tomar el texto de una celda COMBINADA que repite el título
 * de la parte (según el archivo, el título puede abarcar hasta la columna 8).
 */
function nameAt(
  ws: ExcelJS.Worksheet,
  r: number,
  cols: number[],
  exclude = "",
): string {
  for (const c of cols) {
    const t = raw(cellText(ws.getRow(r).getCell(c).value));
    if (!t) continue;
    if (exclude && t === exclude) continue; // celda combinada con el título
    if (looksLikeLabel(t)) continue; // "1. …", "• …", "Lector:" no son nombres
    return t;
  }
  return "";
}

/** Un nombre nunca empieza con viñeta/numeración ni termina en ":". */
function looksLikeLabel(t: string): boolean {
  return /^[•●▪◦·]/.test(t) || /^\d+\.\s/.test(t) || t.endsWith(":");
}

// Columnas donde puede venir el nombre, de derecha a izquierda: algunos
// archivos lo ponen en la 9 (título combinado 1-8) y otros en la 8.
const NAME_COLS = [9, 8];

// Viñeta de las líneas de canción/oración: los archivos usan • o ● indistintamente.
const BULLET = /^[•●▪◦·*-]\s*/;

function parseWeek(
  c1: string,
  year: number,
): { date: Date; label: string } | null {
  // "SEMANA 6-12 DE JULIO"
  let m = c1.match(/SEMANA\s+(\d+)\s*[-–—]\s*(\d+)\s+DE\s+([A-Za-z]+)/i);
  if (m) {
    const mo = MESES[m[3].toUpperCase()];
    if (mo)
      return {
        date: new Date(year, mo - 1, Number(m[1]), 12, 0, 0),
        label: `${m[1]}-${m[2]} de ${titleCase(m[3])}`,
      };
  }
  // "SEMANA 27 DE JULIO A 2 DE AGOSTO"
  m = c1.match(/SEMANA\s+(\d+)\s+DE\s+([A-Za-z]+)\s+A\s+(\d+)\s+DE\s+([A-Za-z]+)/i);
  if (m) {
    const mo = MESES[m[2].toUpperCase()];
    if (mo)
      return {
        date: new Date(year, mo - 1, Number(m[1]), 12, 0, 0),
        label: `${m[1]} de ${titleCase(m[2])} a ${m[3]} de ${titleCase(m[4])}`,
      };
  }
  return null;
}

type Part = { label: string; name: string; name2: string; c5: string };
export type Week = {
  date: Date;
  label: string;
  pres: string;
  orac: string;
  clos: string;
  tesoros: Part[];
  smm: Part[];
  vc: Part[];
};

export function parseVymc(wb: ExcelJS.Workbook): Week[] {
  const weeks: Week[] = [];
  for (const ws of wb.worksheets) {
    const ym = ws.name.match(/(\d{4})/);
    const year = ym ? Number(ym[1]) : new Date().getFullYear();
    let cur: Week | null = null;
    let section: "T" | "S" | "V" | null = null;

    for (let r = 1; r <= ws.rowCount; r++) {
      const c1 = raw(cellText(ws.getRow(r).getCell(1).value));
      if (!c1) continue;

      if (/^SEMANA\b/i.test(c1)) {
        section = null;
        const w = parseWeek(c1, year);
        if (w) {
          cur = {
            date: w.date, label: w.label, pres: "", orac: "", clos: "",
            tesoros: [], smm: [], vc: [],
          };
          weeks.push(cur);
        } else {
          cur = null; // semana plantilla sin fecha => se ignora
        }
        continue;
      }
      if (!cur) continue;

      const u = c1.toUpperCase();
      if (u.includes("TESOROS DE LA BIBLIA")) { section = "T"; continue; }
      if (u.includes("SEAMOS MEJORES MAESTROS")) { section = "S"; continue; }
      if (u.includes("NUESTRA VIDA CRISTIANA")) { section = "V"; continue; }

      if (/^\d+\.\s/.test(c1)) {
        // Se excluye `c1` porque el título puede venir combinado hasta la col. 8.
        const name = nameAt(ws, r, NAME_COLS, c1);
        const c5 = nameAt(ws, r, [5, 6], c1);
        // Auxiliar: la fila siguiente sin número pero con nombre.
        let name2 = "";
        const next1 = raw(cellText(ws.getRow(r + 1).getCell(1).value));
        if (!next1) name2 = nameAt(ws, r + 1, NAME_COLS, c1);
        const item: Part = { label: c1, name, name2, c5 };
        (section === "S" ? cur.smm : section === "V" ? cur.vc : cur.tesoros).push(item);
        continue;
      }

      if (BULLET.test(c1)) {
        if (/conclusi/i.test(c1)) {
          cur.clos = nameAt(ws, r, NAME_COLS, c1);
        } else if (section === null && /canci[oó]n|oraci[oó]n/i.test(c1)) {
          // Canción + oración inicial; y "Palabras de introd." = presidente.
          cur.orac = nameAt(ws, r, [3, 4], c1);
          cur.pres = nameAt(ws, r, NAME_COLS, c1);
        }
      }
    }
  }
  return weeks;
}

function smmSlotFor(label: string): string | null {
  const l = label.toLowerCase();
  if (l.includes("conversacion")) return "j_smm_conversaciones";
  if (l.includes("revisita")) return "j_smm_revisitas";
  if (l.includes("discipul")) return "j_smm_discipulos";
  if (l.includes("creencia")) return "j_smm_creencias";
  if (l.includes("discurso")) return "j_smm_discurso";
  return null;
}

const SMM_ORDER = [
  "j_smm_conversaciones", "j_smm_revisitas", "j_smm_discurso",
  "j_smm_discipulos", "j_smm_creencias",
];
const TES_ORDER = ["j_tesoros_discurso", "j_perlas", "j_lectura"];

export type SlotData = { label?: string; p?: string; s?: string };

export function buildSlotData(w: Week): Record<string, SlotData> {
  const map: Record<string, SlotData> = {};
  const set = (k: string, d: SlotData) => {
    map[k] = { ...map[k], ...d };
  };

  w.tesoros.forEach((p, i) => {
    const k = TES_ORDER[i];
    if (k) set(k, { label: p.label, p: p.name || undefined });
  });

  const used = new Set<string>();
  for (const p of w.smm) {
    let k = smmSlotFor(p.label);
    if (!k || used.has(k)) k = SMM_ORDER.find((x) => !used.has(x)) ?? null;
    if (k) {
      used.add(k);
      set(k, { label: p.label, p: p.name || undefined, s: p.name2 || undefined });
    }
  }

  const talk = ["j_vc_discurso1", "j_vc_discurso2"];
  let ti = 0;
  for (const p of w.vc) {
    if (/estudio b[ií]blico/i.test(p.label)) {
      set("j_vc_conductor", { label: p.label, p: p.c5 || undefined });
      if (p.name) set("j_vc_lector", { p: p.name }); // lector: mantiene su título
    } else {
      const k = talk[ti++];
      if (k) set(k, { label: p.label, p: p.name || undefined });
    }
  }

  // Presidente y oraciones: solo nombre, se conserva el título por defecto.
  if (w.pres) set("j_presidente", { p: w.pres });
  if (w.orac) set("j_oracion_inicio", { p: w.orac });
  if (w.clos) set("j_oracion_final", { p: w.clos });

  return map;
}

