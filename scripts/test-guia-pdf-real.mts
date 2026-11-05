// ============================================================================
//  El lector de la Guía, contra un PDF DE VERDAD.
//
//  El PDF no está en el repositorio (es una publicación con derechos y el
//  repositorio es público): se le pasa la ruta al ejecutar. Si no se indica
//  ninguna, la prueba se salta y lo dice, en vez de fallar.
//
//    npx tsx scripts/test-guia-pdf-real.mts "C:/.../mwb_S_202701.pdf"
//    npm run test:guia-real -- "C:/.../mwb_S_202701.pdf"
//
//  Comprueba dos cosas distintas:
//
//   A. CUALQUIER guía: las semanas van en orden, las partes están numeradas de
//      corrido sin huecos, cada semana trae sus tres canciones y su lectura, y
//      la planilla generada se vuelve a leer igual (ida y vuelta completa).
//
//   B. Si es la guía de ENERO Y FEBRERO DE 2027, además se comprueba una por
//      una las 8 semanas con sus canciones y su número de partes, que es el
//      caso con el que se validó el lector.
// ============================================================================
import { readFile, access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { readdir } from "node:fs/promises";
import { extractPdfItems } from "../src/lib/pdf-text.js";
import { lineasDePdf } from "../src/lib/pdf-lines.js";
import { leerGuia } from "../src/lib/vymc-pdf.js";
import { loadWorkbook } from "../src/lib/xlsx-load.js";
import { escribirGuiaEnPlantilla } from "../src/lib/vymc-xlsx.js";
import { parseVymc } from "../src/lib/vymc-parser.js";

let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};
const titulo = (t: string) => console.log(`\n${t}`);

/** Ruta del PDF: argumento, variable de entorno, o el último mwb_*.pdf bajado. */
async function rutaDelPdf(): Promise<string | null> {
  const pedida = process.argv[2] ?? process.env.GUIA_PDF;
  if (pedida) {
    try {
      await access(pedida);
      return pedida;
    } catch {
      console.log(`No existe el archivo indicado: ${pedida}`);
      return null;
    }
  }
  const descargas = path.join(homedir(), "Downloads");
  try {
    const todos = (await readdir(descargas)).filter((f) => /^mwb_.*\.pdf$/i.test(f));
    if (todos.length === 0) return null;
    return path.join(descargas, todos.sort().reverse()[0]);
  } catch {
    return null;
  }
}

const ruta = await rutaDelPdf();
if (!ruta) {
  console.log(
    "SALTADA: no se indicó ningún PDF de la Guía.\n" +
      '  npx tsx scripts/test-guia-pdf-real.mts "RUTA/DEL/mwb_S_202701.pdf"',
  );
  process.exit(0);
}

console.log(`GUÍA DE VERDAD: ${path.basename(ruta)}\n`);
const items = await extractPdfItems(new Uint8Array(await readFile(ruta)));
const guia = leerGuia(lineasDePdf(items));
console.log(`  ${guia.titulo} · ${guia.semanas.length} semana(s)`);

// ---------------------------------------------------------------------------
titulo("A. Cualquier guía: coherencia de lo leído");
check(guia.semanas.length >= 4, `trae al menos 4 semanas (${guia.semanas.length})`);
check(
  guia.anio >= 2020 && guia.anio <= 2100,
  `el año de la portada es razonable (${guia.anio})`,
);
check(guia.meses.length >= 1, `y los meses (${guia.meses.join(", ")})`);
check(
  guia.avisos.length === 0,
  guia.avisos.length === 0
    ? "sin nada que revisar"
    : `hay ${guia.avisos.length} aviso(s): ${guia.avisos.join(" | ")}`,
);

{
  const fechas = guia.semanas.map((s) => s.inicioISO);
  const enOrden = fechas.every((f, i) => i === 0 || f > fechas[i - 1]);
  check(enOrden, `las semanas van en orden: ${fechas[0]} … ${fechas[fechas.length - 1]}`);

  let malas = 0;
  for (const s of guia.semanas) {
    if (s.partes.length === 0) continue; // semana especial: tiene su nota
    const nums = s.partes.map((p) => p.numero);
    const corrido = nums.every((n, i) => n === i + 1);
    const tresCanciones = !!(s.cancionInicio && s.cancionIntermedia && s.cancionFinal);
    const tieneSecciones =
      s.partes.some((p) => p.seccion === "TESOROS") &&
      s.partes.some((p) => p.seccion === "VC");
    if (!corrido || !tresCanciones || !s.lectura || !tieneSecciones) {
      malas++;
      console.log(
        `     ✗ ${s.etiqueta}: números ${nums.join(",")} · canciones ` +
          `${s.cancionInicio}/${s.cancionIntermedia}/${s.cancionFinal} · lectura "${s.lectura}"`,
      );
    }
  }
  check(
    malas === 0,
    `las ${guia.semanas.length} semanas están completas y numeradas de corrido`,
  );
  check(
    guia.semanas.every((s) => s.partes.every((p) => p.duracion !== "")),
    "todas las partes indican su duración",
  );
  check(
    guia.semanas.every((s) => s.partes.every((p) => !/^\d+\.\s/.test(p.titulo))),
    "y ningún título arrastra el número por delante (lo pone la planilla)",
  );
}

// ---------------------------------------------------------------------------
titulo("B. Ida y vuelta: PDF -> planilla -> carga masiva");
{
  const wb = await loadWorkbook(await readFile("src/assets/plantilla-vymc.xlsx"));
  escribirGuiaEnPlantilla(wb, guia);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const leidas = parseVymc(await loadWorkbook(buf), 1999);

  check(
    leidas.length === guia.semanas.length,
    `vuelven las mismas ${guia.semanas.length} semanas (${leidas.length})`,
  );
  check(
    leidas.every((w) => w.date.getFullYear() !== 1999),
    "ninguna cae en el año de respaldo: el año sale del nombre de la hoja",
  );

  let distintas = 0;
  for (const [i, w] of leidas.entries()) {
    const s = guia.semanas[i];
    if (!s) break;
    const mismaFecha = w.date.toISOString().slice(0, 10) === s.inicioISO;
    const mismasCanciones =
      w.songStart === s.cancionInicio &&
      w.songMiddle === s.cancionIntermedia &&
      w.songEnd === s.cancionFinal;
    const cuenta = (sec: string) => s.partes.filter((p) => p.seccion === sec).length;
    const mismasPartes =
      w.tesoros.length === cuenta("TESOROS") &&
      w.smm.length === cuenta("SMM") &&
      w.vc.length === cuenta("VC");
    if (!mismaFecha || !mismasCanciones || !mismasPartes || w.reading !== s.lectura) {
      distintas++;
      console.log(
        `     ✗ ${s.etiqueta}: ${w.date.toISOString().slice(0, 10)} vs ${s.inicioISO} · ` +
          `${w.songStart}/${w.songMiddle}/${w.songEnd} · ` +
          `${w.tesoros.length}/${w.smm.length}/${w.vc.length} vs ` +
          `${cuenta("TESOROS")}/${cuenta("SMM")}/${cuenta("VC")}`,
      );
    }
  }
  check(distintas === 0, "cada semana vuelve con su fecha, canciones, lectura y partes");

  // Los títulos, uno por uno: es lo que acaba siendo el nombre de la asignación.
  const titulosPdf = guia.semanas.flatMap((s) =>
    s.partes.map((p) => `${p.numero}. ${p.titulo}`),
  );
  const titulosExcel = leidas.flatMap((w) =>
    [...w.tesoros, ...w.smm, ...w.vc].map((p) => p.label),
  );
  check(
    titulosPdf.length === titulosExcel.length,
    `${titulosPdf.length} títulos de ida, ${titulosExcel.length} de vuelta`,
  );
  const difs = titulosPdf.filter((t) => !titulosExcel.includes(t));
  check(difs.length === 0, `todos los títulos llegan intactos${difs.length ? `: falta "${difs[0]}"` : ""}`);
}

// ---------------------------------------------------------------------------
//  C. La guía de enero y febrero de 2027, semana por semana.
// ---------------------------------------------------------------------------
const ESPERADO: Record<string, [string, string, string, number]> = {
  "4-10 de Enero": ["83", "2", "164", 8],
  "11-17 de Enero": ["39", "56", "98", 8],
  "18-24 de Enero": ["130", "58", "159", 8],
  "25-31 de Enero": ["30", "3", "94", 9],
  "1-7 de Febrero": ["11", "76", "128", 8],
  "8-14 de Febrero": ["122", "104", "114", 8],
  "15-21 de Febrero": ["49", "73", "124", 8],
  "22-28 de Febrero": ["107", "64", "35", 10],
};

if (/enero y febrero de 2027/i.test(guia.titulo)) {
  titulo("C. Enero y febrero de 2027, semana por semana");
  check(guia.semanas.length === 8, `8 semanas (${guia.semanas.length})`);
  for (const [etiqueta, [c1, c2, c3, partes]] of Object.entries(ESPERADO)) {
    const s = guia.semanas.find((w) => w.etiqueta === etiqueta);
    const bien =
      !!s &&
      s.cancionInicio === c1 &&
      s.cancionIntermedia === c2 &&
      s.cancionFinal === c3 &&
      s.partes.length === partes;
    check(
      bien,
      s
        ? `${etiqueta}: ${s.cancionInicio}/${s.cancionIntermedia}/${s.cancionFinal}, ` +
            `${s.partes.length} partes (se esperaba ${c1}/${c2}/${c3}, ${partes})`
        : `${etiqueta}: no se encontró la semana`,
    );
  }
  // Las dos semanas con secciones más largas de lo normal.
  const cuenta = (etiqueta: string, sec: string) =>
    guia.semanas.find((w) => w.etiqueta === etiqueta)?.partes.filter((p) => p.seccion === sec)
      .length ?? -1;
  check(cuenta("25-31 de Enero", "SMM") === 4, `el 25-31 de enero, Maestros con 4 (${cuenta("25-31 de Enero", "SMM")})`);
  check(
    cuenta("22-28 de Febrero", "SMM") === 4 && cuenta("22-28 de Febrero", "VC") === 3,
    `el 22-28 de febrero, Maestros con 4 y Vida Cristiana con 3 ` +
      `(${cuenta("22-28 de Febrero", "SMM")} y ${cuenta("22-28 de Febrero", "VC")})`,
  );
} else {
  console.log(
    `\nC. (La comprobación semana por semana es de "Enero y Febrero de 2027"; este PDF es "${guia.titulo}", así que se omite.)`,
  );
}

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
