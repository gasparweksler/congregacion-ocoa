// ============================================================================
//  Prueba de "Generar reuniones ahora" (desde el PDF de la Guía).
//
//  Cuatro partes:
//   1. La traducción de la Guía a semanas de carga masiva (módulo puro).
//   2. Que el camino del PDF y el del Excel dejen LO MISMO: se escribe la
//      planilla con la guía, se vuelve a leer con el lector del Excel y se
//      compara con lo que produce el camino directo.
//   3. La creación de verdad contra la base: las dos oraciones siempre, sin
//      duplicados al repetir, sin tocar lo que ya había y sin salirse de la
//      congregación. Se hace en congregaciones de prueba que se borran al
//      final (y se limpian restos de ejecuciones anteriores).
//   4. El PDF del programa: canción y oración final aunque nadie las tenga
//      asignadas, y las asignaciones añadidas a mano también se imprimen.
//
//    npm run test:guia-reuniones
// ============================================================================
import { readFile } from "node:fs/promises";
import path from "node:path";
import { jsPDF } from "jspdf";
import { PrismaClient } from "@prisma/client";
import { loadWorkbook } from "../src/lib/xlsx-load.js";
import { escribirGuiaEnPlantilla } from "../src/lib/vymc-xlsx.js";
import { parseVymc } from "../src/lib/vymc-parser.js";
import { semanasDeLaGuia } from "../src/lib/guia-a-semanas.js";
import { crearReunionesDesdeSemanas, SLOTS_SIEMPRE } from "../src/lib/crear-reuniones.js";
import { buildProgramaPdf } from "../src/lib/programa-pdf.js";
import type { GuiaLeida, GuiaParte, Seccion } from "../src/lib/vymc-pdf.js";

const prisma = new PrismaClient();

let ok = 0;
let bad = 0;
const check = (cond: boolean, texto: string, detalle = "") => {
  if (cond) {
    ok++;
    console.log(`  ✅ ${texto}`);
  } else {
    bad++;
    console.log(`  ❌ ${texto}${detalle ? ` — ${detalle}` : ""}`);
  }
};

const parte = (
  numero: number,
  titulo: string,
  seccion: Seccion,
  tipo = "",
): GuiaParte => ({ numero, titulo, duracion: "", tipo, aCargoDe: "", seccion });

function guiaDePrueba(): GuiaLeida {
  return {
    anio: 2030,
    meses: [3],
    titulo: "Marzo de 2030",
    avisos: [],
    semanas: [
      {
        inicioISO: "2030-03-04",
        etiqueta: "4-10 de Marzo",
        encabezado: "4-10 DE MARZO",
        lectura: "PROVERBIOS 1, 2",
        cancionInicio: "11",
        cancionIntermedia: "22",
        cancionFinal: "33",
        nota: "",
        partes: [
          parte(1, "Tesoros de la Biblia (10 mins.)", "TESOROS"),
          parte(2, "Busquemos perlas escondidas (10 mins.)", "TESOROS"),
          parte(3, "Lectura de la Biblia (4 mins.)", "TESOROS"),
          parte(4, "Empiece conversaciones (3 mins.)", "SMM", "De casa en casa"),
          parte(5, "Haga revisitas (4 mins.)", "SMM"),
          parte(6, "Discurso (5 mins.)", "SMM"),
          parte(7, "Necesidades de la congregación (10 mins.)", "VC"),
          parte(8, "Estudio bíblico de la congregación (30 mins.)", "VC"),
        ],
      },
      {
        inicioISO: "2030-03-11",
        etiqueta: "11-17 de Marzo",
        encabezado: "11-17 DE MARZO",
        lectura: "PROVERBIOS 3, 4",
        cancionInicio: "44",
        cancionIntermedia: "55",
        cancionFinal: "66",
        nota: "",
        partes: [
          parte(1, "Tesoros de la Biblia (10 mins.)", "TESOROS"),
          parte(2, "Busquemos perlas escondidas (10 mins.)", "TESOROS"),
          parte(3, "Lectura de la Biblia (4 mins.)", "TESOROS"),
          parte(4, "Haga discípulos (5 mins.)", "SMM"),
          parte(5, "Explique sus creencias (5 mins.)", "SMM"),
          parte(6, "Estudio bíblico de la congregación (30 mins.)", "VC"),
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
console.log("\n--- 1. De la Guía a las semanas ---");
const guia = guiaDePrueba();
const { semanas, descartadas } = semanasDeLaGuia(guia);

check(semanas.length === 2, "las dos semanas se convierten", `${semanas.length}`);
check(descartadas.length === 0, "y no se descarta ninguna");
check(
  semanas[0].date.getFullYear() === 2030 &&
    semanas[0].date.getMonth() === 2 &&
    semanas[0].date.getDate() === 4,
  "la fecha es la del lunes de la semana",
  semanas[0].date.toISOString(),
);
check(semanas[0].date.getHours() === 12, "guardada a mediodía, como todo el sistema");
check(semanas[0].label === "4-10 de Marzo", "la etiqueta es la que se ve en pantalla");
check(semanas[0].reading === "PROVERBIOS 1, 2", "la lectura semanal viaja");
check(
  semanas[0].songStart === "11" &&
    semanas[0].songMiddle === "22" &&
    semanas[0].songEnd === "33",
  "y las tres canciones",
);
check(
  semanas[0].tesoros[0].label === "1. Tesoros de la Biblia (10 mins.)",
  "el título lleva su número delante, como en la planilla",
  semanas[0].tesoros[0].label,
);
check(
  semanas[0].smm.length === 3 && semanas[0].vc.length === 2,
  "cada parte va a su sección",
  `${semanas[0].smm.length}/${semanas[0].vc.length}`,
);
check(
  semanas.every((w) => !w.pres && !w.orac && !w.clos),
  "la Guía no trae nombres: nadie queda asignado por invento",
);

console.log("\n--- 2. Semanas que no se pueden crear ---");
const rara = guiaDePrueba();
rara.semanas[0].inicioISO = "";
rara.semanas[0].etiqueta = "la semana que viene";
rara.semanas[1].partes = [];
const malas = semanasDeLaGuia(rara);
check(malas.semanas.length === 0, "no se crea nada a ciegas", `${malas.semanas.length}`);
check(malas.descartadas.length === 2, "las dos se descartan con su motivo");
check(
  malas.descartadas[0].motivo.includes("fecha"),
  "una por la fecha que no se entiende",
  malas.descartadas[0].motivo,
);
check(
  malas.descartadas[1].motivo.includes("parte"),
  "y otra porque no tiene partes",
  malas.descartadas[1].motivo,
);

const sinISO = guiaDePrueba();
sinISO.semanas.forEach((s) => (s.inicioISO = ""));
const porEtiqueta = semanasDeLaGuia(sinISO);
check(
  porEtiqueta.semanas.length === 2 &&
    porEtiqueta.semanas[0].date.getMonth() === 2 &&
    porEtiqueta.semanas[0].date.getDate() === 4,
  "sin fecha propia, se lee de la etiqueta (“4-10 de Marzo”)",
  porEtiqueta.semanas[0]?.date.toDateString(),
);

// Un programa que cruza el fin de año: diciembre y enero.
const finDeAnio: GuiaLeida = {
  anio: 2030,
  meses: [12, 1],
  titulo: "Diciembre y Enero",
  avisos: [],
  semanas: [
    {
      inicioISO: "",
      etiqueta: "23-29 de Diciembre",
      encabezado: "",
      lectura: "",
      cancionInicio: "1",
      cancionIntermedia: "2",
      cancionFinal: "3",
      nota: "",
      partes: [parte(1, "Discurso (10 mins.)", "TESOROS")],
    },
    {
      inicioISO: "",
      etiqueta: "30 de Diciembre a 5 de Enero",
      encabezado: "",
      lectura: "",
      cancionInicio: "4",
      cancionIntermedia: "5",
      cancionFinal: "6",
      nota: "",
      partes: [parte(1, "Discurso (10 mins.)", "TESOROS")],
    },
    {
      inicioISO: "",
      etiqueta: "6-12 de Enero",
      encabezado: "",
      lectura: "",
      cancionInicio: "7",
      cancionIntermedia: "8",
      cancionFinal: "9",
      nota: "",
      partes: [parte(1, "Discurso (10 mins.)", "TESOROS")],
    },
  ],
};
const cruzado = semanasDeLaGuia(finDeAnio).semanas;
check(
  cruzado.length === 3 &&
    cruzado[0].date.getFullYear() === 2030 &&
    cruzado[2].date.getFullYear() === 2031,
  "al pasar de diciembre a enero, el año avanza",
  cruzado.map((w) => w.date.toDateString()).join(" · "),
);

// ---------------------------------------------------------------------------
console.log("\n--- 3. El PDF y el Excel dicen lo mismo ---");
const plantilla = await loadWorkbook(
  await readFile(path.join(process.cwd(), "src/assets/plantilla-vymc.xlsx")),
);
escribirGuiaEnPlantilla(plantilla, guia);
const porExcel = parseVymc(plantilla, guia.anio);

check(
  porExcel.length === semanas.length,
  "las dos vías leen el mismo número de semanas",
  `excel ${porExcel.length} / pdf ${semanas.length}`,
);
for (let i = 0; i < Math.min(porExcel.length, semanas.length); i++) {
  const a = porExcel[i];
  const b = semanas[i];
  check(
    a.date.getTime() === b.date.getTime(),
    `semana ${i + 1}: la misma fecha`,
    `${a.date.toISOString()} / ${b.date.toISOString()}`,
  );
  check(a.label === b.label, `semana ${i + 1}: la misma etiqueta`, `${a.label} / ${b.label}`);
  check(
    a.reading === b.reading &&
      a.songStart === b.songStart &&
      a.songMiddle === b.songMiddle &&
      a.songEnd === b.songEnd,
    `semana ${i + 1}: la misma lectura y las mismas canciones`,
    `${a.reading}|${a.songStart}/${a.songMiddle}/${a.songEnd} · ${b.reading}|${b.songStart}/${b.songMiddle}/${b.songEnd}`,
  );
  const titulos = (w: typeof a) =>
    [...w.tesoros, ...w.smm, ...w.vc].map((p) => p.label).join(" | ");
  check(
    titulos(a) === titulos(b),
    `semana ${i + 1}: los mismos títulos, en el mismo orden`,
    `${titulos(a)}\n        ${titulos(b)}`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- 4. Crear las reuniones de verdad ---");

const MARCA = "ZZ Prueba técnica";
async function borrarPruebas() {
  const viejas = await prisma.congregation.findMany({
    where: { name: { startsWith: MARCA } },
    select: { id: true, name: true },
  });
  for (const c of viejas) await prisma.congregation.delete({ where: { id: c.id } });
  return viejas.length;
}

const restos = await borrarPruebas();
if (restos) console.log(`  (se limpiaron ${restos} congregación(es) de pruebas anteriores)`);

const sello = Date.now();
const unaA = await prisma.congregation.create({
  data: { name: `${MARCA} A ${sello}`, slug: `zz-prueba-a-${sello}` },
  select: { id: true },
});
const unaB = await prisma.congregation.create({
  data: { name: `${MARCA} B ${sello}`, slug: `zz-prueba-b-${sello}` },
  select: { id: true },
});

try {
  const quien = { userId: null, userName: "Prueba", congregationId: unaA.id };
  const r1 = await crearReunionesDesdeSemanas(semanas, quien);
  check(r1.creadas === 2 && r1.omitidas === 0, "se crean las dos reuniones", JSON.stringify(r1));

  const reuniones = await prisma.meeting.findMany({
    where: { congregationId: unaA.id },
    orderBy: { date: "asc" },
    include: { assignments: { orderBy: { order: "asc" } } },
  });
  check(reuniones.length === 2, "y están en la base", `${reuniones.length}`);
  check(
    reuniones.every((m) => m.day === "JUEVES"),
    "como reuniones de entre semana",
  );
  check(
    reuniones[0].weeklyReading === "PROVERBIOS 1, 2" &&
      reuniones[0].songStart === "11" &&
      reuniones[0].songEnd === "33",
    "con su lectura y sus canciones",
  );
  check(
    reuniones[0].weekLabel === "4-10 de Marzo",
    "y el nombre de la semana",
    reuniones[0].weekLabel ?? "",
  );

  for (const slot of SLOTS_SIEMPRE) {
    check(
      reuniones.every((m) => m.assignments.some((a) => a.slotKey === slot)),
      `todas llevan la casilla "${slot}"`,
    );
  }
  const oracionInicio = reuniones[0].assignments.find(
    (a) => a.slotKey === "j_oracion_inicio",
  )!;
  const oracionFinal = reuniones[0].assignments.find(
    (a) => a.slotKey === "j_oracion_final",
  )!;
  check(
    !oracionInicio.primaryName && !oracionFinal.primaryName,
    "las oraciones nacen vacías: no se inventa a nadie",
  );
  check(
    oracionInicio.section === "ORACION_INICIO" &&
      oracionFinal.section === "ORACION_FINAL",
    "cada una en su sección, sin color propio",
  );
  check(
    oracionInicio.order < Math.min(
      ...reuniones[0].assignments
        .filter((a) => a.section === "TESOROS")
        .map((a) => a.order),
    ),
    "la de inicio, antes de Tesoros",
  );
  check(
    oracionFinal.order >
      Math.max(
        ...reuniones[0].assignments
          .filter((a) => a.section !== "ORACION_FINAL")
          .map((a) => a.order),
      ),
    "y la final, la última de todas",
  );
  check(
    reuniones[0].assignments.some((a) => a.label === "1. Tesoros de la Biblia (10 mins.)"),
    "los títulos del programa se guardan tal cual",
  );

  // --- Repetir no duplica ---
  const antes = await prisma.meetingAssignment.count({
    where: { meeting: { congregationId: unaA.id } },
  });
  const r2 = await crearReunionesDesdeSemanas(semanas, quien);
  const despues = await prisma.meetingAssignment.count({
    where: { meeting: { congregationId: unaA.id } },
  });
  check(r2.creadas === 0 && r2.omitidas === 2, "al repetir no se crea nada", JSON.stringify(r2));
  check(antes === despues, "ni una casilla de más", `${antes} → ${despues}`);

  // --- Una reunión vieja, sin oraciones, con un nombre ya puesto ---
  await prisma.meetingAssignment.deleteMany({
    where: { meetingId: reuniones[0].id, slotKey: { in: SLOTS_SIEMPRE } },
  });
  const lectura = reuniones[0].assignments.find((a) => a.slotKey === "j_lectura")!;
  await prisma.meetingAssignment.update({
    where: { id: lectura.id },
    data: { primaryName: "Hermano Que Ya Estaba" },
  });
  const r3 = await crearReunionesDesdeSemanas(semanas, quien);
  const arreglada = await prisma.meeting.findUnique({
    where: { id: reuniones[0].id },
    include: { assignments: true },
  });
  check(r3.conOraciones === 1, "a la reunión vieja se le reponen las oraciones", JSON.stringify(r3));
  check(
    SLOTS_SIEMPRE.every((k) => arreglada!.assignments.some((a) => a.slotKey === k)),
    "las dos están otra vez",
  );
  check(
    arreglada!.assignments.find((a) => a.slotKey === "j_lectura")?.primaryName ===
      "Hermano Que Ya Estaba",
    "y el nombre que ya había sigue intacto",
  );
  check(r3.creadas === 0, "sin crear reuniones de más");

  // --- Separación por congregación ---
  const deB = await prisma.meeting.count({ where: { congregationId: unaB.id } });
  check(deB === 0, "la otra congregación no recibe nada", `${deB}`);
  const rB = await crearReunionesDesdeSemanas(semanas.slice(0, 1), {
    userId: null,
    userName: "Prueba",
    congregationId: unaB.id,
  });
  check(rB.creadas === 1, "y cuando le toca, crea las suyas");
  check(
    (await prisma.meeting.count({ where: { congregationId: unaA.id } })) === 2,
    "sin tocar las de la primera",
  );
} finally {
  await prisma.congregation.delete({ where: { id: unaA.id } });
  await prisma.congregation.delete({ where: { id: unaB.id } });
  const quedan = await prisma.congregation.count({
    where: { name: { startsWith: MARCA } },
  });
  check(quedan === 0, "las congregaciones de prueba quedan borradas", `${quedan}`);
}

// ---------------------------------------------------------------------------
console.log("\n--- 5. El programa impreso sale completo ---");

const asign = (
  slotKey: string,
  section: string,
  label: string,
  order: number,
  primaryName: string | null = null,
) => ({ slotKey, section, label, order, primaryName, secondaryName: null });

const bytesPdf = buildProgramaPdf(
  [
    {
      date: new Date(2030, 2, 4, 12, 0, 0),
      weekLabel: "4-10 de Marzo",
      weeklyReading: "PROVERBIOS 1, 2",
      songStart: "11",
      songMiddle: "22",
      songEnd: "33",
      assignments: [
        asign("j_presidente", "PRESIDENCIA", "Presidente de la reunión", 0, "Hermano Presidente"),
        asign("j_tesoros_discurso", "TESOROS", "1. Tesoros de la Biblia (10 mins.)", 2, "Hermano Tesoros"),
        asign("j_lectura", "TESOROS", "3. Lectura de la Biblia (4 mins.)", 4, "Hermano Lector"),
        // Añadida a mano en la reunión: "Otro", sin sección del programa.
        asign("extra_1", "ASIGNACIONES", "Anuncios de la congregación", 20, "Hermano Anuncios"),
        // A propósito SIN casilla de oración: la reunión es de las viejas.
      ],
    },
  ],
  "MARZO 2030",
  "Congregación de Prueba",
);

// pdfjs se queda con el buffer (lo transfiere), así que el tamaño se mide
// antes de leerlo.
const tamanoPdf = bytesPdf.byteLength;
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const doc = await pdfjs.getDocument({
  data: new Uint8Array(bytesPdf),
  useSystemFonts: false,
  disableFontFace: true,
}).promise;
let texto = "";
for (let n = 1; n <= doc.numPages; n++) {
  const page = await doc.getPage(n);
  texto += (await page.getTextContent()).items
    .map((i) => (i as { str?: string }).str ?? "")
    .join(" ");
}

check(texto.includes("Canción 11 y oración"), "la canción de inicio con su oración");
check(
  texto.includes("Canción 33 y oración"),
  "la canción FINAL con su oración, aunque nadie esté asignado",
  texto.slice(0, 300),
);
check(texto.includes("Canción 22"), "la canción de Nuestra Vida Cristiana");
check(
  texto.includes("Anuncios de la congregación"),
  "las asignaciones añadidas a mano también se imprimen",
);
check(texto.includes("Hermano Anuncios"), "con su hermano");
check(
  texto.indexOf("Anuncios de la congregación") < texto.indexOf("Canción 33 y oración"),
  "y van antes de la oración final, como en la reunión",
);
check(texto.includes("Lectura semanal de la Biblia: PROVERBIOS 1, 2"), "y la lectura semanal");

// Que jsPDF esté cargado de verdad (si no, el PDF estaría vacío y todo lo
// anterior sería un falso positivo).
check(typeof jsPDF === "function" && tamanoPdf > 2000, "el PDF tiene contenido", `${tamanoPdf} bytes`);

// ---------------------------------------------------------------------------
await prisma.$disconnect();
console.log(`\n=== ${ok} comprobaciones bien · ${bad} mal ===`);
process.exit(bad === 0 ? 0 : 1);
