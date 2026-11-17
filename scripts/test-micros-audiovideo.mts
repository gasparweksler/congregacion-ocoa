// ============================================================================
//  Prueba de los dos ajustes de las responsabilidades mensuales:
//
//    · "Usamos 1 / 2 Pasa Micrófono"
//    · "El mismo hermano hace Audio y Video"
//
//  Sin base de datos: se comprueban las reglas (src/lib/resp-settings.ts), el
//  reparto automático con las casillas que cada ajuste deja activas, y el PDF
//  de ida y vuelta (se genera y se vuelve a leer con el lector de la propia
//  aplicación) para que no se imprima una columna que no se usa ni se lea mal
//  la que queda.
//    npm run test:micros
// ============================================================================
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  respSettingsFrom,
  activeResponsibilities,
  responsibilitiesToShow,
  respActiva,
  respLabel,
  RESP_SETTINGS_DEFAULT,
  type RespSettings,
} from "../src/lib/resp-settings.js";
import {
  MONTHLY_RESPONSIBILITIES,
  categoryOfSlot,
} from "../src/lib/constants.js";
import {
  autoAssign,
  type Candidate,
  type MeetingContext,
  type Position,
} from "../src/lib/resp-auto-assign.js";
import {
  dibujarResponsabilidades,
  type FilaResponsabilidad,
} from "../src/lib/responsabilidades-pdf.js";
import { parseResponsibilitiesPdf, type PdfItem } from "../src/lib/resp-pdf-parser.js";

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

const DOS: RespSettings = { micCount: 2, audioAlsoVideo: false };
const UNO: RespSettings = { micCount: 1, audioAlsoVideo: false };
const JUNTO: RespSettings = { micCount: 2, audioAlsoVideo: true };
const UNO_JUNTO: RespSettings = { micCount: 1, audioAlsoVideo: true };

const claves = (s: RespSettings) => activeResponsibilities(s).map((r) => r.key);

// ---------------------------------------------------------------------------
console.log("\n--- 1. Lo de siempre sigue igual ---");
check(
  RESP_SETTINGS_DEFAULT.micCount === 2 && !RESP_SETTINGS_DEFAULT.audioAlsoVideo,
  "por defecto: dos micrófonos y Video aparte",
);
check(
  claves(DOS).length === MONTHLY_RESPONSIBILITIES.length,
  `con los ajustes de siempre se reparten las ${MONTHLY_RESPONSIBILITIES.length} casillas`,
  `${claves(DOS).length}`,
);
check(
  claves(DOS).join(",") === MONTHLY_RESPONSIBILITIES.map((r) => r.key).join(","),
  "y en el mismo orden de siempre",
);

// ---------------------------------------------------------------------------
console.log("\n--- 2. Qué llega de la base ---");
check(respSettingsFrom(null).micCount === 2, "sin congregación: dos micrófonos");
check(respSettingsFrom({}).micCount === 2, "columna ausente: dos micrófonos");
check(respSettingsFrom({ micCount: 1 }).micCount === 1, "micCount 1 se respeta");
check(respSettingsFrom({ micCount: 7 }).micCount === 2, "un valor raro cae a 2");
check(
  respSettingsFrom({ audioAlsoVideo: null }).audioAlsoVideo === false,
  "audioAlsoVideo nulo es no",
);
check(
  respSettingsFrom({ audioAlsoVideo: true }).audioAlsoVideo === true,
  "audioAlsoVideo verdadero se respeta",
);

// ---------------------------------------------------------------------------
console.log("\n--- 3. Un solo Pasa Micrófono ---");
check(!claves(UNO).includes("r_microfono_2"), "no se reparte «Pasa Micrófono 2»");
check(claves(UNO).includes("r_microfono"), "sí se reparte el primero");
check(
  activeResponsibilities(UNO).find((r) => r.key === "r_microfono")!.label ===
    "Pasa Micrófono",
  "y se llama «Pasa Micrófono», sin el 1 que ya no distingue nada",
  activeResponsibilities(UNO).find((r) => r.key === "r_microfono")!.label,
);
check(
  activeResponsibilities(DOS).find((r) => r.key === "r_microfono")!.label ===
    "Pasa Micrófono 1",
  "con dos vuelve a llamarse «Pasa Micrófono 1»",
);
check(claves(UNO).length === claves(DOS).length - 1, "una casilla menos, ni más ni menos");
check(
  claves(UNO).includes("r_video") && claves(UNO).includes("r_audio"),
  "Audio y Video no se tocan",
);
check(!respActiva("r_microfono_2", UNO), "respActiva dice que no");
check(respActiva("r_microfono_2", DOS), "y que sí con dos");

// ---------------------------------------------------------------------------
console.log("\n--- 4. El mismo hermano hace Audio y Video ---");
check(!claves(JUNTO).includes("r_video"), "no se reparte una casilla de Video");
check(claves(JUNTO).includes("r_audio"), "Audio sigue repartiéndose");
const audio = activeResponsibilities(JUNTO).find((r) => r.key === "r_audio")!;
check(audio.label === "Audio y Video", "y pasa a llamarse «Audio y Video»", audio.label);
check(
  activeResponsibilities(DOS).find((r) => r.key === "r_audio")!.label === "Audio",
  "con el interruptor quitado vuelve a llamarse «Audio»",
);
check(
  respLabel({ key: "r_acom_entrada", label: "Acomodador de Entrada", kind: "publisher" }, JUNTO) ===
    "Acomodador de Entrada",
  "las demás etiquetas no cambian",
);
check(claves(UNO_JUNTO).length === MONTHLY_RESPONSIBILITIES.length - 2, "los dos ajustes a la vez quitan dos casillas");

// ---------------------------------------------------------------------------
console.log("\n--- 5. Nada guardado se esconde ---");
const conNombre = (keys: string[]) => (k: string) => keys.includes(k);
const vacio = responsibilitiesToShow(UNO_JUNTO, () => false);
check(
  vacio.length === MONTHLY_RESPONSIBILITIES.length - 2,
  "las casillas apagadas y vacías no estorban en la pantalla",
  `${vacio.length}`,
);
const conViejos = responsibilitiesToShow(UNO_JUNTO, conNombre(["r_video", "r_microfono_2"]));
check(
  conViejos.length === MONTHLY_RESPONSIBILITIES.length,
  "lo que ya tenía nombre sigue a la vista",
  `${conViejos.length}`,
);
const video = conViejos.find((r) => r.key === "r_video")!;
check(!!video.inactiva, "marcado como que ya no se reparte");
check(
  video.inactiva === "Lo hace el hermano de Audio.",
  "con el motivo escrito en claro",
  video.inactiva,
);
check(
  conViejos.find((r) => r.key === "r_microfono_2")!.inactiva ===
    "La congregación usa un solo Pasa Micrófono.",
  "y el del micrófono también",
);
check(
  conViejos.filter((r) => !r.inactiva).length === MONTHLY_RESPONSIBILITIES.length - 2,
  "pero no cuentan como casillas que haya que rellenar",
);

// ---------------------------------------------------------------------------
console.log("\n--- 6. El reparto automático respeta los ajustes ---");

/** Las posiciones de un mes, igual que las arma proposeAutoAssignAction. */
function posiciones(s: RespSettings, fechas: [string, "JUEVES" | "SABADO"][]): Position[] {
  const out: Position[] = [];
  for (const [dateISO, day] of fechas) {
    for (const slot of activeResponsibilities(s).filter((r) => r.kind === "publisher")) {
      const cat = categoryOfSlot(slot.key);
      if (!cat) continue;
      out.push({ dateISO, day, slotKey: slot.key, slotLabel: slot.label, category: cat.key });
    }
  }
  return out;
}

const fechas: [string, "JUEVES" | "SABADO"][] = [
  ["2026-03-05", "JUEVES"],
  ["2026-03-07", "SABADO"],
  ["2026-03-12", "JUEVES"],
  ["2026-03-14", "SABADO"],
];
const contextos: MeetingContext[] = fechas.map(([dateISO]) => ({
  dateISO,
  label: dateISO,
  partNames: [],
  respNames: [],
  partLabelByName: {},
}));
// Gente de sobra en todas las categorías, para que lo único que decida sea el
// ajuste y no la falta de hermanos.
const candidatos: Candidate[] = [];
for (let i = 1; i <= 24; i++) {
  candidatos.push({
    publisherId: `p${i}`,
    name: `Hermano ${i}`,
    categories: ["ACOMODADORES", "MICROFONO", "PLATAFORMA", "AUDIO", "VIDEO"],
    loadBefore: 0,
  });
}

const rDos = autoAssign(posiciones(DOS, fechas), contextos, candidatos);
check(
  rDos.proposals.filter((p) => p.slotKey === "r_microfono_2").length === fechas.length,
  "con dos micrófonos propone dos hermanos por reunión",
  `${rDos.proposals.filter((p) => p.slotKey === "r_microfono_2").length}`,
);
check(rDos.uncovered.length === 0, "y no deja huecos", JSON.stringify(rDos.uncovered));

const rUno = autoAssign(posiciones(UNO, fechas), contextos, candidatos);
check(
  rUno.proposals.filter((p) => p.slotKey === "r_microfono_2").length === 0,
  "con uno solo no propone nadie para el segundo",
);
check(
  rUno.proposals.filter((p) => p.slotKey === "r_microfono").length === fechas.length,
  "pero sí uno por reunión para el primero",
);
check(
  rUno.uncovered.every((u) => u.slotKey !== "r_microfono_2"),
  "y el segundo NO aparece como puesto sin cubrir",
);
check(
  rUno.proposals.length === rDos.proposals.length - fechas.length,
  "en total, una asignación menos por reunión",
);

const rJunto = autoAssign(posiciones(JUNTO, fechas), contextos, candidatos);
check(
  rJunto.proposals.filter((p) => p.slotKey === "r_video").length === 0,
  "con Audio y Video juntos no se propone Video aparte",
);
check(
  rJunto.proposals.filter((p) => p.slotKey === "r_audio").length === fechas.length,
  "y Audio se cubre en todas las reuniones",
);
check(
  rJunto.proposals.every((p) => p.slotKey !== "r_audio" || p.slotLabel === "Audio y Video"),
  "el aviso al hermano dirá «Audio y Video»",
);
check(
  rJunto.uncovered.every((u) => u.slotKey !== "r_video"),
  "Video no queda como puesto sin cubrir",
);

// Nadie hace dos cosas en la misma reunión: la regla de siempre sigue en pie
// con cualquiera de los ajustes.
for (const [nombre, r] of [
  ["dos micrófonos", rDos],
  ["un micrófono", rUno],
  ["audio y video juntos", rJunto],
] as const) {
  let repetido = false;
  for (const [dateISO] of fechas) {
    const nombres = r.proposals.filter((p) => p.dateISO === dateISO).map((p) => p.name);
    if (new Set(nombres).size !== nombres.length) repetido = true;
  }
  check(!repetido, `${nombre}: nadie recibe dos cosas en la misma reunión`);
}

// Reparto equilibrado: con gente de sobra, nadie se lleva el doble que otro.
const cargas = new Map<string, number>();
for (const p of rUno.proposals) cargas.set(p.name, (cargas.get(p.name) ?? 0) + 1);
const maxima = Math.max(...cargas.values());
const minima = Math.min(...cargas.values());
check(maxima - minima <= 1, "con un micrófono el reparto sigue equilibrado", `${minima}..${maxima}`);

// ---------------------------------------------------------------------------
console.log("\n--- 7. El PDF imprime solo lo que se usa ---");

const FECHAS_PDF = ["2026-03-05", "2026-03-07", "2026-03-12", "2026-03-14"];

// Ojo con los nombres de prueba: el lector busca los títulos de columna por
// palabra, así que un nombre como "Plataforma 1" se leería como un encabezado.
// Aquí van nombres de hermano, como en la realidad.
const filasPdf = (micros: number, conVideo: boolean): FilaResponsabilidad[] =>
  FECHAS_PDF.map((dateISO, i) => ({
    dateISO,
    audio: `Hermano Sonido${i + 1}`,
    video: conVideo ? `Hermano Pantalla${i + 1}` : "",
    microfono:
      micros >= 2
        ? `Hermano Inalambrico${i + 1} / Hermano Cable${i + 1}`
        : `Hermano Inalambrico${i + 1}`,
    plataforma: `Hermano Tarima${i + 1}`,
    entrada: `Hermano Puerta${i + 1}`,
    auditorio: `Hermano Butaca${i + 1}`,
    limpieza: "Grupo 1",
  }));

async function textoDelPdf(
  filas: FilaResponsabilidad[],
  columnaVideo: boolean,
): Promise<{ texto: string; items: PdfItem[] }> {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  dibujarResponsabilidades(doc, autoTable, {
    periodo: "MARZO 2026",
    congregacion: "Congregación de Prueba",
    filas,
    columnaVideo,
  });
  const bytes = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({
    data: bytes,
    useSystemFonts: false,
    disableFontFace: true,
  }).promise;
  const items: PdfItem[] = [];
  const trozos: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    for (const item of (await page.getTextContent()).items) {
      const raw = item as { str?: string; transform?: number[]; width?: number };
      if (!raw.str?.trim() || !raw.transform) continue;
      trozos.push(raw.str);
      items.push({
        text: raw.str,
        x: raw.transform[4],
        y: raw.transform[5],
        width: raw.width ?? 0,
        page: n,
      });
    }
  }
  return { texto: trozos.join(" | "), items };
}

const normal = await textoDelPdf(filasPdf(2, true), true);
check(/\| VIDEO \|/.test(normal.texto), "el PDF de siempre sigue trayendo su columna VIDEO");
check(normal.texto.includes("Hermano Pantalla1"), "con los nombres de Video dentro");
check(
  normal.texto.includes("Hermano Inalambrico1 / Hermano Cable1"),
  "y los dos micrófonos juntos",
);

const junto = await textoDelPdf(filasPdf(2, false), false);
check(junto.texto.includes("AUDIO Y VIDEO"), "con el ajuste puesto, la columna se llama AUDIO Y VIDEO");
check(!/\| VIDEO \|/.test(junto.texto), "y no hay una columna VIDEO aparte");
check(!junto.texto.includes("Hermano Pantalla1"), "ningún nombre de Video impreso");
check(
  junto.texto.includes("Hermano Sonido1"),
  "el de Audio sí, que es quien hace las dos cosas",
);

const unoSolo = await textoDelPdf(filasPdf(1, true), true);
check(
  unoSolo.texto.includes("Hermano Inalambrico1"),
  "con un micrófono se imprime el primero",
);
check(!unoSolo.texto.includes("Hermano Cable1"), "y no el segundo");
check(unoSolo.texto.includes("MICROFONO"), "la columna sigue llamándose MICROFONO");

// ---------------------------------------------------------------------------
console.log("\n--- 8. Ese PDF se vuelve a leer bien ---");
const fechasValidas = [
  { dateISO: "2026-03-05", day: "JUEVES" as const },
  { dateISO: "2026-03-07", day: "SABADO" as const },
  { dateISO: "2026-03-12", day: "JUEVES" as const },
  { dateISO: "2026-03-14", day: "SABADO" as const },
];

const leidoNormal = parseResponsibilitiesPdf(normal.items, fechasValidas);
check(leidoNormal.rows.length === 4, "el PDF de siempre se lee entero", `${leidoNormal.rows.length}`);
check(
  (leidoNormal.rows[0]?.values.r_audio ?? "") === "Hermano Sonido1" &&
    (leidoNormal.rows[0]?.values.r_video ?? "") === "Hermano Pantalla1",
  "con Audio y Video en su sitio",
  JSON.stringify(leidoNormal.rows[0]?.values),
);

const leidoJunto = parseResponsibilitiesPdf(junto.items, fechasValidas);
check(leidoJunto.rows.length === 4, "el PDF con la columna junta también", `${leidoJunto.rows.length}`);
check(
  (leidoJunto.rows[0]?.values.r_audio ?? "") === "Hermano Sonido1",
  "el nombre entra como Audio",
  JSON.stringify(leidoJunto.rows[0]?.values),
);
check(
  !(leidoJunto.rows[0]?.values.r_video ?? "").trim(),
  "y NO se inventa una asignación de Video con el mismo nombre",
  leidoJunto.rows[0]?.values.r_video,
);
check(
  (leidoJunto.rows[2]?.values.r_acom_entrada ?? "") === "Hermano Puerta3",
  "las demás columnas no se corren de sitio",
  JSON.stringify(leidoJunto.rows[2]?.values),
);

const leidoUno = parseResponsibilitiesPdf(unoSolo.items, fechasValidas);
check(
  (leidoUno.rows[0]?.values.r_microfono ?? "") === "Hermano Inalambrico1",
  "con un micrófono se lee el primero",
  JSON.stringify(leidoUno.rows[0]?.values),
);
check(
  !(leidoUno.rows[0]?.values.r_microfono_2 ?? "").trim(),
  "y el segundo queda vacío, no repetido",
);

// ---------------------------------------------------------------------------
console.log(`\n=== ${ok} comprobaciones bien · ${bad} mal ===`);
process.exit(bad === 0 ? 0 : 1);
