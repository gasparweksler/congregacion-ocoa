// ============================================================================
//  Recorrido completo: planilla Excel -> lectura -> PDF del programa.
//
//  Se arma una planilla con la MISMA estructura que la del proyecto, con las
//  canciones y la lectura semanal escritas a mano (como las escribiría quien
//  prepara el programa), y se comprueba que lleguen hasta el PDF.
//
//  También se comprueba lo contrario: si la planilla no trae el número de una
//  canción, no aparece ninguno inventado.
//
//  No toca la base de datos.
//    npx tsx scripts/test-programa-canciones.mts
// ============================================================================
import ExcelJS from "exceljs";
import {
  parseVymc,
  buildSlotData,
  programFieldsToFill,
} from "../src/lib/vymc-parser.js";
import { buildProgramaPdf } from "../src/lib/programa-pdf.js";
import { extractPdfItems } from "../src/lib/pdf-text.js";
import { slotsForDay, MEETING_DAYS } from "../src/lib/constants.js";

let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/**
 * Semana con la estructura de la planilla real: la lectura semanal a la
 * derecha del encabezado y las canciones en las líneas con viñeta.
 */
function semana(
  ws: ExcelJS.Worksheet,
  fila: number,
  datos: {
    encabezado: string;
    lectura?: string;
    cancionInicio?: string;
    cancionMedio?: string;
    cancionFinal?: string;
  },
  /**
   * "nuevo": la planilla actual, con la canción y la oración separadas
   *   ("● Canción: 33" | "Oración:" … "● Canción 38" | "Oración final:").
   * "antiguo": la anterior, con las dos juntas ("● Canción 33 y oración:").
   * Se prueban las dos porque se puede subir un archivo de antes.
   */
  formato: "nuevo" | "antiguo" = "nuevo",
): number {
  let r = fila;
  ws.getCell(`A${r}`).value = datos.encabezado;
  if (datos.lectura) {
    ws.getRow(r).getCell(7).value = "Lectura semanal de la Biblia:";
    ws.getRow(r).getCell(8).value = datos.lectura;
  }
  r++;

  // Canción + oración de inicio | Palabras de introducción (presidente)
  if (formato === "nuevo") {
    ws.getCell(`A${r}`).value = `● Canción: ${datos.cancionInicio ?? "xx"}`;
    ws.getRow(r).getCell(2).value = "Oración:";
  } else {
    ws.getCell(`A${r}`).value = datos.cancionInicio
      ? `● Canción ${datos.cancionInicio} y oración:`
      : "● Canción y oración:";
  }
  ws.getRow(r).getCell(3).value = "Hermano Oracion";
  ws.getRow(r).getCell(9).value = "Hermano Presidente";
  r++;

  ws.getCell(`A${r}`).value = "TESOROS DE LA BIBLIA";
  r++;
  ws.getCell(`A${r}`).value = "1. Discurso de prueba (10 mins.)";
  ws.getRow(r).getCell(9).value = "Hermano Tesoros";
  r++;

  ws.getCell(`A${r}`).value = "SEAMOS MEJORES MAESTROS";
  r++;
  ws.getCell(`A${r}`).value = "4. Empiece conversaciones (3 mins.)";
  ws.getRow(r).getCell(9).value = "Hermano Maestro";
  r++;

  ws.getCell(`A${r}`).value = "NUESTRA VIDA CRISTIANA";
  r++;
  if (datos.cancionMedio) {
    ws.getCell(`A${r}`).value = `● Canción ${datos.cancionMedio}`;
    r++;
  }
  ws.getCell(`A${r}`).value = "8. Estudio bíblico de la congregación (30 mins.)";
  ws.getRow(r).getCell(5).value = "Hermano Conductor";
  ws.getRow(r).getCell(9).value = "Hermano Lector";
  r++;

  // Conclusión | canción y oración final
  ws.getCell(`A${r}`).value = "● Palabras de conclusión (3 min)";
  if (formato === "nuevo") {
    ws.getRow(r).getCell(6).value = `● Canción ${datos.cancionFinal ?? "xx"}`;
    ws.getRow(r).getCell(7).value = "Oración final:";
  } else {
    ws.getRow(r).getCell(7).value = datos.cancionFinal
      ? `● Canción ${datos.cancionFinal} y oración`
      : "● Canción y oración";
  }
  ws.getRow(r).getCell(9).value = "Hermano Final";
  r += 2;
  return r;
}

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Programa 2026");
let r = 1;
r = semana(ws, r, {
  encabezado: "SEMANA 5-11 DE OCTUBRE",
  lectura: "JEREMÍAS 40, 41",
  cancionInicio: "33",
  cancionMedio: "49",
  cancionFinal: "38",
});
// Segunda semana: la planilla se dejó sin canciones ni lectura.
r = semana(ws, r, { encabezado: "SEMANA 12-18 DE OCTUBRE" });

console.log("1. Lo que se lee de la planilla");
const weeks = parseVymc(wb, 2026);
check(weeks.length === 2, `detecta 2 semanas (${weeks.length})`);

const w1 = weeks[0];
check(w1.reading === "JEREMÍAS 40, 41", `lectura semanal: «${w1.reading}»`);
check(w1.songStart === "33", `canción de inicio: «${w1.songStart}»`);
check(w1.songMiddle === "49", `canción de Nuestra Vida Cristiana: «${w1.songMiddle}»`);
check(w1.songEnd === "38", `canción final: «${w1.songEnd}»`);

const w2 = weeks[1];
console.log("\n2. La semana sin esos datos queda vacía, no inventada");
check(w2.reading === "", "sin lectura semanal");
check(w2.songStart === "", "sin canción de inicio");
check(w2.songMiddle === "", "sin canción de Nuestra Vida Cristiana");
check(w2.songEnd === "", "sin canción final");

console.log("\n3. Los nombres se siguen leyendo igual que antes");
const slots = slotsForDay(MEETING_DAYS.JUEVES);
const data1 = buildSlotData(w1);
check(data1["j_presidente"]?.p === "Hermano Presidente", "presidente");
check(data1["j_oracion_inicio"]?.p === "Hermano Oracion", "oración de inicio");
check(data1["j_oracion_final"]?.p === "Hermano Final", "oración final");
check(data1["j_vc_conductor"]?.p === "Hermano Conductor", "conductor del estudio");
check(data1["j_vc_lector"]?.p === "Hermano Lector", "lector del estudio");

console.log("\n4. Lo leído llega al PDF");
const meetings = weeks.map((w) => {
  const data = buildSlotData(w);
  return {
    date: w.date,
    weekLabel: w.label,
    weeklyReading: w.reading || null,
    songStart: w.songStart || null,
    songMiddle: w.songMiddle || null,
    songEnd: w.songEnd || null,
    assignments: slots
      .map((s, i) => {
        const d = data[s.key] ?? {};
        if (!d.label && !d.p && !d.s) return null;
        return {
          slotKey: s.key,
          section: s.section,
          label: d.label ?? s.label,
          order: i,
          primaryName: d.p ?? null,
          secondaryName: d.s ?? null,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null),
  };
});

const buf = buildProgramaPdf(meetings, "OCTUBRE 2026");
const copia = new Uint8Array(buf.byteLength);
copia.set(new Uint8Array(buf));
const items = await extractPdfItems(new Uint8Array(copia));
const texto = norm(items.map((i) => i.text).join(" "));

check(
  texto.includes(norm("Lectura semanal de la Biblia: JEREMÍAS 40, 41")),
  "la lectura semanal sale en la cabecera de la semana",
);
check(texto.includes(norm("Canción 33 y oración")), "la canción de inicio sale junto a la oración");
check(texto.includes(norm("Canción 49")), "la canción de Nuestra Vida Cristiana sale en su sección");
check(texto.includes(norm("Canción 38 y oración")), "la canción final sale junto a la oración");
check(texto.includes(norm("Hermano Presidente")), "los nombres siguen saliendo");

console.log("\n5. La semana sin datos no arrastra los de la otra");
// En la segunda semana se conservan los títulos guardados en vez de inventar
// una canción: deben aparecer tal cual.
check(
  texto.includes(norm("Oración de Inicio")) && texto.includes(norm("Oración Final")),
  "mantiene los títulos guardados cuando no hay número de canción",
);
const numeros = [...texto.matchAll(/cancion (\d+)/g)].map((m) => m[1]).sort();
check(
  numeros.join(",") === "33,38,49",
  `en todo el PDF hay exactamente 3 canciones: ${numeros.join(", ") || "ninguna"}`,
);

console.log("\n6. Volver a subir la planilla completa una reunión ya cargada");
{
  // Reunión existente sin estos datos (el caso de todo lo ya importado).
  const vacia = {
    weeklyReading: null,
    songStart: null,
    songMiddle: null,
    songEnd: null,
  };
  const aRellenar = programFieldsToFill(vacia, w1);
  check(
    aRellenar.weeklyReading === "JEREMÍAS 40, 41" &&
      aRellenar.songStart === "33" &&
      aRellenar.songMiddle === "49" &&
      aRellenar.songEnd === "38",
    "rellena los cuatro datos que faltaban",
  );

  // Reunión que ya los tiene: no se pisa ninguno.
  const llena = {
    weeklyReading: "JEREMÍAS 1, 2",
    songStart: "10",
    songMiddle: "20",
    songEnd: "30",
  };
  check(
    Object.keys(programFieldsToFill(llena, w1)).length === 0,
    "no pisa los datos que la reunión ya tenía",
  );

  // Mezcla: solo toca lo vacío.
  const mitad = { ...vacia, songStart: "10" };
  const parcial = programFieldsToFill(mitad, w1);
  check(
    parcial.songStart === undefined && parcial.songEnd === "38",
    "solo toca los campos vacíos, deja los demás como estaban",
  );

  // La planilla sin esos datos no borra nada.
  check(
    Object.keys(programFieldsToFill(llena, w2)).length === 0,
    "una planilla sin canciones no borra las que ya había",
  );
}

console.log("\n7. Un archivo con el formato ANTERIOR se sigue leyendo");
{
  const viejo = new ExcelJS.Workbook();
  const hv = viejo.addWorksheet("Programa 2026");
  semana(
    hv,
    1,
    {
      encabezado: "SEMANA 5-11 DE OCTUBRE",
      lectura: "JEREMÍAS 40, 41",
      cancionInicio: "33",
      cancionMedio: "49",
      cancionFinal: "38",
    },
    "antiguo",
  );
  const [w] = parseVymc(viejo, 2026);
  check(w.reading === "JEREMÍAS 40, 41", `lectura: «${w.reading}»`);
  check(w.songStart === "33", `canción de inicio: «${w.songStart}»`);
  check(w.songMiddle === "49", `canción de Nuestra Vida Cristiana: «${w.songMiddle}»`);
  check(w.songEnd === "38", `canción final: «${w.songEnd}»`);
  check(w.pres === "Hermano Presidente", "y los nombres siguen igual");
}

console.log("\n8. La planilla del proyecto, tal cual se descarga");
{
  const plantilla = new ExcelJS.Workbook();
  await plantilla.xlsx.readFile("src/assets/plantilla-vymc.xlsx");
  const semanas = parseVymc(plantilla, 2026);
  check(semanas.length > 0, `se reconocen ${semanas.length} semanas`);
  // Viene en blanco: la canción de inicio y la final llevan "xx" a sustituir,
  // así que no debe leerse ningún número inventado.
  check(
    semanas.every((s) => s.songStart === "" && s.songEnd === ""),
    "no inventa la canción de inicio ni la final (en la plantilla son «xx»)",
  );
  check(
    semanas.every((s) => s.reading !== ""),
    "sí trae la lectura semanal de cada semana",
  );
  const medias = semanas.map((s) => s.songMiddle).filter(Boolean);
  check(
    medias.length === semanas.length,
    `y la canción de Nuestra Vida Cristiana ya numerada: ${medias.join(", ")}`,
  );
  const nombres = semanas.flatMap((s) =>
    [s.pres, s.orac, s.clos, ...[...s.tesoros, ...s.smm, ...s.vc].flatMap((x) => [x.name, x.name2])].filter(Boolean),
  );
  check(nombres.length === 0, `sigue sin nombres (${nombres.length})`);
}

console.log("\n9. Lo que se escribe a mano en el editor de la reunión");
{
  const { parseSongNumber, parseWeeklyReading } = await import(
    "../src/lib/meeting-program.js"
  );
  // Números válidos.
  check(parseSongNumber("33") === "33", "«33» vale");
  check(parseSongNumber("  7 ") === "7", "«  7 » se recorta a «7»");
  check(parseSongNumber("033") === "33", "«033» se normaliza a «33»");
  check(parseSongNumber("151") === "151", "«151» vale");
  // Vacío = borrar el dato, no es un error.
  check(parseSongNumber("") === null, "vacío borra el dato (null, no error)");
  check(parseSongNumber("   ") === null, "solo espacios también borra");
  // Lo que no es un número de canción se rechaza.
  for (const malo of ["Canción 33", "33a", "-5", "3.5", "0", "1000", "abc", "3,5"]) {
    check(parseSongNumber(malo) === undefined, `«${malo}» se rechaza`);
  }

  // Lectura semanal.
  check(
    parseWeeklyReading("  JEREMÍAS   40, 41 ") === "JEREMÍAS 40, 41",
    "la lectura se limpia de espacios de más",
  );
  check(parseWeeklyReading("") === null, "lectura vacía borra el dato");
  check(
    parseWeeklyReading("x".repeat(200))?.length === 120,
    "una lectura larguísima se recorta a 120 caracteres",
  );
}

// Para revisarlo a ojo: SALIDA=ruta.pdf npx tsx scripts/test-programa-canciones.mts
const salida = process.env.SALIDA;
if (salida) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(salida, Buffer.from(copia));
  console.log(`\nPDF guardado en ${salida}`);
}

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
