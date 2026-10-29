// ============================================================================
//  El PDF de un programa libre, de verdad: se genera y se vuelve a leer.
//
//  Usa exactamente la misma función que el botón "Descargar programa"
//  (dibujarPrograma), así que lo que se comprueba aquí es lo que baja el
//  navegador. El archivo se deja en .tmp/ para poder mirarlo con los ojos.
//
//    npx tsx scripts/test-programa-libre-pdf.mts
// ============================================================================
import "../src/lib/pdf-node-polyfills.js";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { mkdir, writeFile } from "node:fs/promises";
import {
  filasDelPrograma,
  nombreArchivo,
  type Programa,
} from "../src/lib/programa-libre.js";
import { dibujarPrograma } from "../src/lib/programa-libre-pdf.js";
import { extractPdfItems } from "../src/lib/pdf-text.js";

let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};

const JUE_SAB = { midweekDay: 4, weekendDay: 6 };

const programa: Programa = {
  titulo: "Programa de aseo del Salón del Reino",
  anio: 2026,
  meses: [10, 11],
  queDias: "ambos",
  columnas: [
    { id: "a", titulo: "Responsable" },
    { id: "b", titulo: "Ayudante" },
    { id: "c", titulo: "Zona" },
  ],
  valores: {
    "2026-10-01": { a: "Juan Pérez", b: "Pedro Ruiz", c: "Auditorio" },
    "2026-10-03": { a: "Andrés Soto", c: "Baños" },
    "2026-11-05": { a: "Mario Díaz", b: "Juan Pérez", c: "Entrada" },
  },
};

console.log("PDF DEL PROGRAMA LIBRE\n");

const filas = filasDelPrograma(
  programa.anio,
  programa.meses,
  programa.queDias,
  JUE_SAB,
);
console.log(`  ${filas.length} fechas en ${programa.meses.length} meses\n`);

const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
dibujarPrograma(doc, autoTable, programa, filas);
const bytes = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);

check(bytes.length > 1000, `el PDF tiene contenido (${bytes.length} bytes)`);

// Se guarda para poder abrirlo y mirarlo.
await mkdir(".tmp", { recursive: true });
const ruta = `.tmp/${nombreArchivo(programa)}`;
await writeFile(ruta, bytes);
console.log(`  guardado en ${ruta}\n`);

// --- Lo que de verdad quedó escrito dentro ---
const items = await extractPdfItems(bytes);
const texto = items.map((i) => i.text).join(" ").replace(/\s+/g, " ");

check(
  texto.includes("PROGRAMA DE ASEO DEL SALÓN DEL REINO"),
  "el título sale como encabezado, en mayúsculas",
);
check(texto.includes("OCTUBRE 2026"), "la cabecera de octubre");
check(texto.includes("NOVIEMBRE 2026"), "la cabecera de noviembre");
check(
  texto.includes("RESPONSABLE") && texto.includes("AYUDANTE") && texto.includes("ZONA"),
  "los títulos de las tres columnas puestas a mano",
);
check(texto.includes("DÍA"), "la columna del día");
check(
  texto.includes("Juan Pérez") &&
    texto.includes("Pedro Ruiz") &&
    texto.includes("Andrés Soto") &&
    texto.includes("Mario Díaz"),
  "los cuatro nombres escritos, con sus tildes",
);
check(texto.includes("Auditorio") && texto.includes("Baños"), "las zonas escritas");

// Las fechas: deben estar TODAS, también las que quedaron en blanco.
const faltantes = filas.filter((f) => !texto.includes(f.etiqueta));
check(
  faltantes.length === 0,
  `las ${filas.length} fechas salen aunque estén vacías (faltan ${faltantes.length})`,
);

// Y nada de lo que no se escribió.
check(!texto.includes("undefined"), "no se cuela ningún 'undefined'");
check(!texto.includes("[object"), "ni ningún objeto sin convertir");

// --- Un programa de una sola columna y un solo mes ---
const simple: Programa = {
  titulo: "Salidas al servicio",
  anio: 2026,
  meses: [10],
  queDias: "finsemana",
  columnas: [{ id: "x", titulo: "Conductor" }],
  valores: { "2026-10-03": { x: "Pedro Ruiz" } },
};
const filas2 = filasDelPrograma(simple.anio, simple.meses, simple.queDias, JUE_SAB);
const doc2 = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
dibujarPrograma(doc2, autoTable, simple, filas2);
const texto2 = (
  await extractPdfItems(new Uint8Array(doc2.output("arraybuffer") as ArrayBuffer))
)
  .map((i) => i.text)
  .join(" ")
  .replace(/\s+/g, " ");
console.log("");
check(texto2.includes("SALIDAS AL SERVICIO"), "un programa de una sola columna: el título");
check(texto2.includes("CONDUCTOR"), "y su única columna");
check(!texto2.includes("NOVIEMBRE"), "sin meses que no se pidieron");
check(
  filas2.every((f) => texto2.includes(f.etiqueta)),
  "con solo los sábados",
);

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
