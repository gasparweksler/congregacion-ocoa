// ============================================================================
//  El lector de la Guía de actividades no depende de NADA fijo.
//
//  Todas las pruebas usan guías INVENTADAS, con títulos que no existen y con
//  una cantidad de partes distinta en cada sección: es la única forma de
//  comprobar que el lector se adapta en vez de reconocer la guía de un mes
//  concreto. No hace falta ningún PDF (las pruebas con el PDF real van en
//  test-guia-pdf-real.mts).
//
//  Se comprueba:
//   1. Tildes separadas y palabras sin espacios (así sale el texto del PDF).
//   2. Dos columnas: orden de lectura izquierda y luego derecha.
//   3. Secciones con 2, 5 y 3 partes, con títulos nuevos.
//   4. Partes cuyo título ocupa varias líneas.
//   5. Partes desordenadas por las columnas: se ordenan por su número.
//   6. Semana que cruza de año (29 de diciembre - 4 de enero).
//   7. Semana especial sin reunión: se registra con nota y se avisa.
//   8. Parte sin duración: se avisa y lo demás sigue.
//   9. Tipos de parte nuevos y "a cargo de".
//  10. Ida y vuelta: planilla generada -> la lee la carga masiva.
//  11. Una guía que empieza en diciembre: el año llega bien a la planilla.
//  12. Lo que llega del navegador se valida (normalizarGuia).
//
//    npx tsx scripts/test-guia-pdf.mts
// ============================================================================
import { readFile } from "node:fs/promises";
import { componerTildes, lineasDePdf, type Fragmento, type Linea } from "../src/lib/pdf-lines.js";
import { leerGuia, normalizarGuia, portadaDe } from "../src/lib/vymc-pdf.js";
import { loadWorkbook } from "../src/lib/xlsx-load.js";
import { escribirGuiaEnPlantilla } from "../src/lib/vymc-xlsx.js";
import { parseVymc } from "../src/lib/vymc-parser.js";

let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};
const titulo = (t: string) => console.log(`\n${t}`);

// ---------------------------------------------------------------------------
//  Utilidades para montar guías inventadas
// ---------------------------------------------------------------------------

/** Convierte un guion de texto en líneas, como saldrían del PDF. */
function lineas(textos: string[], page = 2): Linea[] {
  return textos.map((texto, i) => ({
    page,
    col: 0,
    y: 640 - i * 12,
    x: 50,
    texto,
    alto: 9.5,
    fuentes: ["f1"],
  }));
}

const PORTADA = (txt: string): Linea[] => [
  { page: 1, col: 0, y: 500, x: 34, texto: txt, alto: 10, fuentes: ["f0"] },
];

/** Una semana completa con la cantidad de partes que se le pida. */
function semanaInventada(opts: {
  encabezado: string;
  lectura: string;
  cancion1: string;
  cancion2: string;
  cancion3: string;
  tesoros: string[];
  maestros: string[];
  vida: string[];
}): string[] {
  let n = 0;
  const numeradas = (titulos: string[]) => titulos.map((t) => `${++n}. ${t}`);
  return [
    `${opts.encabezado} ${opts.lectura}`,
    `Canción ${opts.cancion1} y oración`,
    "Palabras de introducción (1 min.)",
    "TESOROS",
    "DE LA BIBLIA",
    ...numeradas(opts.tesoros),
    "SEAMOS",
    "MEJORES MAESTROS",
    ...numeradas(opts.maestros),
    "NUESTRA",
    "VIDA CRISTIANA",
    `Canción ${opts.cancion2}`,
    ...numeradas(opts.vida),
    "Palabras de conclusión (3 mins.)",
    `Canción ${opts.cancion3} y oración`,
  ];
}

console.log("EL LECTOR DE LA GUÍA SE ADAPTA A CUALQUIER GUÍA\n");

// ---------------------------------------------------------------------------
titulo("1. Tildes separadas y palabras sin espacios");
{
  // Así sale "Canción 83 y oración" de un PDF de la publicación: letra a
  // letra, sin espacios, y las tildes dibujadas en un renglón aparte.
  const trozos: Fragmento[] = [];
  const poner = (t: string, x: number, w: number, y = 100) =>
    trozos.push({ text: t, x, y, width: w, height: 9.5, font: "f1", page: 1 });
  poner("C", 51, 5.8);
  poner("anci", 57, 17.3);
  poner("o", 74, 5.3);
  poner("n", 79, 5.1);
  poner("8", 87, 5.4);
  poner("3", 93, 5.1);
  poner("y", 101, 4.9);
  poner("or", 108, 8.8);
  poner("aci", 117, 12.2);
  poner("o", 129, 5.3);
  poner("n", 134, 5.1);
  // Los dos acentos, cinco puntos más arriba y encima de cada "o".
  poner("´", 77, 0.2, 105);
  poner("´", 132, 0.2, 105);

  const compuestos = componerTildes(trozos);
  const conTilde = compuestos.filter((f) => f.text === "ó").length;
  check(conTilde === 2, `los dos acentos se pegaron a su letra (${conTilde})`);

  const out = lineasDePdf(trozos);
  check(out.length === 1, `sale una sola línea (${out.length})`);
  check(
    out[0]?.texto === "Canción 83 y oración",
    `y se lee "${out[0]?.texto}"`,
  );

  // Una "n" con virgulilla es una ñ, y una "ı" sin punto con tilde es una í.
  const trozos2: Fragmento[] = [
    { text: "En", x: 10, y: 50, width: 10, height: 9.5, page: 1 },
    { text: "se", x: 21, y: 50, width: 9, height: 9.5, page: 1 },
    { text: "n", x: 30, y: 50, width: 5.2, height: 9.5, page: 1 },
    { text: "a", x: 36, y: 50, width: 5, height: 9.5, page: 1 },
    { text: "b", x: 46, y: 50, width: 5.2, height: 9.5, page: 1 },
    { text: "ı", x: 52, y: 50, width: 2.1, height: 9.5, page: 1 },
    { text: "o", x: 55, y: 50, width: 5.2, height: 9.5, page: 1 },
    { text: "˜", x: 32, y: 55, width: 0.2, height: 9.5, page: 1 },
    { text: "´", x: 52, y: 55, width: 0.2, height: 9.5, page: 1 },
  ];
  check(
    lineasDePdf(trozos2)[0]?.texto === "Enseña bío",
    `la ñ y la í se recomponen: "${lineasDePdf(trozos2)[0]?.texto}"`,
  );
}

// ---------------------------------------------------------------------------
titulo("2. Dos columnas: se lee izquierda y luego derecha");
{
  const f = (t: string, x: number, y: number): Fragmento => ({
    text: t,
    x,
    y,
    width: t.length * 5,
    height: 9.5,
    font: "f1",
    page: 1,
  });
  // Izquierda x≈50, derecha x≈300, y varias líneas compartiendo altura.
  const trozos = [
    f("TESOROS", 50, 600),
    f("SEAMOS", 300, 600),
    f("uno", 50, 580),
    f("cuatro", 300, 580),
    f("dos", 50, 560),
    f("cinco", 300, 560),
    f("tres", 50, 540),
    f("seis", 300, 540),
  ];
  const out = lineasDePdf(trozos);
  check(
    out.map((l) => l.texto).join(" ") === "TESOROS uno dos tres SEAMOS cuatro cinco seis",
    `orden: ${out.map((l) => l.texto).join(" ")}`,
  );
  check(
    out.filter((l) => l.col === 1).length === 4,
    "la columna derecha se reconoce como tal",
  );
}

// ---------------------------------------------------------------------------
titulo("3. Secciones con 2, 5 y 3 partes, con títulos que no existen");
const guiaRara = leerGuia([
  ...PORTADA("MARZO Y ABRIL DE 2031"),
  ...lineas(
    semanaInventada({
      encabezado: "6-12 DE MARZO",
      lectura: "LIBRO INVENTADO 3, 4",
      cancion1: "12",
      cancion2: "140",
      cancion3: "7",
      tesoros: [
        "Un título que nunca se ha usado (8 mins.)",
        "Lectura de la Biblia (4 mins.)",
      ],
      maestros: [
        "Primera práctica distinta (2 mins.)",
        "Segunda práctica distinta (3 mins.)",
        "Tercera práctica distinta (3 mins.)",
        "Cuarta práctica distinta (4 mins.)",
        "Quinta práctica distinta (5 mins.)",
      ],
      vida: [
        "Algo nuevo de la congregación (10 mins.)",
        "Otra cosa nueva (5 mins.)",
        "Estudio bíblico de la congregación (30 mins.)",
      ],
    }),
  ),
]);
{
  const s = guiaRara.semanas[0];
  check(guiaRara.semanas.length === 1, `una semana (${guiaRara.semanas.length})`);
  check(s?.partes.length === 10, `10 partes en total (${s?.partes.length})`);
  const cuenta = (sec: string) => s.partes.filter((p) => p.seccion === sec).length;
  check(cuenta("TESOROS") === 2, `Tesoros con 2 (${cuenta("TESOROS")})`);
  check(cuenta("SMM") === 5, `Maestros con 5 (${cuenta("SMM")})`);
  check(cuenta("VC") === 3, `Vida Cristiana con 3 (${cuenta("VC")})`);
  check(
    s?.partes[0]?.titulo === "Un título que nunca se ha usado (8 mins.)",
    `el título inventado se lee tal cual: "${s?.partes[0]?.titulo}"`,
  );
  check(s?.partes[0]?.duracion === "8 mins.", `con su duración (${s?.partes[0]?.duracion})`);
  check(
    s?.cancionInicio === "12" && s?.cancionIntermedia === "140" && s?.cancionFinal === "7",
    `canciones ${s?.cancionInicio}/${s?.cancionIntermedia}/${s?.cancionFinal}`,
  );
  check(s?.lectura === "LIBRO INVENTADO 3, 4", `lectura "${s?.lectura}"`);
  check(s?.inicioISO === "2031-03-06", `fecha ${s?.inicioISO}`);
  check(guiaRara.avisos.length === 0, `sin avisos (${guiaRara.avisos.join(" | ")})`);
}

// ---------------------------------------------------------------------------
titulo("4. Un título repartido en varias líneas se une hasta la duración");
{
  const g = leerGuia([
    ...PORTADA("MAYO DE 2030"),
    ...lineas([
      "7-13 DE MAYO LIBRO 1",
      "Canción 1 y oración",
      "TESOROS DE LA BIBLIA",
      "1. Un título larguísimo que no cabe en una",
      "sola línea y sigue aquí (10 mins.)",
      "Texto del cuerpo que no es título.",
      "2. Lectura de la Biblia (4 mins.)",
      "NUESTRA VIDA CRISTIANA",
      "Canción 2",
      "3. Estudio bíblico de la congregación (30 mins.)",
      "Palabras de conclusión (3 mins.)",
      "Canción 3 y oración",
    ]),
  ]);
  const p = g.semanas[0]?.partes[0];
  check(
    p?.titulo === "Un título larguísimo que no cabe en una sola línea y sigue aquí (10 mins.)",
    `título unido: "${p?.titulo}"`,
  );
  check(
    g.semanas[0]?.partes.length === 3,
    `y no se tragó el cuerpo: 3 partes (${g.semanas[0]?.partes.length})`,
  );
}

// ---------------------------------------------------------------------------
titulo("5. Partes desordenadas por las columnas: se ordenan por su número");
{
  // Como sale de un PDF a dos columnas: la sección de Maestros empieza en la
  // columna derecha, así que sus partes aparecen ANTES que las de Tesoros 2 y 3.
  const g = leerGuia([
    ...PORTADA("JUNIO DE 2030"),
    ...lineas([
      "3-9 DE JUNIO LIBRO 9",
      "Canción 5 y oración",
      "TESOROS DE LA BIBLIA",
      "1. Primera (10 mins.)",
      "2. Segunda (10 mins.)",
      "3. Tercera (4 mins.)",
      "SEAMOS MEJORES MAESTROS",
      "4. Cuarta (3 mins.)",
      "5. Quinta (4 mins.)",
      "NUESTRA VIDA CRISTIANA",
      "Canción 6",
      "6. Sexta (15 mins.)",
      "7. Estudio bíblico de la congregación (30 mins.)",
      "Palabras de conclusión (3 mins.)",
      "Canción 7 y oración",
    ]),
  ]);
  const s = g.semanas[0];
  check(
    s.partes.map((p) => p.numero).join(",") === "1,2,3,4,5,6,7",
    `numeradas de corrido: ${s.partes.map((p) => p.numero).join(",")}`,
  );
  check(
    s.partes.map((p) => p.seccion).join(",") ===
      "TESOROS,TESOROS,TESOROS,SMM,SMM,VC,VC",
    `secciones en orden: ${s.partes.map((p) => p.seccion).join(",")}`,
  );
}

// ---------------------------------------------------------------------------
titulo("6. Una semana que cruza de año");
{
  const g = leerGuia([
    ...PORTADA("ENERO Y FEBRERO DE 2027"),
    ...lineas(
      semanaInventada({
        encabezado: "29 DE DICIEMBRE-4 DE ENERO",
        lectura: "LIBRO 50",
        cancion1: "1",
        cancion2: "2",
        cancion3: "3",
        tesoros: ["Una (10 mins.)"],
        maestros: ["Dos (3 mins.)"],
        vida: ["Estudio bíblico de la congregación (30 mins.)"],
      }),
    ),
    ...lineas(
      semanaInventada({
        encabezado: "5-11 DE ENERO",
        lectura: "LIBRO 51",
        cancion1: "4",
        cancion2: "5",
        cancion3: "6",
        tesoros: ["Tres (10 mins.)"],
        maestros: ["Cuatro (3 mins.)"],
        vida: ["Estudio bíblico de la congregación (30 mins.)"],
      }),
      3,
    ),
  ]);
  check(g.semanas.length === 2, `dos semanas (${g.semanas.length})`);
  check(
    g.semanas[0]?.inicioISO === "2026-12-29",
    `el 29 de diciembre es de 2026: ${g.semanas[0]?.inicioISO}`,
  );
  check(
    g.semanas[1]?.inicioISO === "2027-01-05",
    `y el 5 de enero de 2027: ${g.semanas[1]?.inicioISO}`,
  );
  check(
    g.semanas[0]?.etiqueta === "29 de Diciembre a 4 de Enero",
    `etiqueta de la semana a caballo: "${g.semanas[0]?.etiqueta}"`,
  );

  // Y al revés: una guía de noviembre-diciembre que acaba en enero.
  const g2 = leerGuia([
    ...PORTADA("NOVIEMBRE Y DICIEMBRE DE 2026"),
    ...lineas(
      semanaInventada({
        encabezado: "28 DE DICIEMBRE-3 DE ENERO",
        lectura: "LIBRO 60",
        cancion1: "1",
        cancion2: "2",
        cancion3: "3",
        tesoros: ["Una (10 mins.)"],
        maestros: ["Dos (3 mins.)"],
        vida: ["Estudio bíblico de la congregación (30 mins.)"],
      }),
    ),
  ]);
  check(
    g2.semanas[0]?.inicioISO === "2026-12-28",
    `diciembre del año de la portada: ${g2.semanas[0]?.inicioISO}`,
  );
}

// ---------------------------------------------------------------------------
titulo("7. Semana especial sin reunión");
{
  const g = leerGuia([
    ...PORTADA("JULIO Y AGOSTO DE 2029"),
    ...lineas(
      semanaInventada({
        encabezado: "2-8 DE JULIO",
        lectura: "LIBRO 1",
        cancion1: "10",
        cancion2: "20",
        cancion3: "30",
        tesoros: ["Una (10 mins.)"],
        maestros: ["Dos (3 mins.)"],
        vida: ["Estudio bíblico de la congregación (30 mins.)"],
      }),
    ),
    ...lineas(
      [
        "9-15 DE JULIO",
        "Esta semana se celebra la asamblea de circuito.",
        "No habrá reunión de Vida y Ministerio.",
      ],
      3,
    ),
    ...lineas(
      semanaInventada({
        encabezado: "16-22 DE JULIO",
        lectura: "LIBRO 2",
        cancion1: "40",
        cancion2: "50",
        cancion3: "60",
        tesoros: ["Tres (10 mins.)"],
        maestros: ["Cuatro (3 mins.)"],
        vida: ["Estudio bíblico de la congregación (30 mins.)"],
      }),
      4,
    ),
  ]);
  check(g.semanas.length === 3, `las tres semanas se registran (${g.semanas.length})`);
  const especial = g.semanas[1];
  check(especial?.partes.length === 0, "la especial no inventa partes");
  check(!!especial?.nota, `y queda con nota: "${especial?.nota?.slice(0, 48)}…"`);
  check(
    g.avisos.some((a) => a.includes("9-15 de Julio")),
    "se avisa indicando QUÉ semana hay que revisar",
  );
  check(
    g.semanas[2]?.partes.length === 3,
    `y la semana siguiente se lee normal (${g.semanas[2]?.partes.length} partes)`,
  );
}

// ---------------------------------------------------------------------------
titulo("8. Una parte sin duración: se avisa y lo demás sigue");
{
  const g = leerGuia([
    ...PORTADA("SEPTIEMBRE DE 2028"),
    ...lineas([
      "4-10 DE SEPTIEMBRE LIBRO 7",
      "Canción 11 y oración",
      "TESOROS DE LA BIBLIA",
      "1. Una parte a la que se le olvidó la duración",
      "2. Lectura de la Biblia (4 mins.)",
      "NUESTRA VIDA CRISTIANA",
      "Canción 12",
      "3. Estudio bíblico de la congregación (30 mins.)",
      "Palabras de conclusión (3 mins.)",
      "Canción 13 y oración",
    ]),
  ]);
  const s = g.semanas[0];
  check(s?.partes.length === 3, `las 3 partes están (${s?.partes.length})`);
  check(s?.partes[0]?.duracion === "", "la primera queda sin duración, no inventada");
  check(
    g.avisos.some((a) => a.includes("no indica duración") && a.includes("4-10 de Septiembre")),
    "y el aviso dice la semana y la parte",
  );
  check(
    s?.partes[1]?.titulo === "Lectura de la Biblia (4 mins.)",
    `sin arrastrar la siguiente: "${s?.partes[1]?.titulo}"`,
  );
}

// ---------------------------------------------------------------------------
titulo("9. Tipos de parte nuevos y quién la presenta");
{
  const g = leerGuia([
    ...PORTADA("OCTUBRE DE 2028"),
    ...lineas([
      "2-8 DE OCTUBRE LIBRO 8",
      "Canción 1 y oración",
      "TESOROS DE LA BIBLIA",
      "1. Primera (10 mins.)",
      "SEAMOS MEJORES MAESTROS",
      "2. Segunda (3 mins.)",
      "MÉTODO QUE NO EXISTÍA. Haz algo nuevo con la publicación.",
      "3. Tercera (5 mins.) Mesa redonda inventada.",
      "4. Cuarta (5 mins.)",
      "Discurso a cargo del superintendente de circuito.",
      "NUESTRA VIDA CRISTIANA",
      "Canción 2",
      "5. Estudio bíblico de la congregación (30 mins.)",
      "Palabras de conclusión (3 mins.)",
      "Canción 3 y oración",
    ]),
  ]);
  const p = g.semanas[0]?.partes ?? [];
  check(p[1]?.tipo === "Método que no existía", `tipo en versalitas: "${p[1]?.tipo}"`);
  check(p[2]?.tipo === "Mesa redonda inventada", `tipo al final del título: "${p[2]?.tipo}"`);
  check(p[3]?.tipo === "Discurso", `tipo con "a cargo de": "${p[3]?.tipo}"`);
  check(
    p[3]?.aCargoDe === "superintendente de circuito",
    `y quién la presenta: "${p[3]?.aCargoDe}"`,
  );
}

// ---------------------------------------------------------------------------
titulo("10. Ida y vuelta: la planilla generada la lee la carga masiva");
{
  const plantilla = await readFile("src/assets/plantilla-vymc.xlsx");
  const wb = await loadWorkbook(plantilla);
  const hoja = escribirGuiaEnPlantilla(wb, guiaRara);
  check(/2031/.test(hoja), `la hoja lleva el año en el nombre: "${hoja}"`);

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const leidas = parseVymc(await loadWorkbook(buf), 1999);
  check(leidas.length === 1, `la carga masiva reconoce 1 semana (${leidas.length})`);
  const w = leidas[0];
  check(
    w?.date.getFullYear() === 2031 && w?.date.getMonth() === 2 && w?.date.getDate() === 6,
    `con la fecha correcta (${w?.date.toISOString().slice(0, 10)}) y el año del nombre de la hoja`,
  );
  check(w?.reading === "LIBRO INVENTADO 3, 4", `y la lectura: "${w?.reading}"`);
  check(
    w?.songStart === "12" && w?.songMiddle === "140" && w?.songEnd === "7",
    `y las tres canciones: ${w?.songStart}/${w?.songMiddle}/${w?.songEnd}`,
  );
  check(
    w?.tesoros.length === 2 && w?.smm.length === 5 && w?.vc.length === 3,
    `con 2/5/3 partes (${w?.tesoros.length}/${w?.smm.length}/${w?.vc.length}): se añadieron las filas que faltaban`,
  );
  check(
    w?.smm[4]?.label === "7. Quinta práctica distinta (5 mins.)",
    `la quinta parte de Maestros existe en la planilla: "${w?.smm[4]?.label}"`,
  );
  check(
    w?.tesoros[0]?.label === "1. Un título que nunca se ha usado (8 mins.)",
    "y los títulos van con su número, como los espera la carga masiva",
  );

  // Las hojas de ejemplo de la plantilla NO deben colarse: crearían reuniones
  // de julio que nadie pidió.
  const libro = await loadWorkbook(buf);
  check(
    libro.worksheets.length === 1,
    `solo queda la hoja generada (${libro.worksheets.map((x) => x.name).join(", ")})`,
  );
}

// ---------------------------------------------------------------------------
titulo("11. Una guía que empieza en diciembre llega bien hasta la carga masiva");
{
  // El caso difícil: la portada dice 2027, pero la primera semana es de
  // diciembre de 2026. La carga masiva arranca con el año del nombre de la
  // hoja y suma uno al pasar de diciembre a enero, así que la hoja tiene que
  // llevar el año de la PRIMERA semana, no el de la portada.
  const g = leerGuia([
    ...PORTADA("ENERO Y FEBRERO DE 2027"),
    ...lineas(
      semanaInventada({
        encabezado: "28 DE DICIEMBRE-3 DE ENERO",
        lectura: "LIBRO A",
        cancion1: "1",
        cancion2: "2",
        cancion3: "3",
        tesoros: ["Una (10 mins.)"],
        maestros: ["Dos (3 mins.)"],
        vida: ["Estudio bíblico de la congregación (30 mins.)"],
      }),
    ),
    ...lineas(
      semanaInventada({
        encabezado: "4-10 DE ENERO",
        lectura: "LIBRO B",
        cancion1: "4",
        cancion2: "5",
        cancion3: "6",
        tesoros: ["Tres (10 mins.)"],
        maestros: ["Cuatro (3 mins.)"],
        vida: ["Estudio bíblico de la congregación (30 mins.)"],
      }),
      3,
    ),
    ...lineas(
      semanaInventada({
        encabezado: "1-7 DE FEBRERO",
        lectura: "LIBRO C",
        cancion1: "7",
        cancion2: "8",
        cancion3: "9",
        tesoros: ["Cinco (10 mins.)"],
        maestros: ["Seis (3 mins.)"],
        vida: ["Estudio bíblico de la congregación (30 mins.)"],
      }),
      4,
    ),
  ]);
  check(
    g.semanas.map((s) => s.inicioISO).join(" ") ===
      "2026-12-28 2027-01-04 2027-02-01",
    `al leer el PDF: ${g.semanas.map((s) => s.inicioISO).join(" ")}`,
  );

  const wb = await loadWorkbook(await readFile("src/assets/plantilla-vymc.xlsx"));
  const hoja = escribirGuiaEnPlantilla(wb, g);
  check(
    hoja === "Enero y Febrero 2026-2027",
    `la hoja lleva los dos años, empezando por el de la primera semana: "${hoja}"`,
  );

  const leidas = parseVymc(
    await loadWorkbook(Buffer.from(await wb.xlsx.writeBuffer())),
    1999,
  );
  check(
    leidas.map((w) => w.date.toISOString().slice(0, 10)).join(" ") ===
      "2026-12-28 2027-01-04 2027-02-01",
    `y al volver de la planilla: ${leidas.map((w) => w.date.toISOString().slice(0, 10)).join(" ")}`,
  );
}

// ---------------------------------------------------------------------------
titulo("12. Lo que llega del navegador se valida");
{
  check(normalizarGuia(null) === null, "null no pasa");
  check(normalizarGuia({ semanas: [] }) === null, "sin semanas, no pasa");
  check(
    normalizarGuia({ semanas: [{ etiqueta: "" }] }) === null,
    "una semana sin etiqueta no sirve",
  );
  const sucia = normalizarGuia({
    anio: 99999,
    meses: [1, 44, "x"],
    titulo: "x".repeat(500),
    semanas: [
      {
        etiqueta: "  1-7 de Enero  ",
        lectura: "LIBRO",
        inicioISO: "no-es-fecha",
        cancionInicio: "abc12",
        cancionFinal: "999999",
        partes: [
          { titulo: "Buena (5 mins.)", numero: "3", seccion: "SMM" },
          { titulo: "", numero: 4 },
          { titulo: "Sin sección", numero: 5, seccion: "HACKEADA" },
        ],
        nota: 123,
      },
    ],
    avisos: ["uno", 2],
  });
  check(sucia !== null, "una semana aprovechable sí pasa");
  check(sucia?.anio !== 99999, `el año imposible se descarta (quedó ${sucia?.anio})`);
  check(
    JSON.stringify(sucia?.meses) === "[1]",
    `los meses inválidos se tiran: ${JSON.stringify(sucia?.meses)}`,
  );
  check(sucia?.titulo.length === 80, `el título se recorta (${sucia?.titulo.length})`);
  check(sucia?.semanas[0]?.etiqueta === "1-7 de Enero", "la etiqueta se limpia");
  check(sucia?.semanas[0]?.inicioISO === "", "una fecha inventada se queda vacía");
  check(
    sucia?.semanas[0]?.cancionInicio === "12" && sucia?.semanas[0]?.cancionFinal === "999",
    `las canciones quedan en números de 3 cifras (${sucia?.semanas[0]?.cancionInicio}/${sucia?.semanas[0]?.cancionFinal})`,
  );
  check(sucia?.semanas[0]?.partes.length === 2, "la parte sin título se descarta");
  check(
    sucia?.semanas[0]?.partes[1]?.seccion === "TESOROS",
    "una sección que no existe cae en Tesoros",
  );
  check(sucia?.semanas[0]?.nota === "", "una nota que no es texto se ignora");
  check(JSON.stringify(sucia?.avisos) === '["uno"]', "y los avisos que no son texto también");

  // La portada se lee aunque venga con las letras separadas.
  const p = portadaDe(PORTADA("E N E R O Y F E B R E R O D E 2 0 2 7"));
  check(
    p.anio === 2027 && JSON.stringify(p.meses) === "[1,2]",
    `portada con letras espaciadas: ${p.anio} meses ${JSON.stringify(p.meses)}`,
  );
}

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
