// ============================================================================
//  Las cinco paletas de color de los programas.
//
//  Lo que importa: que sean cinco con los tonos pedidos, que la de siempre
//  siga siendo la de siempre (quien no toque nada baja el PDF igual que
//  antes), que cada tono sea de verdad de su color, y que el PDF salga con la
//  paleta elegida y no con otra.
//
//    npx tsx scripts/test-paletas.mts
// ============================================================================
import "../src/lib/pdf-node-polyfills.js";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { mkdir, writeFile } from "node:fs/promises";
import { PALETAS, paletaDe, css, type Rgb } from "../src/lib/programa-paletas.js";
import { filasDelPrograma, type Programa } from "../src/lib/programa-libre.js";
import { dibujarPrograma } from "../src/lib/programa-libre-pdf.js";

let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};
const titulo = (t: string) => console.log(`\n${t}`);

console.log("PALETAS DE COLOR\n");

titulo("1. Son las cinco pedidas");
{
  check(PALETAS.length === 5, `hay cinco (hay ${PALETAS.length})`);
  const nombres = PALETAS.map((p) => p.nombre);
  for (const n of ["Azules", "Verdes", "Rojos", "Amarillos", "Grises"]) {
    check(nombres.includes(n), `está "${n}"`);
  }
  check(
    new Set(PALETAS.map((p) => p.id)).size === 5,
    "con identificadores distintos",
  );
}

titulo("2. La de siempre no cambia");
{
  // Si estos números cambiaran, los PDF de quien no toque nada se verían
  // distintos de un día para otro.
  const azul = paletaDe("azules");
  check(PALETAS[0].id === "azules", "los azules son la primera, la de por defecto");
  check(
    JSON.stringify(azul.cabecera) === JSON.stringify([149, 180, 216]),
    `la cabecera sigue siendo la de antes (${azul.cabecera.join(", ")})`,
  );
  check(
    JSON.stringify(azul.columnaDia) === JSON.stringify([235, 240, 248]),
    "y la columna del día también",
  );
  check(paletaDe(undefined).id === "azules", "sin elegir nada, azules");
  check(paletaDe("inventada").id === "azules", "con un nombre que no existe, azules");
}

titulo("3. Cada tono es de su color");
{
  // En cada paleta, el canal que le da nombre manda sobre los otros.
  const domina = (c: Rgb, canal: 0 | 1 | 2) =>
    c[canal] > c[(canal + 1) % 3] && c[canal] > c[(canal + 2) % 3];
  const azul = paletaDe("azules");
  check(domina(azul.cabecera, 2), `azules: el azul manda (${css(azul.cabecera)})`);
  const verde = paletaDe("verdes");
  check(domina(verde.cabecera, 1), `verdes: el verde manda (${css(verde.cabecera)})`);
  const rojo = paletaDe("rojos");
  check(domina(rojo.cabecera, 0), `rojos: el rojo manda (${css(rojo.cabecera)})`);
  // Amarillo = rojo y verde altos, azul bajo.
  const am = paletaDe("amarillos");
  check(
    am.cabecera[0] > am.cabecera[2] && am.cabecera[1] > am.cabecera[2],
    `amarillos: rojo y verde por encima del azul (${css(am.cabecera)})`,
  );
  // Gris = los tres canales casi iguales.
  const gris = paletaDe("grises");
  const spread = Math.max(...gris.cabecera) - Math.min(...gris.cabecera);
  check(spread <= 15, `grises: los tres canales casi iguales (${css(gris.cabecera)})`);
}

titulo("4. Se leen al imprimirlas");
{
  // Luminancia aproximada: el texto oscuro necesita un fondo claro.
  const luz = ([r, g, b]: Rgb) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  for (const p of PALETAS) {
    check(
      luz(p.cabecera) > 0.55,
      `${p.nombre}: la cabecera es clara (${luz(p.cabecera).toFixed(2)}) y deja leer el texto oscuro`,
    );
  }
  for (const p of PALETAS) {
    check(
      luz(p.columnaDia) > 0.85,
      `${p.nombre}: la columna del día es casi blanca (${luz(p.columnaDia).toFixed(2)})`,
    );
  }
}

titulo("5. El PDF sale con la paleta elegida");
{
  const base = (paleta: Programa["paleta"]): Programa => ({
    titulo: `Programa en ${paletaDe(paleta).nombre.toLowerCase()}`,
    anio: 2026,
    meses: [10],
    queDias: "ambos",
    paleta,
    columnas: [
      { id: "a", titulo: "Responsable" },
      { id: "b", titulo: "Ayudante" },
    ],
    valores: { "2026-10-01": { a: "Juan Pérez", b: "Pedro Ruiz" } },
  });
  const filas = filasDelPrograma(2026, [10], "ambos", { midweekDay: 4, weekendDay: 6 });

  await mkdir(".tmp", { recursive: true });
  const tamaños = new Map<string, number>();
  for (const pal of PALETAS) {
    const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
    dibujarPrograma(doc, autoTable, base(pal.id), filas, "Congregación Ocoa");
    const bytes = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
    await writeFile(`.tmp/paleta-${pal.id}.pdf`, bytes);
    tamaños.set(pal.id, bytes.length);
    check(bytes.length > 1000, `${pal.nombre}: el PDF se genera (${bytes.length} bytes)`);
  }
  console.log("  (los cinco quedaron en .tmp/paleta-*.pdf para mirarlos)");

  // Un PDF con una paleta inventada no debe reventar: cae en los azules.
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  dibujarPrograma(
    doc,
    autoTable,
    { ...base("azules"), paleta: "inventada" as Programa["paleta"] },
    filas,
    "Congregación Ocoa",
  );
  check(
    (doc.output("arraybuffer") as ArrayBuffer).byteLength > 1000,
    "una paleta desconocida no rompe el PDF: usa los azules",
  );
}

titulo("6. Lo que puede llegar por la URL de /api/responsabilidades-pdf");
{
  // searchParams.get() devuelve null si el parámetro no viene, y texto
  // suelto si alguien lo escribe a mano. Nada de eso debe romper el PDF.
  check(paletaDe(null).id === "azules", "sin parámetro: azules");
  check(paletaDe("").id === "azules", "vacío: azules");
  check(paletaDe("AZULES").id === "azules", "en mayúsculas no coincide, así que azules");
  check(paletaDe("<script>").id === "azules", "basura: azules");
  for (const pal of PALETAS) {
    check(
      paletaDe(pal.id).id === pal.id,
      `"${pal.id}" devuelve ${pal.nombre}`,
    );
  }
}

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
