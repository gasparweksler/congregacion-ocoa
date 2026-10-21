// Diagnóstico: vuelca texto y campos de formulario de una tarjeta de publicador.
import { readFileSync } from "node:fs";
import { installPdfNodePolyfills } from "../src/lib/pdf-node-polyfills.js";

installPdfNodePolyfills();
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
(globalThis as any).pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");

const data = new Uint8Array(readFileSync(process.argv[2]));
const doc = await pdfjs.getDocument({ data, useSystemFonts: false, disableFontFace: true }).promise;
console.log("páginas:", doc.numPages);

const fields = await doc.getFieldObjects();
console.log("\n--- CAMPOS DE FORMULARIO ---");
if (!fields) console.log("(ninguno)");
else {
  for (const [name, arr] of Object.entries(fields)) {
    for (const f of arr as any[]) {
      console.log(
        JSON.stringify({ name, type: f.type, value: f.value, exportValues: f.exportValues, page: f.page }),
      );
    }
  }
}

console.log("\n--- TEXTO (por líneas) ---");
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const items = (await page.getTextContent()).items as any[];
  const lines: { y: number; parts: string[] }[] = [];
  const sorted = items
    .filter((i) => i.str?.trim())
    .sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.transform[5]) <= 3) last.parts.push(it.str);
    else lines.push({ y: it.transform[5], parts: [it.str] });
  }
  for (const l of lines) console.log(`p${p}`, l.parts.join(" | "));
}
