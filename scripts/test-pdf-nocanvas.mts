// Reproduce el fallo de producción: en Vercel no hay binario nativo de
// @napi-rs/canvas, así que pdfjs no puede rellenar DOMMatrix y revienta al
// cargarse ("ReferenceError: DOMMatrix is not defined").
// Este script comprueba que nuestros rellenos lo resuelven sin esa librería.
//   npx tsx scripts/test-pdf-nocanvas.mts "ruta\al\archivo.pdf"
import { readFileSync } from "node:fs";
import Module from "node:module";

// Simula el entorno de Vercel: cualquier require de @napi-rs/canvas falla.
const req = Module.prototype.require as unknown as (id: string) => unknown;
(Module.prototype as unknown as { require: (id: string) => unknown }).require =
  function (id: string) {
    if (id.startsWith("@napi-rs/canvas")) {
      throw new Error("Cannot find module '@napi-rs/canvas' (simulado)");
    }
    return req.call(this, id);
  };

const path = process.argv[2];
const withPolyfills = process.env.POLYFILLS !== "0";

if (withPolyfills) {
  const { installPdfNodePolyfills } = await import("../src/lib/pdf-node-polyfills.js");
  installPdfNodePolyfills();
}
console.log(`Rellenos: ${withPolyfills ? "SÍ" : "NO"} · DOMMatrix antes de importar: ${typeof (globalThis as any).DOMMatrix}`);

try {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(readFileSync(path));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: false, disableFontFace: true }).promise;
  let count = 0;
  const sample: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    for (const it of (await page.getTextContent()).items as any[]) {
      if (!it.str?.trim()) continue;
      count++;
      if (sample.length < 6) sample.push(it.str);
    }
  }
  console.log(`✅ OK · fragmentos: ${count}`);
  console.log("   muestra:", sample.join(" | "));
} catch (e) {
  console.log("❌ FALLA:", e instanceof Error ? e.message : e);
  process.exit(1);
}
