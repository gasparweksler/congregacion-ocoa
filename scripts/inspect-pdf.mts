// Diagnóstico: vuelca los fragmentos de texto (con posición) de un PDF real y
// muestra qué entiende el parser de responsabilidades.
//   npx tsx scripts/inspect-pdf.mts "ruta\al\archivo.pdf" 2026 9
import { readFileSync } from "node:fs";
import { parseResponsibilitiesPdf, type PdfItem } from "../src/lib/resp-pdf-parser.js";

const [, , path, yearArg, monthArg] = process.argv;
const year = Number(yearArg), month = Number(monthArg);

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const data = new Uint8Array(readFileSync(path));
const pdf = await pdfjs.getDocument({ data, useSystemFonts: false, disableFontFace: true }).promise;

const items: PdfItem[] = [];
for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  const c = await page.getTextContent();
  for (const raw of c.items as any[]) {
    if (!raw.str?.trim()) continue;
    items.push({ text: raw.str, x: raw.transform[4], y: raw.transform[5], width: raw.width ?? 0, page: p });
  }
}
console.log(`Páginas: ${pdf.numPages} · fragmentos: ${items.length}\n`);

// Volcado por líneas
const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
let lastY = NaN, lastPage = -1, buf: string[] = [];
const flush = () => { if (buf.length) console.log(buf.join(" | ")); buf = []; };
for (const it of sorted) {
  if (it.page !== lastPage || Math.abs(it.y - lastY) > 3.5) {
    flush();
    lastY = it.y; lastPage = it.page;
    buf.push(`p${it.page} y=${it.y.toFixed(0)}`);
  }
  buf.push(`[x=${it.x.toFixed(0)},w=${it.width.toFixed(0)}] ${it.text}`);
}
flush();

// Fechas válidas del mes
const dates: { dateISO: string; day: "JUEVES" | "SABADO" }[] = [];
for (let d = 1; d <= new Date(year, month, 0).getDate(); d++) {
  const wd = new Date(year, month - 1, d).getDay();
  if (wd === 4 || wd === 6)
    dates.push({
      dateISO: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      day: wd === 4 ? "JUEVES" : "SABADO",
    });
}

console.log("\n=== Resultado del parser ===");
const parsed = parseResponsibilitiesPdf(items, dates);
console.log("Avisos:", parsed.warnings);
for (const r of parsed.rows) console.log(r.dateISO, r.day, r.values);
console.log(`Filas: ${parsed.rows.length}/${dates.length}`);
