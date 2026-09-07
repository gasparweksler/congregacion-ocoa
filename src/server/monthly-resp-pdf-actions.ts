"use server";

// ============================================================================
//  "Cargar desde PDF" para la pantalla "Todas las Responsabilidades del mes".
//
//  Dos pasos separados, para que el administrador siempre revise antes de
//  guardar:
//    1. previewResponsibilitiesPdfAction: lee el PDF y devuelve una vista
//       previa (nada se guarda). Marca los nombres que no coinciden con ningún
//       publicador y avisa qué datos existentes se reemplazarían.
//    2. applyResponsibilitiesPdfAction: guarda lo confirmado usando EXACTAMENTE
//       la misma ruta que la edición manual (setMonthlyResponsibility), así que
//       las responsabilidades importadas quedan idénticas a las escritas a mano
//       y se sincronizan con "Reuniones" con la lógica actual.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { requireMeetingsAccess } from "@/lib/access";
import { MONTHLY_RESPONSIBILITIES } from "@/lib/constants";
import { meetingDatesInMonth } from "@/lib/period";
import { extractPdfItems } from "@/lib/pdf-text";
import { parseResponsibilitiesPdf } from "@/lib/resp-pdf-parser";
import {
  getMonthlyResponsibilities,
  setMonthlyResponsibility,
} from "@/server/monthly-resp-actions";

export type PdfPreviewCell = {
  slotKey: string;
  /** Valor leído del PDF (ya corregible por el administrador). */
  value: string;
  /** Valor que ya está guardado en la aplicación para esa fecha. */
  current: string;
  /** El PDF trae un valor distinto de uno ya guardado (se reemplazaría). */
  conflict: boolean;
  /** No coincide con ningún publicador (o grupo) registrado. */
  unknown: boolean;
};

export type PdfPreviewRow = {
  dateISO: string;
  day: "JUEVES" | "SABADO";
  cells: PdfPreviewCell[];
};

export type PdfPreviewResult = {
  ok: boolean;
  error?: string;
  rows: PdfPreviewRow[];
  warnings: string[];
  publishers: string[];
  groups: string[];
  conflictCount: number;
  unknownCount: number;
};

/** Normaliza un nombre para comparar sin acentos ni mayúsculas. */
function key(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const EMPTY: Omit<PdfPreviewResult, "ok" | "error"> = {
  rows: [],
  warnings: [],
  publishers: [],
  groups: [],
  conflictCount: 0,
  unknownCount: 0,
};

/** Paso 1: leer el PDF y devolver la vista previa (no guarda nada). */
export async function previewResponsibilitiesPdfAction(
  formData: FormData,
): Promise<PdfPreviewResult> {
  await requireMeetingsAccess();

  const year = Number(formData.get("anio"));
  const month = Number(formData.get("mes"));
  if (!year || !month || month < 1 || month > 12) {
    return { ok: false, error: "Mes inválido.", ...EMPTY };
  }

  const file = formData.get("file");
  if (!file || typeof file === "string" || file.size === 0) {
    return { ok: false, error: "Selecciona un archivo PDF.", ...EMPTY };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: "El PDF supera los 10 MB.", ...EMPTY };
  }

  let items;
  try {
    items = await extractPdfItems(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return {
      ok: false,
      error: "No se pudo leer el archivo. Debe ser un PDF válido (no una imagen escaneada).",
      ...EMPTY,
    };
  }
  if (items.length === 0) {
    return {
      ok: false,
      error:
        "El PDF no contiene texto seleccionable (parece un escaneo o una imagen). No es posible leer los nombres.",
      ...EMPTY,
    };
  }

  const validDates = meetingDatesInMonth(year, month).map(({ date, day }) => ({
    dateISO: `${year}-${String(month).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    day,
  }));

  const parsed = parseResponsibilitiesPdf(items, validDates);

  const [publishersRaw, groupsRaw, currentRows] = await Promise.all([
    prisma.publisher.findMany({
      orderBy: { fullName: "asc" },
      select: { fullName: true },
    }),
    prisma.group.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
    getMonthlyResponsibilities(year, month),
  ]);
  const publishers = publishersRaw.map((p) => p.fullName);
  const groups = groupsRaw.map((g) => g.name);
  const publisherKeys = new Set(publishers.map(key));
  const groupKeys = new Set(groups.map(key));
  const currentByDate = new Map(currentRows.map((r) => [r.dateISO, r]));

  let conflictCount = 0;
  let unknownCount = 0;

  const rows: PdfPreviewRow[] = parsed.rows.map((r) => {
    const current = currentByDate.get(r.dateISO);
    const cells = MONTHLY_RESPONSIBILITIES.map((resp) => {
      const value = (r.values[resp.key] ?? "").trim();
      const cur = (current?.values[resp.key]?.name ?? "").trim();
      const conflict = !!value && !!cur && key(value) !== key(cur);
      // No se inventan nombres: si no coincide con un publicador/grupo
      // registrado, se marca para que el administrador lo revise.
      const unknown =
        !!value &&
        (resp.kind === "group"
          ? !groupKeys.has(key(value))
          : !publisherKeys.has(key(value)));
      if (conflict) conflictCount++;
      if (unknown) unknownCount++;
      return { slotKey: resp.key, value, current: cur, conflict, unknown };
    });
    return { dateISO: r.dateISO, day: r.day, cells };
  });

  return {
    ok: rows.length > 0,
    error: rows.length === 0 ? parsed.warnings[0] : undefined,
    rows,
    warnings: parsed.warnings,
    publishers,
    groups,
    conflictCount,
    unknownCount,
  };
}

export type ApplyEntry = {
  dateISO: string;
  day: "JUEVES" | "SABADO";
  values: Record<string, string>;
};

/** Paso 2: guardar la vista previa confirmada por el administrador. */
export async function applyResponsibilitiesPdfAction(
  entries: ApplyEntry[],
): Promise<{ saved: number; error?: string }> {
  await requireMeetingsAccess();

  const allowed = new Set(MONTHLY_RESPONSIBILITIES.map((r) => r.key));
  let saved = 0;

  for (const entry of entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.dateISO)) continue;
    if (entry.day !== "JUEVES" && entry.day !== "SABADO") continue;
    for (const [slotKey, raw] of Object.entries(entry.values)) {
      if (!allowed.has(slotKey)) continue;
      const value = (raw ?? "").trim();
      // Solo se escribe lo que trae valor: nunca se borra lo ya guardado.
      if (!value) continue;
      await setMonthlyResponsibility(entry.dateISO, entry.day, slotKey, value);
      saved++;
    }
  }

  return { saved };
}
