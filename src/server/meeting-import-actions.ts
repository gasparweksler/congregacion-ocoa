"use server";

// ============================================================================
//  Carga masiva de reuniones desde el Excel del programa "Vida y Ministerio".
//  Crea una reunión de Jueves por semana, con:
//   - Título de cada parte tal cual el Excel (incluido el número).
//   - Nombre del hermano detectado (editable después).
//   - Etiqueta de la semana por rango de días (ej. "20-26 de Julio").
//  Acceso: Administrador o Responsable de Confirmaciones.
// ============================================================================

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMeetingsAccess } from "@/lib/access";
import { slotsForDay, MEETING_DAYS, CONFIRM_STATUS } from "@/lib/constants";
import { logAudit } from "@/lib/audit";
import { type FormState } from "@/server/actions-shared";

const MESES: Record<string, number> = {
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
  JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
};

function newToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

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

function nameAt(ws: ExcelJS.Worksheet, r: number, cols: number[]): string {
  for (const c of cols) {
    const t = raw(cellText(ws.getRow(r).getCell(c).value));
    if (t) return t;
  }
  return "";
}

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
type Week = {
  date: Date;
  label: string;
  pres: string;
  orac: string;
  clos: string;
  tesoros: Part[];
  smm: Part[];
  vc: Part[];
};

function parseVymc(wb: ExcelJS.Workbook): Week[] {
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
        const name = nameAt(ws, r, [8, 9]);
        const c5 = nameAt(ws, r, [5, 6]);
        // Auxiliar: la fila siguiente sin número pero con nombre en C8.
        let name2 = "";
        const next1 = raw(cellText(ws.getRow(r + 1).getCell(1).value));
        if (!next1) name2 = nameAt(ws, r + 1, [8, 9]);
        const item: Part = { label: c1, name, name2, c5 };
        (section === "S" ? cur.smm : section === "V" ? cur.vc : cur.tesoros).push(item);
        continue;
      }

      if (c1.startsWith("●")) {
        if (/conclusi/i.test(c1)) {
          cur.clos = nameAt(ws, r, [8, 9]);
        } else if (section === null && /canci[oó]n|oraci[oó]n/i.test(c1)) {
          cur.orac = nameAt(ws, r, [3, 4]); // quien hace canción + oración
          cur.pres = nameAt(ws, r, [8, 9]); // quien hace "Palabras de introd." = presidente
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

type SlotData = { label?: string; p?: string; s?: string };

function buildSlotData(w: Week): Record<string, SlotData> {
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
        "No se reconocieron semanas. Debe ser el programa Vida y Ministerio (con encabezados tipo 'SEMANA 6-12 DE JULIO').",
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

    const data = buildSlotData(w);
    const assignments = juevesSlots
      .map((s, i) => {
        const d = data[s.key] ?? {};
        const primaryName = d.p || null;
        const secondaryName = s.allowTwo ? d.s || null : null;
        // Solo se crean las asignaciones con datos del Excel (título o nombre);
        // las que quedarían vacías no se crean.
        if (!d.label && !primaryName && !secondaryName) return null;
        return {
          slotKey: s.key,
          section: s.section,
          label: d.label ?? s.label,
          order: i,
          allowTwo: s.allowTwo,
          equalPair: !!s.equalPair,
          primaryName,
          primaryToken: primaryName ? newToken() : null,
          primaryStatus: CONFIRM_STATUS.PENDIENTE,
          secondaryName,
          secondaryToken: secondaryName ? newToken() : null,
          secondaryStatus: CONFIRM_STATUS.PENDIENTE,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);

    await prisma.meeting.create({
      data: {
        date: w.date,
        day: MEETING_DAYS.JUEVES,
        weekLabel: w.label,
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
      `Se crearon ${created} reunión(es) de Jueves con títulos y nombres.` +
      (skipped ? ` ${skipped} ya existían y se omitieron.` : ""),
  };
}
