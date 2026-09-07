// Reproduce el entorno de Vercel, donde fallan dos cosas que en local
// funcionan y por eso las pruebas pasaban y la web no:
//   1. No hay binario nativo de @napi-rs/canvas, así que pdfjs no puede
//      rellenar DOMMatrix y revienta al cargarse.
//   2. pdf.worker.mjs no se copia al despliegue, porque pdfjs lo carga por una
//      ruta dinámica que el empaquetador no analiza.
// Aquí se simulan ambas y se comprueba que la lectura del PDF sigue
// funcionando gracias a los rellenos y al worker importado explícitamente.
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
// FIX=0 desactiva todo; POLY=0 / WORKER=0 desactivan una sola corrección, para
// comprobar que cada una es realmente necesaria.
const fix = process.env.FIX !== "0";
const poly = fix && process.env.POLY !== "0";
const worker = fix && process.env.WORKER !== "0";

if (poly) {
  const { installPdfNodePolyfills } = await import("../src/lib/pdf-node-polyfills.js");
  installPdfNodePolyfills();
}
console.log(`Rellenos: ${poly ? "SÍ" : "NO"} · worker entregado: ${worker ? "SÍ" : "NO"}`);

try {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // Simula que pdf.worker.mjs no existe en el despliegue: pdfjs solo evita
  // cargarlo si ya le entregamos el worker en globalThis.pdfjsWorker.
  pdfjs.GlobalWorkerOptions.workerSrc = "./no-existe-pdf.worker.mjs";
  if (worker) {
    (globalThis as any).pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  }

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
