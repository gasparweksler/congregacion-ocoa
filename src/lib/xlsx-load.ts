// ============================================================================
//  Abrir un .xlsx subido por alguien.
//
//  ExcelJS revienta con "Cannot read properties of undefined (reading
//  'anchors')" en cuanto el archivo trae una IMAGEN incrustada y el dibujo no
//  viene escrito tal como él lo espera (relación con ruta absoluta, o el XML
//  sin el prefijo `xdr:`). Lo escriben así varios programas de hojas de
//  cálculo, así que basta con que alguien pegue el logo de la congregación en
//  la planilla para que la carga masiva falle con un "no se pudo leer el
//  archivo" que no explica nada.
//
//  Nosotros solo leemos texto de celdas: las imágenes sobran. Así que si el
//  archivo no abre, se vuelve a intentar sin los dibujos.
// ============================================================================

import ExcelJS from "exceljs";
import JSZip from "jszip";

type LoadArg = Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0];

/** Quita del .xlsx los dibujos y las imágenes, y lo devuelve re-empaquetado. */
async function sinDibujos(buf: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf);

  // Las partes del dibujo y las imágenes en sí.
  for (const nombre of Object.keys(zip.files)) {
    if (/^xl\/(drawings|media)\//.test(nombre)) zip.remove(nombre);
  }

  // Y lo que las referencia, o ExcelJS las seguiría buscando.
  for (const nombre of Object.keys(zip.files)) {
    if (/^xl\/worksheets\/_rels\/.+\.rels$/.test(nombre)) {
      const xml = await zip.file(nombre)!.async("string");
      zip.file(
        nombre,
        xml.replace(/<Relationship\b[^>]*relationships\/drawing"[^>]*\/>/g, ""),
      );
    } else if (/^xl\/worksheets\/sheet\d+\.xml$/.test(nombre)) {
      const xml = await zip.file(nombre)!.async("string");
      zip.file(nombre, xml.replace(/<drawing\b[^>]*\/>/g, ""));
    }
  }

  return zip.generateAsync({ type: "nodebuffer" });
}

/**
 * Abre el libro. Primero tal cual (el camino normal, sin tocar un byte) y, si
 * ExcelJS no puede, otra vez sin los dibujos.
 *
 * Lanza el error original si tampoco así: entonces el archivo sí está roto.
 */
export async function loadWorkbook(buf: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as LoadArg);
    return wb;
  } catch (primerError) {
    try {
      const limpio = await sinDibujos(buf);
      const wb2 = new ExcelJS.Workbook();
      await wb2.xlsx.load(limpio as unknown as LoadArg);
      return wb2;
    } catch {
      throw primerError;
    }
  }
}
