// ============================================================================
//  Prueba del ajuste "Un solo hermano como acomodador de entrada y de
//  auditorio".
//
//  Sin base de datos: se comprueban las reglas (src/lib/resp-settings.ts), el
//  reparto automático y el PDF de ida y vuelta (se genera y se vuelve a leer
//  con el lector de la propia aplicación), para que no se imprima una columna
//  que ya no se usa ni se lea mal la que queda.
//    npm run test:acomodadores
// ============================================================================
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  respSettingsFrom,
  activeResponsibilities,
  responsibilitiesToShow,
  respActiva,
  respLabel,
  respMotivo,
  RESP_SETTINGS_DEFAULT,
  LABEL_ACOM_AMBOS,
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
import {
  parseResponsibilitiesPdf,
  type PdfItem,
} from "../src/lib/resp-pdf-parser.js";

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

const DOS: RespSettings = { micCount: 2, audioAlsoVideo: false, ushersMerged: false };
const UNICO: RespSettings = { micCount: 2, audioAlsoVideo: false, ushersMerged: true };
const TODO_JUNTO: RespSettings = { micCount: 1, audioAlsoVideo: true, ushersMerged: true };

const claves = (s: RespSettings) => activeResponsibilities(s).map((r) => r.key);
const etiqueta = (s: RespSettings, key: string) =>
  activeResponsibilities(s).find((r) => r.key === key)?.label ?? "";

// ---------------------------------------------------------------------------
console.log("\n--- 1. Lo de siempre sigue igual ---");
check(
  RESP_SETTINGS_DEFAULT.ushersMerged === false,
  "por defecto: dos acomodadores, como hasta ahora",
);
check(
  claves(DOS).includes("r_acom_entrada") && claves(DOS).includes("r_acom_auditorio"),
  "con el interruptor quitado se reparten las dos casillas",
);
check(
  etiqueta(DOS, "r_acom_entrada") === "Acomodador de Entrada" &&
    etiqueta(DOS, "r_acom_auditorio") === "Acomodador de Auditorio",
  "cada una con su nombre de siempre",
);

// ---------------------------------------------------------------------------
console.log("\n--- 2. Qué llega de la base ---");
check(respSettingsFrom(null).ushersMerged === false, "sin congregación: dos acomodadores");
check(respSettingsFrom({}).ushersMerged === false, "columna ausente: dos acomodadores");
check(
  respSettingsFrom({ ushersMerged: null }).ushersMerged === false,
  "valor nulo: dos acomodadores",
);
check(
  respSettingsFrom({ ushersMerged: true }).ushersMerged === true,
  "el interruptor puesto se respeta",
);
check(
  respSettingsFrom({ ushersMerged: true }).micCount === 2 &&
    respSettingsFrom({ ushersMerged: true }).audioAlsoVideo === false,
  "y no arrastra los otros ajustes",
);

// ---------------------------------------------------------------------------
console.log("\n--- 3. Con el interruptor puesto ---");
check(
  !claves(UNICO).includes("r_acom_auditorio"),
  "no se reparte una casilla de Auditorio aparte",
);
check(claves(UNICO).includes("r_acom_entrada"), "la de Entrada sigue repartiéndose");
check(
  etiqueta(UNICO, "r_acom_entrada") === LABEL_ACOM_AMBOS,
  `y pasa a llamarse «${LABEL_ACOM_AMBOS}»`,
  etiqueta(UNICO, "r_acom_entrada"),
);
check(
  claves(UNICO).length === MONTHLY_RESPONSIBILITIES.length - 1,
  "una casilla menos, ni más ni menos",
  `${claves(UNICO).length}`,
);
check(!respActiva("r_acom_auditorio", UNICO), "respActiva dice que no");
check(respActiva("r_acom_auditorio", DOS), "y que sí con el interruptor quitado");
check(
  respMotivo("r_acom_auditorio", UNICO) ===
    "Lo hace el mismo hermano que está en la entrada.",
  "con el motivo escrito en claro",
  String(respMotivo("r_acom_auditorio", UNICO)),
);
check(
  respLabel({ key: "r_audio", label: "Audio", kind: "publisher" }, UNICO) === "Audio",
  "las demás etiquetas no cambian",
);
check(
  claves(TODO_JUNTO).length === MONTHLY_RESPONSIBILITIES.length - 3,
  "los tres ajustes a la vez quitan tres casillas",
  `${claves(TODO_JUNTO).length}`,
);
check(
  etiqueta(TODO_JUNTO, "r_acom_entrada") === LABEL_ACOM_AMBOS &&
    etiqueta(TODO_JUNTO, "r_audio") === "Audio y Video" &&
    etiqueta(TODO_JUNTO, "r_microfono") === "Pasa Micrófono",
  "y cada uno conserva su propio nombre",
);

// ---------------------------------------------------------------------------
console.log("\n--- 4. Nada guardado se esconde ---");
const vacio = responsibilitiesToShow(UNICO, () => false);
check(
  vacio.length === MONTHLY_RESPONSIBILITIES.length - 1,
  "la casilla apagada y vacía no estorba en la pantalla",
  `${vacio.length}`,
);
const conViejo = responsibilitiesToShow(UNICO, (k) => k === "r_acom_auditorio");
check(
  conViejo.length === MONTHLY_RESPONSIBILITIES.length,
  "lo que ya tenía nombre sigue a la vista",
);
const auditorio = conViejo.find((r) => r.key === "r_acom_auditorio")!;
check(!!auditorio.inactiva, "marcado como que ya no se reparte");
check(
  conViejo.filter((r) => !r.inactiva).length === MONTHLY_RESPONSIBILITIES.length - 1,
  "pero no cuenta como casilla que haya que rellenar",
);
check(
  conViejo.find((r) => r.key === "r_acom_entrada")!.label === LABEL_ACOM_AMBOS,
  "y la que queda ya se ve con el nombre nuevo",
);

// ---------------------------------------------------------------------------
console.log("\n--- 5. El reparto automático respeta el ajuste ---");

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
  rDos.proposals.filter((p) => p.slotKey === "r_acom_auditorio").length === fechas.length,
  "sin el ajuste propone un acomodador de auditorio por reunión",
  `${rDos.proposals.filter((p) => p.slotKey === "r_acom_auditorio").length}`,
);

const rUnico = autoAssign(posiciones(UNICO, fechas), contextos, candidatos);
check(
  rUnico.proposals.filter((p) => p.slotKey === "r_acom_auditorio").length === 0,
  "con el ajuste no propone a nadie para el auditorio",
);
check(
  rUnico.proposals.filter((p) => p.slotKey === "r_acom_entrada").length === fechas.length,
  "pero sí un hermano por reunión para la entrada",
);
check(
  rUnico.proposals.every(
    (p) => p.slotKey !== "r_acom_entrada" || p.slotLabel === LABEL_ACOM_AMBOS,
  ),
  "y el aviso al hermano dirá que cubre las dos puertas",
);
check(
  rUnico.uncovered.every((u) => u.slotKey !== "r_acom_auditorio"),
  "el auditorio NO aparece como puesto sin cubrir",
);
check(
  rUnico.proposals.length === rDos.proposals.length - fechas.length,
  "en total, una asignación menos por reunión",
);
check(rUnico.uncovered.length === 0, "y no deja huecos", JSON.stringify(rUnico.uncovered));

// La regla de siempre sigue en pie: nadie hace dos cosas en la misma reunión.
let repetido = false;
for (const [dateISO] of fechas) {
  const nombres = rUnico.proposals.filter((p) => p.dateISO === dateISO).map((p) => p.name);
  if (new Set(nombres).size !== nombres.length) repetido = true;
}
check(!repetido, "nadie recibe dos cosas en la misma reunión");

// Reparto equilibrado: con gente de sobra, nadie se lleva el doble que otro.
const cargas = new Map<string, number>();
for (const p of rUnico.proposals) cargas.set(p.name, (cargas.get(p.name) ?? 0) + 1);
check(
  Math.max(...cargas.values()) - Math.min(...cargas.values()) <= 1,
  "y el reparto sigue equilibrado",
  `${Math.min(...cargas.values())}..${Math.max(...cargas.values())}`,
);

// ---------------------------------------------------------------------------
console.log("\n--- 6. El PDF imprime una sola columna ---");

const FECHAS_PDF = ["2026-03-05", "2026-03-07", "2026-03-12", "2026-03-14"];
// Nombres de hermano de verdad: el lector busca los títulos de columna por
// palabra, así que un nombre como "Entrada 1" se leería como un encabezado.
const filasPdf = (conAuditorio: boolean): FilaResponsabilidad[] =>
  FECHAS_PDF.map((dateISO, i) => ({
    dateISO,
    audio: `Hermano Sonido${i + 1}`,
    video: `Hermano Pantalla${i + 1}`,
    microfono: `Hermano Inalambrico${i + 1} / Hermano Cable${i + 1}`,
    plataforma: `Hermano Tarima${i + 1}`,
    entrada: `Hermano Puerta${i + 1}`,
    auditorio: conAuditorio ? `Hermano Butaca${i + 1}` : "",
    limpieza: i < 2 ? "Grupo 1" : "Grupo 2",
  }));

async function textoDelPdf(
  filas: FilaResponsabilidad[],
  columnaAuditorio: boolean,
): Promise<{ texto: string; items: PdfItem[] }> {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  dibujarResponsabilidades(doc, autoTable, {
    periodo: "MARZO 2026",
    congregacion: "Congregación de Prueba",
    filas,
    columnaAuditorio,
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

const normal = await textoDelPdf(filasPdf(true), true);
check(
  normal.texto.includes("ACOMODADOR") && normal.texto.includes("AUDITORIO"),
  "el PDF de siempre sigue trayendo sus dos columnas",
);
check(normal.texto.includes("Hermano Butaca1"), "con los nombres del auditorio dentro");
check(normal.texto.includes("Hermano Puerta1"), "y los de la entrada");

const unico = await textoDelPdf(filasPdf(false), false);
const sinEspacios = unico.texto.replace(/ \| /g, " ");
check(
  /AUDITORIO Y DE\s*ENTRADA/.test(sinEspacios) ||
    sinEspacios.includes("AUDITORIO Y DE ENTRADA"),
  "con el ajuste puesto, la columna se llama ACOMODADOR AUDITORIO Y DE ENTRADA",
  sinEspacios.slice(0, 260),
);
check(unico.texto.includes("Hermano Puerta1"), "se imprime el nombre de la entrada");
check(
  !unico.texto.includes("Hermano Butaca1"),
  "y no hay una segunda fila con otro nombre para el auditorio",
);
check(
  unico.texto.includes("Grupo 1") && unico.texto.includes("Grupo 2"),
  "la limpieza sigue en su sitio, con sus grupos",
);
check(
  unico.texto.includes("Hermano Sonido1") && unico.texto.includes("Hermano Tarima1"),
  "y las tablas de audio y plataforma no se tocan",
);

// ---------------------------------------------------------------------------
console.log("\n--- 7. Ese PDF se vuelve a leer bien ---");
const fechasValidas = [
  { dateISO: "2026-03-05", day: "JUEVES" as const },
  { dateISO: "2026-03-07", day: "SABADO" as const },
  { dateISO: "2026-03-12", day: "JUEVES" as const },
  { dateISO: "2026-03-14", day: "SABADO" as const },
];

const leidoNormal = parseResponsibilitiesPdf(normal.items, fechasValidas);
check(
  leidoNormal.rows.length === 4,
  "el PDF de siempre se lee entero",
  `${leidoNormal.rows.length}`,
);
check(
  (leidoNormal.rows[0]?.values.r_acom_entrada ?? "") === "Hermano Puerta1" &&
    (leidoNormal.rows[0]?.values.r_acom_auditorio ?? "") === "Hermano Butaca1",
  "con entrada y auditorio en su sitio",
  JSON.stringify(leidoNormal.rows[0]?.values),
);

const leidoUnico = parseResponsibilitiesPdf(unico.items, fechasValidas);
check(
  leidoUnico.rows.length === 4,
  "el PDF con la columna junta también",
  `${leidoUnico.rows.length}`,
);
check(
  (leidoUnico.rows[0]?.values.r_acom_entrada ?? "") === "Hermano Puerta1",
  "el nombre entra como Acomodador de Entrada, que es la casilla que se reparte",
  JSON.stringify(leidoUnico.rows[0]?.values),
);
check(
  !(leidoUnico.rows[0]?.values.r_acom_auditorio ?? "").trim(),
  "y NO se inventa una asignación de Auditorio con el mismo nombre",
  leidoUnico.rows[0]?.values.r_acom_auditorio,
);
check(
  (leidoUnico.rows[2]?.values.r_audio ?? "") === "Hermano Sonido3" &&
    (leidoUnico.rows[2]?.values.r_acom_plataforma ?? "") === "Hermano Tarima3",
  "las demás columnas no se corren de sitio",
  JSON.stringify(leidoUnico.rows[2]?.values),
);
check(
  (leidoUnico.rows[0]?.values.r_limpieza ?? "") === "Grupo 1",
  "y la limpieza se lee igual",
  JSON.stringify(leidoUnico.rows[0]?.values),
);

console.log(`\n=== ${ok} comprobaciones bien · ${bad} mal ===`);
process.exit(bad === 0 ? 0 : 1);
