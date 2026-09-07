// ============================================================================
//  Extracción de texto con posición (x, y) de un PDF, en el servidor.
//  Usa pdfjs-dist (build legacy, sin worker) porque es la única librería que
//  entrega las coordenadas de cada fragmento: sin ellas no se puede reconstruir
//  una tabla de forma fiable, solo adivinar sobre texto plano.
// ============================================================================

import type { PdfItem } from "@/lib/resp-pdf-parser";

type TextItemLike = {
  str?: string;
  width?: number;
  transform?: number[];
};

// pdfjs 5 usa Promise.withResolvers, que no existe en Node 20. El entorno de
// producción puede estar en Node 20 aunque aquí se compile con uno más nuevo,
// así que se rellena antes de cargar la librería.
function ensurePromiseWithResolvers(): void {
  const P = Promise as unknown as { withResolvers?: unknown };
  if (typeof P.withResolvers === "function") return;
  P.withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

/** Devuelve todos los fragmentos de texto del PDF con su posición. */
export async function extractPdfItems(data: Uint8Array): Promise<PdfItem[]> {
  ensurePromiseWithResolvers();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

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
