// ============================================================================
//  Un .xlsx con una imagen incrustada tiene que poder subirse.
//
//  El caso real: alguien rellena la planilla de Vida y Ministerio, le pega el
//  logo de la congregación, y la carga masiva responde "no se pudo leer el
//  archivo". El archivo está bien: es ExcelJS, que revienta con "Cannot read
//  properties of undefined (reading 'anchors')" cuando el dibujo no viene
//  escrito como él espera —relación con ruta absoluta y XML sin el prefijo
//  `xdr:`—, que es justo como lo escriben varios programas de hojas de cálculo.
//
//  Aquí se reproduce ese archivo a partir de NUESTRA plantilla (sin datos de
//  nadie) y se comprueba que loadWorkbook lo abre y el parser lo entiende.
//
//    npx tsx scripts/test-xlsx-con-imagen.mts
// ============================================================================
import { readFile, mkdir, writeFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { loadWorkbook } from "../src/lib/xlsx-load.js";
import { parseVymc } from "../src/lib/vymc-parser.js";

let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};
const titulo = (t: string) => console.log(`\n${t}`);

const PLANTILLA = "src/assets/plantilla-vymc.xlsx";

/** Un JPEG mínimo de verdad (1x1 px), para no inventarse bytes. */
const JPEG_1X1 = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
    "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

/**
 * Le mete al .xlsx una imagen escrita como la escriben los programas que
 * rompen ExcelJS: relación con ruta ABSOLUTA y dibujo SIN el prefijo `xdr:`.
 */
async function conImagenIncrustada(buf: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf);

  zip.file("xl/media/image1.jpeg", JPEG_1X1);
  zip.file(
    "xl/drawings/_rels/drawing1.xml.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ' +
      'Target="/xl/media/image1.jpeg" Id="rId1"/></Relationships>',
  );
  // Sin prefijo xdr: ahí es donde ExcelJS se pierde.
  zip.file(
    "xl/drawings/drawing1.xml",
    '<wsDr xmlns="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">' +
      "<twoCellAnchor editAs=\"oneCell\"><from><col>0</col><colOff>0</colOff><row>4</row>" +
      "<rowOff>0</rowOff></from><to><col>7</col><colOff>0</colOff><row>13</row><rowOff>0</rowOff></to>" +
      '<pic><nvPicPr><cNvPr id="4" name="Imagen 3"/><cNvPicPr/></nvPicPr>' +
      '<blipFill><a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/>' +
      "</blipFill><spPr/></pic><clientData/></twoCellAnchor></wsDr>",
  );
  // Con ruta absoluta, como en el archivo real que falló.
  zip.file(
    "xl/worksheets/_rels/sheet1.xml.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" ' +
      'Target="/xl/drawings/drawing1.xml" Id="rId1"/></Relationships>',
  );
  // Y la hoja referenciándolo.
  const hoja = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  zip.file(
    "xl/worksheets/sheet1.xml",
    hoja.replace("</worksheet>", '<drawing r:id="rId1"/></worksheet>'),
  );

  return zip.generateAsync({ type: "nodebuffer" });
}

console.log("UN .XLSX CON IMAGEN SE TIENE QUE PODER SUBIR\n");

const original = await readFile(PLANTILLA);

titulo("1. La plantilla tal cual se abre (el camino normal)");
{
  const wb = await loadWorkbook(original);
  check(wb.worksheets.length > 0, `se abre y trae ${wb.worksheets.length} hoja(s)`);
}

titulo("2. Con una imagen incrustada, ExcelJS por su cuenta NO puede");
const conImagen = await conImagenIncrustada(original);
{
  const wb = new ExcelJS.Workbook();
  let falló = "";
  try {
    await wb.xlsx.load(conImagen as unknown as Parameters<typeof wb.xlsx.load>[0]);
  } catch (e) {
    falló = e instanceof Error ? e.message : String(e);
  }
  check(
    falló.length > 0,
    falló ? `falla, como en producción: "${falló}"` : "ESTE CASO YA NO FALLA (¿arreglaron ExcelJS?)",
  );
  if (!falló) {
    console.log("     (si ExcelJS ya lo abre solo, esta prueba sobra: revísala)");
  }
}

titulo("3. loadWorkbook sí lo abre");
{
  const wb = await loadWorkbook(conImagen);
  check(wb.worksheets.length > 0, `se abre y trae ${wb.worksheets.length} hoja(s)`);

  // Y lo importante: que se lea lo MISMO que sin la imagen.
  const sinImagen = await loadWorkbook(original);
  const celdas = (w: ExcelJS.Workbook) => {
    const ws = w.worksheets[0];
    const out: string[] = [];
    for (let r = 1; r <= Math.min(ws.rowCount, 120); r++) {
      for (let c = 1; c <= Math.min(ws.columnCount, 10); c++) {
        // .text revienta en las celdas combinadas vacías (es cosa de ExcelJS,
        // no del archivo): se lee a prueba de eso.
        let v = "";
        try {
          v = (ws.getRow(r).getCell(c).text ?? "").trim();
        } catch {
          v = "";
        }
        if (v) out.push(`${r},${c}=${v}`);
      }
    }
    return out;
  };
  const a = celdas(sinImagen);
  const b = celdas(wb);
  check(a.length > 0, `la plantilla tiene ${a.length} celdas con texto`);
  check(
    JSON.stringify(a) === JSON.stringify(b),
    "y con la imagen se lee exactamente el mismo texto, celda por celda",
  );
  const distintas = a.filter((x, i) => x !== b[i]).slice(0, 3);
  for (const d of distintas) console.log(`     ✗ ${d}`);
}

titulo("4. El parser reconoce las semanas igual");
{
  const wb = await loadWorkbook(conImagen);
  const semanas = parseVymc(wb, 2026);
  const sinImagen = parseVymc(await loadWorkbook(original), 2026);
  check(semanas.length > 0, `reconoce ${semanas.length} semana(s)`);
  check(
    semanas.length === sinImagen.length,
    `las mismas que sin la imagen (${sinImagen.length})`,
  );
  check(
    semanas.map((w) => w.label).join("|") === sinImagen.map((w) => w.label).join("|"),
    "con las mismas etiquetas de semana",
  );
}

titulo("5. Un archivo que de verdad está roto sigue dando error");
{
  let dioError = false;
  try {
    await loadWorkbook(Buffer.from("esto no es un xlsx, es texto suelto"));
  } catch {
    dioError = true;
  }
  check(dioError, "un archivo que no es .xlsx lanza error, no se lo traga");
}

// Se deja el archivo por si hace falta mirarlo.
await mkdir(".tmp", { recursive: true });
await writeFile(".tmp/plantilla-con-imagen.xlsx", conImagen);
console.log("\n  (el caso reproducido quedó en .tmp/plantilla-con-imagen.xlsx)");

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
