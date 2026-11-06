// ============================================================================
//  Leer el TEXTO de un PDF en el navegador, con la posición de cada trozo.
//
//  Es el mismo trabajo que hace pdf-text.ts en el servidor, pero aquí: así
//  el PDF de las tarjetas no tiene que subirse entero para analizarlo, y la
//  persona ve el resultado al instante.
//
//  Este módulo solo funciona en el navegador: no lo importes desde un
//  Server Component.
// ============================================================================

import { prepararWorker } from "@/lib/pdf-a-imagenes";
import type { Fragmento } from "@/lib/pdf-lines";

type TextItemLike = {
  str?: string;
  width?: number;
  height?: number;
  fontName?: string;
  transform?: number[];
};

export type TextoDePdf = {
  fragmentos: Fragmento[];
  paginas: number;
};

/**
 * Devuelve todos los trozos de texto del PDF con su posición, y cuántas
 * páginas tiene (dato que hace falta aparte: una página que solo trae un
 * dibujo no deja ningún trozo de texto).
 */
export async function textoDePdf(datos: ArrayBuffer): Promise<TextoDePdf> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  await prepararWorker();

  // Copia de los bytes: pdfjs se queda con el buffer que recibe, y el mismo
  // archivo se vuelve a usar después para dibujar los mapas.
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(datos.slice(0)),
    useSystemFonts: false,
    disableFontFace: true,
  }).promise;

  const fragmentos: Fragmento[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const contenido = await page.getTextContent();
      for (const crudo of contenido.items as TextItemLike[]) {
        const texto = crudo.str ?? "";
        if (!texto.trim()) continue;
        const t = crudo.transform ?? [1, 0, 0, 1, 0, 0];
        fragmentos.push({
          text: texto,
          x: t[4],
          y: t[5],
          width: crudo.width ?? 0,
          page: p,
          height: crudo.height ?? Math.abs(t[3] ?? 0),
          font: crudo.fontName ?? "",
        });
      }
      page.cleanup();
    }
    return { fragmentos, paginas: doc.numPages };
  } finally {
    await doc.destroy();
  }
}
