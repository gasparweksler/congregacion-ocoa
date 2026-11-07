// Prueba de ida y vuelta del lector de PDF de responsabilidades:
// genera el PDF con el MISMO código que usa /api/responsabilidades-pdf
// (src/lib/responsabilidades-pdf.ts) y verifica que el parser recupere
// exactamente los mismos nombres y fechas.
//   npx tsx scripts/test-resp-pdf.mts
//   LONG=1 npx tsx scripts/test-resp-pdf.mts   (nombres largos, dos renglones)
//   PALETA=verdes npx tsx scripts/test-resp-pdf.mts
//   GUARDAR=ruta.pdf npx tsx scripts/test-resp-pdf.mts   (deja el PDF en disco)
import { writeFileSync } from "node:fs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { parseResponsibilitiesPdf, type PdfItem } from "../src/lib/resp-pdf-parser.js";
import {
  dibujarResponsabilidades,
  type FilaResponsabilidad,
} from "../src/lib/responsabilidades-pdf.js";

// --- Datos de prueba: septiembre 2026 (jueves 3,10,17,24 / sábados 5,12,19,26)
type Row = { dateISO: string; day: "JUEVES" | "SABADO"; v: Record<string, string> };
// LONG=1 fuerza nombres largos que autoTable parte en dos renglones dentro de
// la misma celda: comprueba que el parser los vuelva a unir.
const LONG = process.env.LONG === "1";
const N = (i: number) =>
  LONG ? `Juan Carlos Rodríguez Martínez ${i}` : `Hermano Apellido${i}`;
const dates: [number, "JUEVES" | "SABADO"][] = [
  [3, "JUEVES"], [5, "SABADO"], [10, "JUEVES"], [12, "SABADO"],
  [17, "JUEVES"], [19, "SABADO"], [24, "JUEVES"], [26, "SABADO"],
];
// Limpieza con celdas combinadas: Grupo 1 x3, Grupo 2 x2, Grupo 3 x3.
const limpieza = ["Grupo 1", "Grupo 1", "Grupo 1", "Grupo 2", "Grupo 2", "Grupo 3", "Grupo 3", "Grupo 3"];
const rows: Row[] = dates.map(([d, day], i) => ({
  dateISO: `2026-09-${String(d).padStart(2, "0")}`,
  day,
  v: {
    r_audio: N(i * 8 + 1),
    r_video: N(i * 8 + 2),
    r_microfono: N(i * 8 + 3),
    r_microfono_2: N(i * 8 + 4),
    r_acom_plataforma: N(i * 8 + 5),
    r_acom_entrada: N(i * 8 + 6),
    r_acom_auditorio: N(i * 8 + 7),
    r_limpieza: limpieza[i],
  },
}));

// --- Generación del PDF (el código de verdad, sin copias) ---
const filas: FilaResponsabilidad[] = rows.map((r) => ({
  dateISO: r.dateISO,
  audio: r.v.r_audio,
  video: r.v.r_video,
  microfono: [r.v.r_microfono, r.v.r_microfono_2].filter(Boolean).join(" / "),
  plataforma: r.v.r_acom_plataforma,
  entrada: r.v.r_acom_entrada,
  auditorio: r.v.r_acom_auditorio,
  limpieza: r.v.r_limpieza,
}));

const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
dibujarResponsabilidades(doc, autoTable, {
  periodo: "SEPTIEMBRE 2026",
  // La misma línea con el nombre de la congregación que lleva el PDF real: si
  // el lector no la ignorara, leería mal la tabla.
  congregacion: "Congregación Ocoa",
  filas,
  paleta: process.env.PALETA ?? "azules",
});

const bytes = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
if (process.env.GUARDAR) {
  writeFileSync(process.env.GUARDAR, bytes);
  console.log(`PDF guardado en ${process.env.GUARDAR} (${bytes.length} bytes)`);
}

// --- Lectura y comparación ---
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const pdf = await pdfjs.getDocument({ data: bytes, useSystemFonts: false, disableFontFace: true }).promise;
const items: PdfItem[] = [];
for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  const c = await page.getTextContent();
  for (const item of c.items) {
    const raw = item as { str?: string; transform?: number[]; width?: number };
    if (!raw.str?.trim() || !raw.transform) continue;
    items.push({ text: raw.str, x: raw.transform[4], y: raw.transform[5], width: raw.width ?? 0, page: p });
  }
}
console.log(`Páginas: ${pdf.numPages} · fragmentos de texto leídos: ${items.length}`);

const validDates = rows.map((r) => ({ dateISO: r.dateISO, day: r.day }));
const parsed = parseResponsibilitiesPdf(items, validDates);

let ok = 0, bad = 0;
for (const expected of rows) {
  const got = parsed.rows.find((r) => r.dateISO === expected.dateISO);
  if (!got) { console.log(`❌ FALTA la fecha ${expected.dateISO}`); bad += 8; continue; }
  for (const [k, want] of Object.entries(expected.v)) {
    const have = (got.values[k] ?? "").trim();
    if (have === want) ok++;
    else { bad++; console.log(`❌ ${expected.dateISO} ${k}: esperado "${want}" / leído "${have}"`); }
  }
}
console.log(`\nFilas leídas: ${parsed.rows.length}/${rows.length}`);
console.log(`Celdas correctas: ${ok} · incorrectas: ${bad}`);
if (parsed.warnings.length) console.log("Avisos:", parsed.warnings);
process.exit(bad === 0 && parsed.rows.length === rows.length ? 0 : 1);
