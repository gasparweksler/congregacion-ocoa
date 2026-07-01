"use server";

// ============================================================================
//  Carga masiva de reuniones desde Excel.
//  Soporta el formato del programa "Vida y Ministerio Cristianos" (VyMC): una
//  hoja con las semanas una debajo de otra (encabezado "SEMANA d-d DE MES",
//  secciones en mayúsculas y partes numeradas). Crea una reunión de Jueves por
//  semana, con el título de cada parte, dejando los hermanos sin asignar.
//  Acceso: Administrador o Responsable de Confirmaciones.
// ============================================================================

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMeetingsAccess } from "@/lib/access";
import { slotsForDay, MEETING_DAYS } from "@/lib/constants";
import { logAudit } from "@/lib/audit";
import { type FormState } from "@/server/actions-shared";

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

function clean(s: string): string {
  return s
    .replace(/\(\s*\d+\s*min[^)]*\)?/gi, "") // quitar "(10 mins.)" / "(30 mins"
    .replace(/\s+/g, " ")
    .replace(/^[.:\s]+/, "")
    .replace(/[:.\s]+$/, "")
    .trim();
}

// Nota: los nombres de mes en español no llevan acento (julio, agosto, ...),
// por eso basta [A-Za-z]. Se usan códigos Unicode para los guiones largos.
function weekDate(c1: string, year: number): Date | null {
  // "SEMANA 6-12 DE JULIO"
  let m = c1.match(/SEMANA\s+(\d+)\s*[-–—]\s*\d+\s+DE\s+([A-Za-z]+)/i);
  if (m) {
    const mes = MESES[m[2].toUpperCase()];
    if (mes) return new Date(year, mes - 1, Number(m[1]), 12, 0, 0);
  }
  // "SEMANA 27 DE JULIO A 2 DE AGOSTO"
  m = c1.match(/SEMANA\s+(\d+)\s+DE\s+([A-Za-z]+)\s+A\s+\d+\s+DE\s+[A-Za-z]+/i);
  if (m) {
    const mes = MESES[m[2].toUpperCase()];
    if (mes) return new Date(year, mes - 1, Number(m[1]), 12, 0, 0);
  }
  return null;
}

type Week = {
  date: Date;
  tesoros: string[];
  smm: string[];
  vc: string[];
  opening: string | null;
  closing: string | null;
};

function parseVymc(wb: ExcelJS.Workbook): Week[] {
  const weeks: Week[] = [];
  for (const ws of wb.worksheets) {
    const ym = ws.name.match(/(\d{4})/);
    const year = ym ? Number(ym[1]) : new Date().getFullYear();
    let cur: Week | null = null;
    let section: "T" | "S" | "V" | null = null;

    for (let r = 1; r <= ws.rowCount; r++) {
      const c1 = cellText(ws.getRow(r).getCell(1).value).trim();
      if (!c1) continue;

      if (/^SEMANA\b/i.test(c1)) {
        section = null;
        const d = weekDate(c1, year);
        if (d) {
          cur = { date: d, tesoros: [], smm: [], vc: [], opening: null, closing: null };
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

      const pm = c1.match(/^(\d+)\.\s*(.*)$/);
      if (pm) {
        const t = clean(pm[2]);
        (section === "S" ? cur.smm : section === "V" ? cur.vc : cur.tesoros).push(t);
        continue;
      }
      if (c1.startsWith("●")) {
        if (/conclusi/i.test(c1)) cur.closing = clean(c1.replace(/^●/, ""));
        else if (section === null && /oraci[oó]n/i.test(c1))
          cur.opening = clean(c1.replace(/^●/, ""));
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

function buildOverrides(w: Week): Record<string, string> {
  const o: Record<string, string> = {};

  w.tesoros.forEach((t, i) => {
    if (t && TES_ORDER[i]) o[TES_ORDER[i]] = t;
  });

  const used = new Set<string>();
  for (const t of w.smm) {
    if (!t) continue;
    let key = smmSlotFor(t);
    if (!key || used.has(key)) key = SMM_ORDER.find((k) => !used.has(k)) ?? null;
    if (key) {
      o[key] = t;
      used.add(key);
    }
  }

  const talkSlots = ["j_vc_discurso1", "j_vc_discurso2"];
  let ti = 0;
  for (const t of w.vc) {
    if (!t) continue;
    if (/estudio b[ií]blico/i.test(t)) o["j_vc_conductor"] = t;
    else if (talkSlots[ti]) o[talkSlots[ti++]] = t;
  }

  if (w.opening) o["j_oracion_inicio"] = w.opening;
  if (w.closing) o["j_oracion_final"] = w.closing;
  return o;
}

export async function importMeetingsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireMeetingsAccess();

  const file = formData.get("file");
  if (!file || typeof file === "string" || file.size === 0) {
    return { error: "Selecciona un archivo Excel (.xlsx)." };
  }

  const wb = new ExcelJS.Workbook();
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
  } catch {
    return { error: "No se pudo leer el archivo. Debe ser un .xlsx válido." };
  }

  const weeks = parseVymc(wb);
  if (weeks.length === 0) {
    return {
      error:
        "No se reconocieron semanas en el archivo. Debe ser el programa Vida y Ministerio (con encabezados tipo 'SEMANA 6-12 DE JULIO').",
    };
  }

  const juevesSlots = slotsForDay(MEETING_DAYS.JUEVES);
  let created = 0;
  let skipped = 0;

  for (const w of weeks) {
    const existing = await prisma.meeting.findFirst({
      where: { day: MEETING_DAYS.JUEVES, date: w.date },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const ov = buildOverrides(w);
    const assignments = juevesSlots.map((s, i) => ({
      slotKey: s.key,
      section: s.section,
      label: ov[s.key] ?? s.label,
      order: i,
    }));

    await prisma.meeting.create({
      data: {
        date: w.date,
        day: MEETING_DAYS.JUEVES,
        createdById: user.id,
        confirmadorName: user.name ?? null,
        assignments: { create: assignments },
      },
    });
    created++;
  }

  await logAudit({
    userId: user.id,
    action: "CREAR",
    entity: "Reunion",
    details: `Importación VyMC: ${created} creada(s), ${skipped} omitida(s).`,
  });

  revalidatePath("/reuniones");
  return {
    success:
      `Se crearon ${created} reunión(es) de Jueves con sus títulos.` +
      (skipped ? ` ${skipped} ya existían y se omitieron.` : ""),
  };
}
