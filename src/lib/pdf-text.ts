// ============================================================================
//  Extracción de texto con posición (x, y) de un PDF, en el servidor.
//  Usa pdfjs-dist (build legacy, sin worker) porque es la única librería que
//  entrega las coordenadas de cada fragmento: sin ellas no se puede reconstruir
//  una tabla de forma fiable, solo adivinar sobre texto plano.
// ============================================================================

import type { PdfItem } from "@/lib/resp-pdf-parser";
import { installPdfNodePolyfills } from "@/lib/pdf-node-polyfills";

type TextItemLike = {
  str?: string;
  width?: number;
  transform?: number[];
};

/**
 * Entrega el worker a pdfjs a través de `globalThis.pdfjsWorker`.
 *
 * En Node pdfjs trabaja siempre con un "worker falso" que carga con
 * `import(this.workerSrc)`, una ruta dinámica que el empaquetador no puede
 * analizar: por eso Vercel no copia pdf.worker.mjs al despliegue y falla con
 * "Setting up fake worker failed: Cannot find module .../pdf.worker.mjs".
 * Importándolo aquí con una ruta literal, el archivo sí entra en el paquete y
 * pdfjs lo usa directamente, sin resolver nada en tiempo de ejecución.
 */
async function ensureWorker(): Promise<void> {
  const g = globalThis as unknown as Record<string, unknown>;
  if (g.pdfjsWorker) return;
  g.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
}

/** Devuelve todos los fragmentos de texto del PDF con su posición. */
export async function extractPdfItems(data: Uint8Array): Promise<PdfItem[]> {
  // Debe ejecutarse ANTES de cargar pdfjs: la librería usa DOMMatrix al
  // evaluarse y en producción no aplica sus propios rellenos de Node.
  installPdfNodePolyfills();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Antes del primer getDocument: pdfjs memoriza cómo obtuvo el worker.
  await ensureWorker();

  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: false,
    disableFontFace: true,
  }).promise;

  const items: PdfItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const raw of content.items as TextItemLike[]) {
      const text = raw.str ?? "";
      if (!text.trim()) continue;
      const t = raw.transform ?? [1, 0, 0, 1, 0, 0];
      items.push({
        text,
        x: t[4],
        y: t[5],
        width: raw.width ?? 0,
        page: p,
      });
    }
    page.cleanup();
  }
  await doc.destroy();
  return items;
}
