// ============================================================================
//  Convertir un PDF en imágenes, UNA POR PÁGINA, en el navegador.
//
//  Se hace aquí y no en el servidor por una razón concreta: dibujar un PDF
//  necesita un "lienzo" (canvas), y el servidor donde vive la aplicación no
//  tiene ninguno. El navegador sí, y además así el PDF no viaja entero: solo
//  sube la imagen ya reducida de cada página.
//
//  pdfjs se carga en el momento de usarlo (son cientos de kilobytes) y trabaja
//  en el hilo principal, igual que en el servidor: entre página y página se
//  cede el turno para que la pantalla pueda ir enseñando el avance.
//
//  Este módulo solo funciona en el navegador: no lo importes desde un
//  Server Component.
// ============================================================================

import { escalaDeMapa } from "@/lib/territorios";

export type PaginaImagen = {
  /** Número de página, empezando en 1. */
  pagina: number;
  /** La imagen, lista para subir. */
  blob: Blob;
  /** Tamaño de la imagen en píxeles. */
  ancho: number;
  alto: number;
};

export type OpcionesConversion = {
  /** Lado mayor de la imagen, en píxeles. Menos = más liviano. */
  ladoMaximo?: number;
  /** Calidad del JPEG, de 0 a 1. */
  calidad?: number;
  /** Se llama al acabar cada página, para ir enseñando el avance. */
  alAvanzar?: (hechas: number, total: number) => void;
};

/** Deja respirar a la pantalla entre página y página. */
const cederTurno = () =>
  new Promise<void>((listo) => setTimeout(listo, 0));

/**
 * Entrega el worker a pdfjs por `globalThis.pdfjsWorker`, igual que en el
 * servidor. Con esto pdfjs trabaja en el hilo principal y no hace falta
 * publicar el archivo del worker en una dirección aparte, que es justo lo
 * que se rompe al desplegar.
 */
async function prepararWorker(): Promise<void> {
  const g = globalThis as unknown as Record<string, unknown>;
  if (g.pdfjsWorker) return;
  g.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
}

/** Cuántas páginas tiene el PDF, sin dibujar ninguna. */
export async function contarPaginas(datos: ArrayBuffer): Promise<number> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  await prepararWorker();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(datos) }).promise;
  const n = doc.numPages;
  await doc.destroy();
  return n;
}

/**
 * Dibuja cada página del PDF y la devuelve como imagen JPEG.
 * Las páginas salen en orden, de la 1 a la última.
 */
export async function paginasComoImagenes(
  datos: ArrayBuffer,
  opciones: OpcionesConversion = {},
): Promise<PaginaImagen[]> {
  const ladoMaximo = opciones.ladoMaximo ?? 1600;
  const calidad = opciones.calidad ?? 0.72;

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  await prepararWorker();

  // Copia de los bytes: pdfjs se queda con el buffer que recibe y, si es el
  // mismo que usa quien llama, el segundo intento llegaría vacío.
  const doc = await pdfjs.getDocument({ data: new Uint8Array(datos.slice(0)) })
    .promise;

  const salida: PaginaImagen[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: escalaDeMapa(base.width, base.height, ladoMaximo),
      });

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));

      await page.render({
        canvas,
        viewport,
        // Fondo blanco: el JPEG no guarda transparencia y, sin esto, lo
        // transparente del PDF saldría negro.
        background: "#ffffff",
      }).promise;

      const blob = await new Promise<Blob | null>((listo) =>
        canvas.toBlob(listo, "image/jpeg", calidad),
      );
      page.cleanup();
      // Liberar el lienzo: con muchas páginas, el navegador se queda sin
      // memoria si se van acumulando.
      canvas.width = 0;
      canvas.height = 0;

      if (blob) {
        salida.push({
          pagina: n,
          blob,
          ancho: Math.floor(viewport.width),
          alto: Math.floor(viewport.height),
        });
      }
      opciones.alAvanzar?.(n, doc.numPages);
      await cederTurno();
    }
  } finally {
    await doc.destroy();
  }

  return salida;
}

/**
 * Reduce y comprime una imagen que ya es imagen (JPEG, PNG o WEBP), para que
 * un mapa suelto pese lo mismo que los que salen del PDF.
 */
export async function imagenReducida(
  archivo: Blob,
  opciones: { ladoMaximo?: number; calidad?: number } = {},
): Promise<PaginaImagen> {
  const ladoMaximo = opciones.ladoMaximo ?? 1600;
  const calidad = opciones.calidad ?? 0.78;

  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((listo, falla) => {
      const el = new Image();
      el.onload = () => listo(el);
      el.onerror = () => falla(new Error("No se pudo abrir la imagen."));
      el.src = url;
    });

    const mayor = Math.max(img.naturalWidth, img.naturalHeight);
    // Nunca se agranda: una imagen pequeña se queda como está.
    const escala = mayor > ladoMaximo ? ladoMaximo / mayor : 1;
    const ancho = Math.max(1, Math.round(img.naturalWidth * escala));
    const alto = Math.max(1, Math.round(img.naturalHeight * escala));

    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("El navegador no pudo preparar la imagen.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(img, 0, 0, ancho, alto);

    const blob = await new Promise<Blob | null>((listo) =>
      canvas.toBlob(listo, "image/jpeg", calidad),
    );
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) throw new Error("No se pudo preparar la imagen.");
    return { pagina: 1, blob, ancho, alto };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Lee una imagen como "data:image/…;base64,…", que es lo que pide el PDF. */
export function comoDataUrl(blob: Blob): Promise<string> {
  return new Promise((listo, falla) => {
    const lector = new FileReader();
    lector.onload = () => listo(String(lector.result));
    lector.onerror = () => falla(new Error("No se pudo leer la imagen."));
    lector.readAsDataURL(blob);
  });
}

/** El tamaño real de una imagen que ya está en una dirección. */
export function medidaDeImagen(
  src: string,
): Promise<{ ancho: number; alto: number }> {
  return new Promise((listo, falla) => {
    const el = new Image();
    el.onload = () => listo({ ancho: el.naturalWidth, alto: el.naturalHeight });
    el.onerror = () => falla(new Error("No se pudo abrir la imagen."));
    el.src = src;
  });
}
