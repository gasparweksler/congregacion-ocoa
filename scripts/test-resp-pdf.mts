// Prueba de ida y vuelta del lector de PDF de responsabilidades:
// genera un PDF con el MISMO formato que produce /api/responsabilidades-pdf y
// verifica que el parser recupere exactamente los mismos nombres y fechas.
//   npx tsx scripts/test-resp-pdf.mts
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { parseResponsibilitiesPdf, type PdfItem } from "../src/lib/resp-pdf-parser.js";

const DAY_LABEL: Record<string, string> = { JUEVES: "Jueves", SABADO: "Sábado" };
const GROUP_FILLS: [number, number, number][] = [
  [252, 224, 168], [246, 178, 178], [178, 233, 200],
  [178, 200, 240], [222, 198, 240], [200, 224, 210],
];

// --- Datos de prueba: septiembre 2026 (jueves 3,10,17,24 / sábados 5,12,19,26)
type Row = { dateISO: string; day: "JUEVES" | "SABADO"; v: Record<string, string> };
// LONG=1 fuerza nombres largos que autoTable parte en dos renglones dentro de
// la misma celda: comprueba que el parser los vuelva a unir.
const LONG = process.env.LONG === "1";
const N = (i: number) =>
  LONG ? `Juan Carlos Rodríguez Martínez ${i}` : `Hermano Apellido${i}`;
const dates: [number, "JUEVES" | "SABADO"][] = [
  [3, "JUEVES"], [5, "SABADO"], [10, "JUEVES"], [12, "SABADO"],
  [17, "JUEVES"], [19, "SABADO"], [24, "JUEVES"], [26, "SABADO"],
];
// Limpieza con celdas combinadas: Grupo 1 x3, Grupo 2 x2, Grupo 3 x3.
const limpieza = ["Grupo 1", "Grupo 1", "Grupo 1", "Grupo 2", "Grupo 2", "Grupo 3", "Grupo 3", "Grupo 3"];
const rows: Row[] = dates.map(([d, day], i) => ({
  dateISO: `2026-09-${String(d).padStart(2, "0")}`,
  day,
  v: {
    r_audio: N(i * 8 + 1),
    r_video: N(i * 8 + 2),
    r_microfono: N(i * 8 + 3),
    r_microfono_2: N(i * 8 + 4),
    r_acom_plataforma: N(i * 8 + 5),
    r_acom_entrada: N(i * 8 + 6),
    r_acom_auditorio: N(i * 8 + 7),
    r_limpieza: limpieza[i],
  },
}));

// --- Generación del PDF (copia fiel de la ruta /api/responsabilidades-pdf) ---
const period = "SEPTIEMBRE 2026";
const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
const pageW = doc.internal.pageSize.getWidth();
const marginX = 36;
const dateCol = (r: Row) => `${DAY_LABEL[r.day]} ${Number(r.dateISO.split("-")[2])}`;

doc.setFont("helvetica", "bold");
doc.setFontSize(13);
doc.text("ASIGNACIONES PARA LAS REUNIONES AUDIO Y VIDEO", pageW / 2, 40, { align: "center" });
autoTable(doc, {
  startY: 54,
  margin: { left: marginX, right: marginX },
  head: [
    [{ content: "DIA/MES" }, { content: "AUDIO" }, { content: "VIDEO" }, { content: "MICROFONO" }, { content: "PLATAFORMA" }],
    [{ content: period, colSpan: 5 }],
  ],
  body: rows.map((r) => [
    dateCol(r), r.v.r_audio, r.v.r_video,
    [r.v.r_microfono, r.v.r_microfono_2].filter(Boolean).join(" / "),
    r.v.r_acom_plataforma,
  ]),
  styles: { fontSize: 9, halign: "center", valign: "middle", cellPadding: 4, lineColor: [148, 163, 184], lineWidth: 0.5 },
  headStyles: { fillColor: [149, 180, 216], textColor: [20, 30, 50], fontStyle: "bold" },
  columnStyles: { 0: { fontStyle: "bold", fillColor: [235, 240, 248] } },
});

const limpiezaBody: any[][] = [];
const groupIndex = new Map<string, number>();
let nextColor = 0;
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  const g = r.v.r_limpieza || "";
  const row: any[] = [dateCol(r), r.v.r_acom_entrada, r.v.r_acom_auditorio];
  const prevG = i > 0 ? rows[i - 1].v.r_limpieza || "" : null;
  if (g && g === prevG) {
    for (let j = limpiezaBody.length - 1; j >= 0; j--) {
      const last = limpiezaBody[j][3];
      if (last && typeof last === "object") { last.rowSpan = (last.rowSpan ?? 1) + 1; break; }
    }
  } else {
    let fill: [number, number, number] | undefined;
    if (g) {
      if (!groupIndex.has(g)) { groupIndex.set(g, nextColor % GROUP_FILLS.length); nextColor++; }
      fill = GROUP_FILLS[groupIndex.get(g)!];
    }
    row.push({ content: g, rowSpan: 1, styles: { fontStyle: "bold", fontSize: 11, fillColor: fill ?? [255, 255, 255] } });
  }
  limpiezaBody.push(row);
}
const afterY = (doc as any).lastAutoTable.finalY + 28;
doc.setFont("helvetica", "bold");
doc.setFontSize(13);
doc.text("ASIGNACIONES PARA LAS REUNIONES ACOMODACIÓN Y LIMPIEZA", pageW / 2, afterY, { align: "center" });
autoTable(doc, {
  startY: afterY + 14,
  margin: { left: marginX, right: marginX },
  head: [
    [{ content: "DIA/MES" }, { content: "ACOMODADOR ENTRADA" }, { content: "ACOMODADOR AUDITORIO" }, { content: "LIMPIEZA POR GRUPOS" }],
    [{ content: period, colSpan: 4 }],
  ],
  body: limpiezaBody,
  styles: { fontSize: 9, halign: "center", valign: "middle", cellPadding: 4, lineColor: [148, 163, 184], lineWidth: 0.5 },
  headStyles: { fillColor: [168, 208, 168], textColor: [20, 40, 20], fontStyle: "bold" },
  columnStyles: { 0: { fontStyle: "bold", fillColor: [235, 244, 235], cellWidth: 90 }, 3: { cellWidth: 150 } },
});

const bytes = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);

// --- Lectura y comparación ---
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const pdf = await pdfjs.getDocument({ data: bytes, useSystemFonts: false, disableFontFace: true }).promise;
const items: PdfItem[] = [];
for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  const c = await page.getTextContent();
  for (const raw of c.items as any[]) {
    if (!raw.str?.trim()) continue;
    items.push({ text: raw.str, x: raw.transform[4], y: raw.transform[5], width: raw.width ?? 0, page: p });
  }
}
console.log(`Fragmentos de texto leídos: ${items.length}`);

const validDates = rows.map((r) => ({ dateISO: r.dateISO, day: r.day }));
const parsed = parseResponsibilitiesPdf(items, validDates);

let ok = 0, bad = 0;
for (const expected of rows) {
  const got = parsed.rows.find((r) => r.dateISO === expected.dateISO);
  if (!got) { console.log(`❌ FALTA la fecha ${expected.dateISO}`); bad += 8; continue; }
  for (const [k, want] of Object.entries(expected.v)) {
    const have = (got.values[k] ?? "").trim();
    if (have === want) ok++;
    else { bad++; console.log(`❌ ${expected.dateISO} ${k}: esperado "${want}" / leído "${have}"`); }
  }
}
console.log(`\nFilas leídas: ${parsed.rows.length}/${rows.length}`);
console.log(`Celdas correctas: ${ok} · incorrectas: ${bad}`);
if (parsed.warnings.length) console.log("Avisos:", parsed.warnings);
process.exit(bad === 0 && parsed.rows.length === rows.length ? 0 : 1);
