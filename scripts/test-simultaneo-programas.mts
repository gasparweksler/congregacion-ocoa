// ============================================================================
//  SIMULACIÓN: varias personas creando programas a la vez, en congregaciones
//  distintas y desde dispositivos distintos.
//
//  Lo primero que conviene saber: los programas NO se guardan en el servidor.
//  El editor vive entero en el navegador y el PDF se genera ahí. Así que aquí
//  no hay escrituras que puedan chocar; el riesgo es otro, y más silencioso:
//
//   1. Las paletas son objetos COMPARTIDOS por todo el servidor. Sus colores
//      se pasan por referencia a la librería de tablas. Si ésta los modificara,
//      quedarían cambiados para todas las congregaciones hasta reiniciar.
//   2. Lo mismo con cualquier dato que se calcule una vez y se reparta.
//   3. Y en el servidor sí hay lecturas: días de reunión, publicadores y el
//      PDF de responsabilidades (que ahora recibe la paleta por la URL).
//
//    npx tsx scripts/test-simultaneo-programas.mts
// ============================================================================
import "../src/lib/pdf-node-polyfills.js";
import { PrismaClient } from "@prisma/client";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { readFile } from "node:fs/promises";
import { PALETAS, paletaDe, type PaletaId } from "../src/lib/programa-paletas.js";
import {
  filasDelPrograma,
  repartoDelPrograma,
  type Programa,
} from "../src/lib/programa-libre.js";
import { dibujarPrograma } from "../src/lib/programa-libre-pdf.js";
import { extractPdfItems } from "../src/lib/pdf-text.js";
import { loadWorkbook } from "../src/lib/xlsx-load.js";
import { parseVymc } from "../src/lib/vymc-parser.js";
import { getMeetingDays } from "../src/lib/meeting-days.js";
import { congregationLabel } from "../src/lib/congregation-label.js";

const p = new PrismaClient();
let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};
const titulo = (t: string) => console.log(`\n${t}`);

/** Foto de las paletas, para comparar después de todo el ajetreo. */
const fotoPaletas = () => JSON.stringify(PALETAS);
const PALETAS_AL_EMPEZAR = fotoPaletas();

const DIAS = { midweekDay: 4, weekendDay: 6 };

function programaDe(
  etiqueta: string,
  paleta: PaletaId,
  columnas: string[],
): Programa {
  return {
    titulo: `Programa de ${etiqueta}`,
    anio: 2026,
    meses: [11],
    queDias: "ambos",
    paleta,
    columnas: columnas.map((t, i) => ({ id: `c${i}`, titulo: t })),
    valores: {
      "2026-11-05": Object.fromEntries(
        columnas.map((_, i) => [`c${i}`, `${etiqueta} Hermano ${i + 1}`]),
      ),
      "2026-11-07": { c0: `${etiqueta} Hermano 9` },
    },
  };
}

/** Dibuja el PDF y devuelve su texto y los colores que de verdad usó. */
async function pdfDe(prog: Programa, congregacion: string) {
  const filas = filasDelPrograma(prog.anio, prog.meses, prog.queDias, DIAS);
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  dibujarPrograma(doc, autoTable, prog, filas, congregacion);
  // Los colores de relleno, leídos del contenido que jsPDF va a escribir
  // ("r g b rg"). Se miran aquí y no en los bytes del archivo: es el mismo
  // dato, sin depender de cómo se empaquete.
  const paginas = (doc as unknown as { internal: { pages: string[][] } }).internal.pages;
  const contenido = paginas.slice(1).map((pg) => pg.join("\n")).join("\n");
  const colores = [
    ...new Set(
      [...contenido.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) rg/g)].map((m) =>
        m.slice(1, 4).map((x) => Math.round(parseFloat(x) * 255)).join(","),
      ),
    ),
  ].sort();

  const items = await extractPdfItems(
    new Uint8Array(doc.output("arraybuffer") as ArrayBuffer),
  );
  return {
    texto: items.map((i) => i.text).join(" ").replace(/\s+/g, " "),
    colores,
  };
}

/**
 * ¿Está ese color entre los del PDF? Con un punto de holgura por canal: jsPDF
 * escribe los colores con pocos decimales, así que 226 puede volver como 227.
 */
function llevaColor(colores: string[], rgb: readonly number[]): boolean {
  return colores.some((c) => {
    const v = c.split(",").map(Number);
    return v.length === 3 && v.every((x, i) => Math.abs(x - rgb[i]) <= 1);
  });
}

console.log("SIMULACIÓN · varios programas a la vez\n");

// ===========================================================================
titulo("1. Cinco paletas a la vez: ¿se pisan los colores?");
// ===========================================================================
{
  // Primero, cada una POR SEPARADO: ésta es la verdad contra la que comparar.
  const aSolas = new Map<PaletaId, string[]>();
  for (const pal of PALETAS) {
    const r = await pdfDe(programaDe(pal.nombre, pal.id, ["Responsable", "Ayudante"]), "Congregación Ocoa");
    aSolas.set(pal.id, r.colores);
  }

  // Ahora las cinco EN PARALELO, como cinco personas pulsando a la vez.
  const enParalelo = await Promise.all(
    PALETAS.map(async (pal) => ({
      id: pal.id,
      ...(await pdfDe(programaDe(pal.nombre, pal.id, ["Responsable", "Ayudante"]), "Congregación Ocoa")),
    })),
  );

  for (const r of enParalelo) {
    const esperado = aSolas.get(r.id)!;
    check(
      JSON.stringify(r.colores) === JSON.stringify(esperado),
      `${paletaDe(r.id).nombre}: los mismos colores que a solas (${r.colores.length} tonos)`,
    );
  }

  // Y que de verdad sean distintas entre sí (si no, la comprobación de arriba
  // pasaría aunque todas salieran iguales).
  const distintas = new Set(enParalelo.map((r) => JSON.stringify(r.colores)));
  check(
    distintas.size === PALETAS.length,
    `las cinco salen distintas entre sí (${distintas.size} de ${PALETAS.length})`,
  );

  // Cada PDF lleva el color de SU cabecera, no el de otra.
  for (const pal of PALETAS) {
    const r = enParalelo.find((x) => x.id === pal.id)!;
    check(
      llevaColor(r.colores, pal.cabecera),
      `${pal.nombre}: su cabecera ${pal.cabecera.join(",")} está en el PDF`,
    );
    const ajenas = PALETAS.filter((o) => o.id !== pal.id).filter((o) =>
      llevaColor(r.colores, o.cabecera),
    );
    check(
      ajenas.length === 0,
      `${pal.nombre}: sin la cabecera de ninguna otra paleta`,
    );
  }
}

// ===========================================================================
titulo("2. Las paletas quedaron intactas tras todo ese uso");
// ===========================================================================
{
  check(
    fotoPaletas() === PALETAS_AL_EMPEZAR,
    "los colores compartidos no se modificaron (si no, cambiarían para todas las congregaciones)",
  );
  if (fotoPaletas() !== PALETAS_AL_EMPEZAR) {
    console.log(`     antes:   ${PALETAS_AL_EMPEZAR.slice(0, 200)}`);
    console.log(`     después: ${fotoPaletas().slice(0, 200)}`);
  }
  const azul = paletaDe("azules");
  check(
    JSON.stringify(azul.cabecera) === JSON.stringify([149, 180, 216]),
    `la cabecera de los azules sigue siendo la de siempre (${azul.cabecera.join(", ")})`,
  );
}

// ===========================================================================
titulo("3. Varias personas, varias congregaciones, varios programas a la vez");
// ===========================================================================
{
  // Diez programas distintos lanzados juntos, con paletas y columnas distintas.
  const encargos = [
    { quien: "Ocoa A", cong: "Congregación Ocoa", pal: "azules" as const, cols: ["Acomodadores", "Audio"] },
    { quien: "Ocoa B", cong: "Congregación Ocoa", pal: "rojos" as const, cols: ["Aseo"] },
    { quien: "Torna A", cong: "Congregación Tornagaleones", pal: "verdes" as const, cols: ["Presidente", "Lector", "Oración"] },
    { quien: "Torna B", cong: "Congregación Tornagaleones", pal: "grises" as const, cols: ["Conductor"] },
    { quien: "Talca A", cong: "Congregación Criollo Haitiano Talca", pal: "amarillos" as const, cols: ["Micrófono 1", "Micrófono 2"] },
    { quien: "Talca B", cong: "Congregación Criollo Haitiano Talca", pal: "azules" as const, cols: ["Plataforma"] },
    { quien: "Ocoa C", cong: "Congregación Ocoa", pal: "verdes" as const, cols: ["Salida 1", "Salida 2"] },
    { quien: "Torna C", cong: "Congregación Tornagaleones", pal: "amarillos" as const, cols: ["Video"] },
    { quien: "Talca C", cong: "Congregación Criollo Haitiano Talca", pal: "grises" as const, cols: ["Limpieza"] },
    { quien: "Ocoa D", cong: "Congregación Ocoa", pal: "rojos" as const, cols: ["Entrada", "Auditorio"] },
  ];

  const hechos = await Promise.all(
    encargos.map(async (e) => ({
      ...e,
      ...(await pdfDe(programaDe(e.quien, e.pal, e.cols), e.cong)),
    })),
  );

  check(hechos.length === encargos.length, `los ${encargos.length} programas se generaron`);

  for (const h of hechos) {
    // Su propio título, su propia congregación, sus propias columnas.
    check(
      h.texto.includes(`PROGRAMA DE ${h.quien.toUpperCase()}`),
      `${h.quien}: lleva su título`,
    );
    check(h.texto.includes(h.cong), `${h.quien}: lleva "${h.cong}"`);
    const suyas = h.cols.every((c) => h.texto.includes(c.toUpperCase()));
    check(suyas, `${h.quien}: lleva sus columnas (${h.cols.join(", ")})`);

    // Y nada de los demás.
    const ajenos = hechos
      .filter((o) => o.quien !== h.quien)
      .filter((o) => h.texto.includes(`Programa de ${o.quien}`.toUpperCase()));
    check(ajenos.length === 0, `${h.quien}: sin el título de ningún otro`);

    const congsAjenas = [...new Set(encargos.map((e) => e.cong))]
      .filter((c) => c !== h.cong)
      .filter((c) => h.texto.includes(c));
    check(
      congsAjenas.length === 0,
      `${h.quien}: sin el nombre de otra congregación`,
    );

    // Los nombres escritos son los suyos.
    const nombresAjenos = hechos
      .filter((o) => o.quien !== h.quien)
      .filter((o) => h.texto.includes(`${o.quien} Hermano 1`));
    check(nombresAjenos.length === 0, `${h.quien}: sin hermanos de otro programa`);
  }
}

// ===========================================================================
titulo("4. El resumen del reparto, con todos a la vez");
// ===========================================================================
{
  const filas = filasDelPrograma(2026, [11], "ambos", DIAS);
  const progs = PALETAS.map((pal, i) =>
    programaDe(`Reparto ${i}`, pal.id, ["Responsable", "Ayudante"]),
  );
  const aSolas = progs.map((pr) => repartoDelPrograma(pr, filas));
  const juntos = await Promise.all(progs.map(async (pr) => repartoDelPrograma(pr, filas)));
  check(
    JSON.stringify(aSolas) === JSON.stringify(juntos),
    "el mismo resumen calculado a la vez que por separado",
  );
  check(
    juntos.every((r, i) => r.hermanos.every((h) => h.nombre.startsWith(`Reparto ${i}`))),
    "cada resumen solo nombra a los hermanos de su programa",
  );
}

// ===========================================================================
titulo("5. En el servidor: tres congregaciones leyendo su página a la vez");
// ===========================================================================
{
  const congs = await p.congregation.findMany({
    select: { id: true, name: true, midweekDay: true, weekendDay: true },
  });
  if (congs.length < 2) {
    console.log("  (hace falta más de una congregación: se omite)");
  } else {
    // Lo que carga /programas/nuevo: días de reunión y lista de publicadores.
    const cargas = await Promise.all(
      congs.map(async (c) => ({
        nombre: c.name,
        esperado: { midweekDay: c.midweekDay, weekendDay: c.weekendDay },
        dias: await getMeetingDays(c.id),
        pubs: await p.publisher.findMany({
          where: { congregationId: c.id, active: true },
          select: { fullName: true },
        }),
        etiqueta: congregationLabel(c.name),
      })),
    );

    for (const c of cargas) {
      check(
        JSON.stringify(c.dias) === JSON.stringify(c.esperado),
        `${c.nombre}: recibe SUS días de reunión (${c.dias.midweekDay}/${c.dias.weekendDay})`,
      );
      check(
        c.etiqueta === `Congregación ${c.nombre}`,
        `${c.nombre}: y su propio nombre para el PDF`,
      );
    }

    // Ningún publicador aparece en dos listas.
    for (const a of cargas) {
      for (const b of cargas) {
        if (a.nombre === b.nombre) continue;
        const comunes = a.pubs
          .map((x) => x.fullName)
          .filter((n) => b.pubs.some((y) => y.fullName === n));
        check(
          comunes.length === 0,
          `${a.nombre} y ${b.nombre}: ningún publicador en común (${a.pubs.length} y ${b.pubs.length})`,
        );
      }
    }
  }
}

// ===========================================================================
titulo("6. Tres Excel subiéndose a la vez");
// ===========================================================================
{
  const plantilla = await readFile("src/assets/plantilla-vymc.xlsx");
  // El mismo archivo subido por tres a la vez: cada lectura es suya.
  const lecturas = await Promise.all(
    [2026, 2027, 2028].map(async (anio) => {
      const wb = await loadWorkbook(plantilla);
      return { anio, semanas: parseVymc(wb, anio) };
    }),
  );
  for (const l of lecturas) {
    check(l.semanas.length > 0, `año ${l.anio}: reconoce ${l.semanas.length} semana(s)`);
    check(
      l.semanas.every((w) => w.date.getFullYear() === l.anio),
      `año ${l.anio}: todas sus semanas son de SU año, no del de otra subida`,
    );
  }
  const cuantas = new Set(lecturas.map((l) => l.semanas.length));
  check(cuantas.size === 1, "las tres leen el mismo número de semanas");
}

// ===========================================================================
titulo("7. Un mismo hermano en dos dispositivos, dos programas distintos");
// ===========================================================================
{
  // Mismo usuario, dos pestañas: en el navegador cada una tiene su borrador.
  const movil = programaDe("Desde el móvil", "rojos", ["Aseo"]);
  const pc = programaDe("Desde el PC", "verdes", ["Audio", "Video"]);
  const [a, b] = await Promise.all([
    pdfDe(movil, "Congregación Ocoa"),
    pdfDe(pc, "Congregación Ocoa"),
  ]);
  check(
    a.texto.includes("PROGRAMA DE DESDE EL MÓVIL") && !a.texto.includes("DESDE EL PC"),
    "el del móvil sale con lo del móvil",
  );
  check(
    b.texto.includes("PROGRAMA DE DESDE EL PC") && !b.texto.includes("DESDE EL MÓVIL"),
    "y el del PC con lo del PC",
  );
  check(
    llevaColor(a.colores, paletaDe("rojos").cabecera) &&
      !llevaColor(a.colores, paletaDe("verdes").cabecera),
    "cada uno con su paleta, sin mezclarse",
  );
}

// ===========================================================================
titulo("8. Las paletas siguen intactas al final del todo");
// ===========================================================================
check(
  fotoPaletas() === PALETAS_AL_EMPEZAR,
  "tras los 20+ programas generados, los colores compartidos siguen igual",
);

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
await p.$disconnect();
process.exit(fallos === 0 ? 0 : 1);
