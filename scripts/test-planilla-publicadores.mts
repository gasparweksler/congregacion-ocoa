// ============================================================================
//  Planilla de publicadores: recorrido completo plantilla -> relleno -> lectura.
//
//  Se genera la plantilla que descarga la aplicación, se rellena como lo haría
//  una persona y se lee de vuelta. Sin base de datos.
//
//   1. La plantilla trae todas las columnas del formulario y la hoja de ayuda.
//   2. Una fila bien escrita se lee entera y con los valores internos.
//   3. Las fechas se admiten en dd/mm/aaaa, aaaa-mm-dd y como fecha de Excel.
//   4. Cada error dice la FILA y la COLUMNA: nombre, grupo, situación, sexo,
//      fechas imposibles y valores de lista.
//   5. Un nombre repetido dentro de la misma planilla se señala.
//   6. Las filas vacías del final no molestan.
//   7. Mover una columna de sitio no estropea la lectura.
//   8. Si falta una columna obligatoria, se dice cuál.
//
//    npx tsx scripts/test-planilla-publicadores.mts
// ============================================================================
import ExcelJS from "exceljs";
import {
  buildPublishersTemplate,
  parsePublishersSheet,
  parseFecha,
  parseSexo,
  PUB_COLUMNS,
} from "../src/lib/publishers-xlsx.js";

let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};

/** La plantilla tal como la descarga la aplicación. */
function plantilla(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  buildPublishersTemplate(wb);
  return wb;
}

/** Escribe una fila en la hoja, en el orden de las columnas. */
function fila(ws: ExcelJS.Worksheet, r: number, valores: (string | number | Date | null)[]) {
  valores.forEach((v, i) => {
    if (v !== null) ws.getRow(r).getCell(i + 1).value = v as ExcelJS.CellValue;
  });
}

// --- 1. La plantilla -------------------------------------------------------
console.log("1. La plantilla que se descarga");
{
  const wb = plantilla();
  const ws = wb.getWorksheet("Publicadores")!;
  const ayuda = wb.getWorksheet("Valores admitidos");
  check(!!ws, "trae la hoja 'Publicadores'");
  check(!!ayuda, "y la hoja 'Valores admitidos'");

  const cabeceras = PUB_COLUMNS.map((_, i) =>
    String(ws.getRow(1).getCell(i + 1).value ?? ""),
  );
  console.log(`   columnas: ${cabeceras.join(" | ")}`);
  check(
    cabeceras.length === PUB_COLUMNS.length,
    `tiene las ${PUB_COLUMNS.length} columnas del formulario`,
  );
  check(
    PUB_COLUMNS.filter((c) => c.required).every((c) =>
      cabeceras.some((h) => h.startsWith(c.header) && h.endsWith("*")),
    ),
    "las obligatorias van marcadas con *",
  );
  check(
    cabeceras.some((h) => h.startsWith("Número de grupo")),
    "incluye la columna 'Número de grupo'",
  );
  // Está vacía: solo el encabezado.
  check(ws.rowCount === 1, `viene vacía (${ws.rowCount} fila)`);
}

// --- 2. Una fila bien escrita ---------------------------------------------
console.log("\n2. Una fila bien escrita");
{
  const wb = plantilla();
  const ws = wb.getWorksheet("Publicadores")!;
  fila(ws, 2, [
    "  Juan  Carlos   Pérez ", // espacios de más a propósito
    "3",
    "Bautizado",
    "H",
    "12/03/1980",
    "25/07/1995",
    "Otras ovejas",
    "Anciano",
  ]);
  const { rows, errors } = parsePublishersSheet(wb);
  check(errors.length === 0, `sin errores (${errors.length})`);
  check(rows.length === 1, "se lee una fila");
  const r = rows[0];
  check(r.fullName === "Juan Carlos Pérez", `nombre limpio: «${r.fullName}»`);
  check(r.groupNumber === 3, `grupo ${r.groupNumber}`);
  check(r.status === "BAUTIZADO", `situación interna: ${r.status}`);
  check(r.sex === "M", `sexo: ${r.sex} (H = hombre)`);
  check(r.birthDate === "1980-03-12", `nacimiento: ${r.birthDate}`);
  check(r.baptismDate === "1995-07-25", `bautismo: ${r.baptismDate}`);
  check(r.hope === "OTRAS_OVEJAS", `esperanza: ${r.hope}`);
  check(r.privilege === "ANCIANO", `privilegio: ${r.privilege}`);
  check(r.row === 2, "y recuerda que venía en la fila 2");
}

// --- 3. Formatos de fecha --------------------------------------------------
console.log("\n3. Formatos de fecha que admite");
{
  check(parseFecha("12/03/1980") === "1980-03-12", "dd/mm/aaaa");
  check(parseFecha("12-03-1980") === "1980-03-12", "dd-mm-aaaa");
  check(parseFecha("1980-03-12") === "1980-03-12", "aaaa-mm-dd");
  check(parseFecha("") === null, "vacío = sin fecha (no es error)");
  check(parseFecha("31/02/1980") === undefined, "31 de febrero se rechaza");
  check(parseFecha("ayer") === undefined, "texto suelto se rechaza");
  check(parseFecha("12/03/2090") === undefined, "un año futuro se rechaza");

  // Celda con fecha real de Excel.
  const wb = plantilla();
  const ws = wb.getWorksheet("Publicadores")!;
  fila(ws, 2, ["Ana Soto", "1", "Bautizado", "M", new Date(1990, 4, 20, 12), null, null, null]);
  const { rows, errors } = parsePublishersSheet(wb);
  check(errors.length === 0 && rows[0]?.birthDate === "1990-05-20",
    `una fecha de Excel se lee bien (${rows[0]?.birthDate})`);
  check(rows[0]?.sex === "F", "y 'M' en la columna Sexo (H/M) es Mujer");
}

// --- 4. Errores con fila y columna ----------------------------------------
console.log("\n4. Cada error dice la fila y la columna");
{
  const wb = plantilla();
  const ws = wb.getWorksheet("Publicadores")!;
  fila(ws, 2, ["", "1", "Bautizado", null, null, null, null, null]);            // sin nombre
  fila(ws, 3, ["Pedro Díaz", "", "Bautizado", null, null, null, null, null]);   // sin grupo
  fila(ws, 4, ["Luis Mena", "abc", "Bautizado", null, null, null, null, null]); // grupo no numérico
  fila(ws, 5, ["Rosa Lara", "2", "", null, null, null, null, null]);            // sin situación
  fila(ws, 6, ["Eva Ruiz", "2", "Inventado", null, null, null, null, null]);    // situación mala
  fila(ws, 7, ["Ivo Paz", "2", "Bautizado", "X", null, null, null, null]);      // sexo malo
  fila(ws, 8, ["Tita Gil", "2", "Bautizado", null, "32/13/1980", null, null, null]); // fecha mala
  fila(ws, 9, ["Noa Vera", "2", "Bautizado", null, null, null, "Pajarito", null]);   // esperanza mala
  fila(ws, 10, ["Uma Soto", "2", "Bautizado", null, null, null, null, "Jefe"]);      // privilegio malo

  const { rows, errors } = parsePublishersSheet(wb);
  const por = (r: number) => errors.find((e) => e.row === r);
  check(rows.length === 0, `ninguna de esas filas se da por buena (${rows.length})`);
  for (const [r, col] of [
    [2, "Nombre completo"],
    [3, "Número de grupo"],
    [4, "Número de grupo"],
    [5, "Situación"],
    [6, "Situación"],
    [7, "Sexo (H/M)"],
    [8, "Fecha de nacimiento"],
    [9, "Esperanza"],
    [10, "Privilegio"],
  ] as const) {
    const e = por(r);
    check(e?.column === col, `fila ${r} -> ${col}: ${e?.message?.slice(0, 48) ?? "(sin error)"}`);
  }
}

// --- 5. Repetidos dentro de la planilla ------------------------------------
console.log("\n5. Un nombre repetido en la misma planilla");
{
  const wb = plantilla();
  const ws = wb.getWorksheet("Publicadores")!;
  fila(ws, 2, ["Carlos Avilés", "1", "Bautizado", null, null, null, null, null]);
  fila(ws, 3, ["carlos aviles", "2", "Bautizado", null, null, null, null, null]);
  const { rows, errors } = parsePublishersSheet(wb);
  check(rows.length === 1, `solo se da por buena la primera (${rows.length})`);
  check(
    errors.some((e) => e.row === 3 && /fila 2/.test(e.message)),
    `y se avisa señalando la fila 2: ${errors[0]?.message ?? ""}`,
  );
}

// --- 6. Filas vacías al final ---------------------------------------------
console.log("\n6. Filas vacías al final");
{
  const wb = plantilla();
  const ws = wb.getWorksheet("Publicadores")!;
  fila(ws, 2, ["Ana Soto", "1", "Bautizado", null, null, null, null, null]);
  // Se tocan celdas de filas posteriores para que Excel las cuente.
  ws.getRow(8).getCell(1).value = "";
  ws.getRow(9).getCell(3).value = "";
  const { rows, errors } = parsePublishersSheet(wb);
  check(rows.length === 1 && errors.length === 0, "no estorban ni dan error");
}

// --- 7. Columnas movidas de sitio -----------------------------------------
console.log("\n7. Si se mueve una columna de sitio");
{
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Publicadores");
  // Orden distinto al de la plantilla, a propósito.
  ws.getRow(1).values = ["Situación", "Nombre completo", "Número de grupo"];
  ws.getRow(2).values = ["Precursor regular", "Mara Vidal", "4"];
  const { rows, errors } = parsePublishersSheet(wb);
  check(errors.length === 0, `se lee igual (${errors.length} errores)`);
  check(
    rows[0]?.fullName === "Mara Vidal" &&
      rows[0]?.groupNumber === 4 &&
      rows[0]?.status === "PRECURSOR_REGULAR",
    "porque las columnas se buscan por su nombre, no por su posición",
  );
}

// --- 8. Falta una columna obligatoria -------------------------------------
console.log("\n8. Si falta una columna obligatoria");
{
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Publicadores");
  ws.getRow(1).values = ["Nombre completo", "Situación"]; // sin Número de grupo
  ws.getRow(2).values = ["Ana Soto", "Bautizado"];
  const { rows, errors } = parsePublishersSheet(wb);
  check(rows.length === 0, "no se lee nada");
  check(
    errors.some((e) => /Número de grupo/.test(e.message)),
    `y se dice cuál falta: ${errors[0]?.message ?? ""}`,
  );
}

// --- 9. Sexo: lo que escribe la gente --------------------------------------
console.log("\n9. Cómo se escribe el sexo");
{
  check(parseSexo("H") === "M", "H = hombre");
  check(parseSexo("hombre") === "M", "hombre");
  check(parseSexo("V") === "M", "V (varón)");
  check(parseSexo("M") === "F", "M = mujer (la columna dice H/M)");
  check(parseSexo("Mujer") === "F", "mujer");
  check(parseSexo("F") === "F", "F");
  check(parseSexo("") === null, "vacío no es error");
  check(parseSexo("otro") === undefined, "cualquier otra cosa se rechaza");
}

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
