// ============================================================================
//  Comprueba de dónde saca el año la carga masiva.
//
//  El texto de las semanas no lleva año ("SEMANA 6-12 DE JULIO"), así que:
//    1. manda el año del nombre de la hoja ("Junio 2026"), que es dato del
//       propio archivo;
//    2. si no, el que aparezca en alguna celda;
//    3. si no, el indicado al subir el archivo.
//  Y si el programa cruza el fin de año, las semanas de enero caen en el
//  siguiente.  No toca la base de datos.
//    npx tsx scripts/test-vymc-anio.mts
// ============================================================================
import ExcelJS from "exceljs";
import { parseVymc } from "../src/lib/vymc-parser.js";

let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};

/** Hoja mínima con los encabezados de semana indicados. */
function hoja(nombre: string, semanas: string[], celdaExtra?: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(nombre);
  if (celdaExtra) ws.getCell("C1").value = celdaExtra;
  let r = celdaExtra ? 3 : 1;
  for (const s of semanas) {
    ws.getCell(`A${r}`).value = s;
    r += 4;
  }
  return wb;
}

const SEM_JULIO = ["SEMANA 6-12 DE JULIO", "SEMANA 13-19 DE JULIO"];

console.log("1. El año lo trae el nombre de la hoja");
{
  const weeks = parseVymc(hoja("Junio 2026", SEM_JULIO), 2030);
  check(weeks.length === 2, `detecta 2 semanas (${weeks.length})`);
  check(
    weeks.every((w) => w.date.getFullYear() === 2026),
    "usa 2026 del nombre de la hoja, no el 2030 del formulario",
  );
}

console.log("\n2. La hoja no trae año: manda el del formulario");
{
  const weeks = parseVymc(hoja("Modelo", SEM_JULIO), 2027);
  check(
    weeks.every((w) => w.date.getFullYear() === 2027),
    "usa 2027, el indicado al subir (antes caía al año en curso en silencio)",
  );
}

console.log("\n3. El año está escrito en una celda");
{
  const weeks = parseVymc(hoja("Modelo", SEM_JULIO, "Programa 2028"), 2027);
  check(
    weeks.every((w) => w.date.getFullYear() === 2028),
    "usa 2028 de la celda, por encima del formulario",
  );
}

console.log("\n4. El programa cruza el fin de año");
{
  const weeks = parseVymc(
    hoja("Modelo", [
      "SEMANA 21-27 DE DICIEMBRE",
      "SEMANA 28 DE DICIEMBRE A 3 DE ENERO",
      "SEMANA 4-10 DE ENERO",
    ]),
    2026,
  );
  const años = weeks.map((w) => w.date.getFullYear());
  console.log(`  años por semana: ${años.join(", ")}`);
  check(años[0] === 2026, "diciembre queda en 2026");
  check(años[1] === 2026, "la semana que cruza queda en 2026 (empieza en diciembre)");
  check(años[2] === 2027, "enero pasa a 2027");
}

console.log("\n5. La planilla real del proyecto");
{
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("src/assets/plantilla-vymc.xlsx");
  const weeks = parseVymc(wb, 2029);
  console.log(`  semanas: ${weeks.map((w) => w.date.toISOString().slice(0, 10)).join(", ")}`);
  check(
    weeks.length > 0 && weeks.every((w) => w.date.getFullYear() === 2029),
    "la hoja 'Modelo' no trae año, así que respeta el 2029 indicado",
  );
}

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
