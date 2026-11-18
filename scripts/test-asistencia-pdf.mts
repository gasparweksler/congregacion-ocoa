// ============================================================================
//  El PDF del registro de asistencia S-88-S.
//
//  Se genera con el MISMO código que usa /api/asistencia-s88-pdf
//  (src/lib/asistencia-s88-pdf.ts) y después se vuelve a leer para comprobar
//  que cada número cayó en su casilla: su mes, su columna y su bloque
//  (entre semana arriba, fin de semana abajo).
//
//      npm run test:asistencia-pdf
//      GUARDAR=ruta.pdf npm run test:asistencia-pdf   (deja el PDF en disco)
// ============================================================================
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { jsPDF } from "jspdf";
import {
  dibujarS88,
  type ColumnaS88,
  type CeldaS88,
} from "../src/lib/asistencia-s88-pdf.js";

const require = createRequire(import.meta.url);
/* eslint-disable @typescript-eslint/no-explicit-any */
const pdfjs = require("pdfjs-dist/legacy/build/pdf.mjs");

let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};
const titulo = (t: string) => console.log(`\n${t}`);

const MESES = [
  "Septiembre", "Octubre", "Noviembre", "Diciembre",
  "Enero", "Febrero", "Marzo", "Abril",
  "Mayo", "Junio", "Julio", "Agosto",
];

// --- Datos de prueba: números distintos en cada casilla -------------------
const celda = (reuniones: number, total: number): CeldaS88 => ({
  reuniones,
  total,
  promedio: reuniones === 0 ? null : Math.round(total / reuniones),
});

const columna: ColumnaS88 = {
  anio: 2027,
  meses: MESES.map((_, i) => ({
    // Entre semana: 4 reuniones y un total que cambia cada mes.
    entreSemana: i === 3 ? celda(0, 0) : celda(4, 400 + i * 4),
    // Fin de semana: 5 reuniones.
    finDeSemana: celda(5, 750 + i * 5),
  })),
};

const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
dibujarS88(doc, { columnas: [columna, null] });
const bytes = new Uint8Array(doc.output("arraybuffer"));
if (process.env.GUARDAR) {
  writeFileSync(process.env.GUARDAR, bytes);
  console.log(`PDF guardado en ${process.env.GUARDAR}`);
}

// --- Se vuelve a leer lo que se dibujó ------------------------------------
const pdf = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
const page = await pdf.getPage(1);
const vp = page.getViewport({ scale: 1 });
const contenido = await page.getTextContent();
type Item = { x: number; y: number; s: string };
const items: Item[] = contenido.items
  .filter((i: any) => (i.str ?? "").trim() !== "")
  .map((i: any) => ({
    x: Math.round(i.transform[4]),
    y: Math.round(vp.height - i.transform[5]),
    s: String(i.str).trim(),
  }));

/** Lo que hay escrito cerca de una posición (misma fila, misma columna). */
function enCasilla(x0: number, x1: number, y: number): string {
  return items
    .filter((i) => Math.abs(i.y - y) <= 4 && i.x >= x0 - 2 && i.x <= x1 + 2)
    .sort((a, b) => a.x - b.x)
    .map((i) => i.s)
    .join("")
    .trim();
}

titulo("1. La página y los rótulos del formulario");
check(pdf.numPages === 1, `el formulario cabe en una página (${pdf.numPages})`);
check(
  Math.round(vp.width) === 595 && Math.round(vp.height) === 842,
  `es A4 vertical (${Math.round(vp.width)} x ${Math.round(vp.height)})`,
);
const texto = items.map((i) => i.s).join(" ");
check(
  texto.includes("REGISTRO DE ASISTENCIA A LAS REUNIONES DE CONGREGACIÓN"),
  "lleva el título del formulario",
);
check(
  texto.includes("Reunión de entre semana") &&
    texto.includes("Reunión del fin de semana"),
  "y los dos bloques, entre semana y fin de semana",
);
check(texto.includes("S-88-S"), "con el código del formulario al pie");
check(
  !/jw\.org|Watch\s?Tower|watchtower/i.test(texto),
  "no se reproduce ninguna marca ni logotipo",
);

titulo("2. Las columnas de la cabecera");
for (const [nombre, trozo] of [
  ["Año de servicio", "Año de servicio"],
  ["Número de reuniones", "Número de"],
  ["Asistencia total", "Asistencia"],
  ["Promedio de asistencia semanal", "semanal"],
] as const) {
  check(texto.includes(trozo), `está la columna «${nombre}»`);
}
check(texto.includes("2027"), "y el año de servicio elegido");

titulo("3. Los doce meses, en orden, en los dos bloques");
// Las filas del bloque de entre semana empiezan en y=141; las del fin de
// semana, en y=490. Entre fila y fila hay 20 puntos.
for (let i = 0; i < 12; i++) {
  const arriba = enCasilla(18, 98, 141 + i * 20);
  const abajo = enCasilla(18, 98, 490 + i * 20);
  const bien = arriba === MESES[i] && abajo === MESES[i];
  check(bien, `${MESES[i]}: en su fila de los dos bloques (${arriba} / ${abajo})`);
}

titulo("4. Cada número en su casilla");
let celdasBien = 0;
let celdasMal = 0;
for (let i = 0; i < 12; i++) {
  const mes = columna.meses[i];
  const casos = [
    { y: 141 + i * 20, c: mes.entreSemana, donde: "entre semana" },
    { y: 490 + i * 20, c: mes.finDeSemana, donde: "fin de semana" },
  ];
  for (const { y, c, donde } of casos) {
    const reuniones = enCasilla(98, 166, y);
    const total = enCasilla(166, 230, y);
    const promedio = enCasilla(230, 292, y);
    const esperado =
      c.reuniones === 0
        ? ["", "", ""]
        : [String(c.reuniones), String(c.total), String(c.promedio)];
    const bien =
      reuniones === esperado[0] &&
      total === esperado[1] &&
      promedio === esperado[2];
    if (bien) celdasBien++;
    else {
      celdasMal++;
      console.log(
        `  FALLA ${MESES[i]} (${donde}): se esperaba [${esperado.join(", ")}] y hay [${reuniones}, ${total}, ${promedio}]`,
      );
    }
  }
}
check(celdasMal === 0, `las 24 filas de datos están bien (${celdasBien} bien, ${celdasMal} mal)`);

titulo("5. Un mes sin reuniones queda en blanco");
{
  // Diciembre (el cuarto mes del año de servicio) se dejó sin reuniones de
  // entre semana a propósito.
  const y = 141 + 3 * 20;
  const vacio =
    enCasilla(98, 166, y) === "" &&
    enCasilla(166, 230, y) === "" &&
    enCasilla(230, 292, y) === "";
  check(vacio, "diciembre no inventa un cero ni un promedio");
  check(
    enCasilla(18, 98, y) === "Diciembre",
    "pero la fila sigue ahí, con su mes",
  );
}

titulo("6. El promedio del año, al pie de cada bloque");
{
  // Promedio del año = asistencia total del año entre reuniones del año.
  const suma = (tipo: "entreSemana" | "finDeSemana") => {
    let r = 0;
    let t = 0;
    for (const m of columna.meses) {
      r += m[tipo].reuniones;
      t += m[tipo].total;
    }
    return r === 0 ? "" : String(Math.round(t / r));
  };
  const pieArriba = enCasilla(230, 292, 141 + 12 * 20);
  const pieAbajo = enCasilla(230, 292, 490 + 12 * 20);
  check(
    pieArriba === suma("entreSemana"),
    `entre semana: ${pieArriba} (se esperaba ${suma("entreSemana")})`,
  );
  check(
    pieAbajo === suma("finDeSemana"),
    `fin de semana: ${pieAbajo} (se esperaba ${suma("finDeSemana")})`,
  );
  check(
    texto.includes("Promedio de asistencia mensual"),
    "con su rótulo, como en el original",
  );
}

titulo("7. La segunda columna (el año siguiente) queda en blanco si no hay datos");
{
  const sinDatos =
    enCasilla(379, 447, 141) === "" && enCasilla(379, 447, 490) === "";
  check(sinDatos, "sin números");
  check(
    enCasilla(299, 379, 141) === "Septiembre",
    "pero con sus meses, lista para rellenar a mano",
  );
}

console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
