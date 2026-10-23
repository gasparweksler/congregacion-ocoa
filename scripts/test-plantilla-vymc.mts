// ============================================================================
//  Comprueba la planilla en blanco de Vida y Ministerio:
//   1. Que el archivo del proyecto sea byte a byte el original subido.
//   2. Que conserve su estructura (hoja, filas, columnas, encabezados).
//   3. Que la carga masiva la reconozca: detecta las semanas y NO inventa
//      nombres (la plantilla está vacía a propósito).
//
//  Solo lee archivos; no toca la base de datos.
//    npx tsx scripts/test-plantilla-vymc.mts ["ruta del original"]
// ============================================================================
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import ExcelJS from "exceljs";
import { parseVymc } from "../src/lib/vymc-parser.js";

let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};
const md5 = (f: string) => createHash("md5").update(readFileSync(f)).digest("hex");

const enProyecto = "src/assets/plantilla-vymc.xlsx";
const original = process.argv[2];

console.log("1. El archivo");
check(existsSync(enProyecto), `${enProyecto} existe`);
if (original && existsSync(original)) {
  check(md5(enProyecto) === md5(original), "es byte a byte el original subido");
} else {
  console.log("  (no se indicó el original; se omite la comparación)");
}

console.log("\n2. Estructura");
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(enProyecto);
const hojas = wb.worksheets.map((w) => w.name);
console.log(`  hojas: ${hojas.join(", ")}`);
check(wb.worksheets.length >= 1, "conserva al menos una hoja");

const ws = wb.worksheets[0];
console.log(`  "${ws.name}": ${ws.rowCount} filas · ${ws.columnCount} columnas`);
check(ws.rowCount > 50, "conserva las filas del programa");
check(ws.columnCount >= 10, "conserva las columnas");

// Encabezados que la carga masiva necesita reconocer.
const texto = (r: number, c: number) => {
  const v = ws.getRow(r).getCell(c).value as unknown;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return String((v as { text?: string }).text ?? "");
  return String(v);
};
let haySemana = false;
let haySecciones = 0;
for (let r = 1; r <= ws.rowCount; r++) {
  for (let c = 1; c <= 3; c++) {
    const t = texto(r, c).toUpperCase();
    if (t.includes("SEMANA")) haySemana = true;
    if (
      t.includes("TESOROS DE LA BIBLIA") ||
      t.includes("SEAMOS MEJORES MAESTROS") ||
      t.includes("NUESTRA VIDA CRISTIANA")
    ) {
      haySecciones++;
    }
  }
}
check(haySemana, "conserva los encabezados de semana");
check(haySecciones > 0, `conserva los títulos de sección (${haySecciones} encontrados)`);

console.log("\n3. La lee la carga masiva");
const semanas = parseVymc(wb);
console.log(`  semanas detectadas: ${semanas.length}`);
for (const s of semanas) {
  console.log(`    ${s.label} → ${s.date.toISOString().slice(0, 10)}`);
}
check(semanas.length > 0, "la carga masiva reconoce las semanas");

const nombres = semanas.flatMap((w) =>
  [
    w.pres,
    w.orac,
    w.clos,
    ...[...w.tesoros, ...w.smm, ...w.vc].flatMap((x) => [x.name, x.name2]),
  ].filter(Boolean),
);
check(
  nombres.length === 0,
  `está en blanco: 0 nombres (encontrados ${nombres.length})`,
);

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
