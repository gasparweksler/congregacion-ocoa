// ============================================================================
//  Días de reunión propios de cada congregación.
//
//  Antes estaban fijos en el código (jueves y sábado). Se comprueba que:
//   1. Las fechas del mes se calculan con los días configurados.
//   2. Las etiquetas salen del día REAL de cada reunión, no de la
//      configuración, para que una reunión ya creada no cambie de nombre.
//   3. El PDF de responsabilidades se puede volver a leer con otros días
//      (ahí el lector solo reconocía "Jueves" y "Sábado").
//   4. Una celda que no es fecha ("Grupo 1") sigue sin confundirse con una.
//   5. Solo se aceptan días válidos para cada reunión.
//
//  No toca la base de datos.
//    npx tsx scripts/test-dias-reunion.mts
// ============================================================================
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { meetingDatesInMonth } from "../src/lib/period.js";
import {
  meetingDayLabel,
  isMidweekDay,
  isWeekendDay,
  weekdayName,
  DEFAULT_MEETING_DAYS,
} from "../src/lib/constants.js";
import { weekdayNameOfISO } from "../src/lib/dates.js";
import { parseResponsibilitiesPdf, type PdfItem } from "../src/lib/resp-pdf-parser.js";

let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};

// --- 1. Fechas del mes según los días configurados ---
console.log("1. Fechas del mes (octubre 2026)");
{
  // Por defecto: jueves (1,8,15,22,29) y sábados (3,10,17,24,31).
  const porDefecto = meetingDatesInMonth(2026, 10);
  const jueves = porDefecto.filter((x) => x.day === "JUEVES").map((x) => x.date.getDate());
  const sabados = porDefecto.filter((x) => x.day === "SABADO").map((x) => x.date.getDate());
  check(jueves.join(",") === "1,8,15,22,29", `jueves: ${jueves.join(", ")}`);
  check(sabados.join(",") === "3,10,17,24,31", `sábados: ${sabados.join(", ")}`);

  // Martes (entre semana) y domingo (fin de semana).
  const otros = meetingDatesInMonth(2026, 10, { midweekDay: 2, weekendDay: 0 });
  const martes = otros.filter((x) => x.day === "JUEVES").map((x) => x.date.getDate());
  const domingos = otros.filter((x) => x.day === "SABADO").map((x) => x.date.getDate());
  check(martes.join(",") === "6,13,20,27", `martes: ${martes.join(", ")}`);
  check(domingos.join(",") === "4,11,18,25", `domingos: ${domingos.join(", ")}`);
  check(
    otros.every((x) => x.date.getDay() === (x.day === "JUEVES" ? 2 : 0)),
    "cada fecha cae en el día que le toca",
  );
}

// --- 2. Etiquetas tomadas de la fecha real ---
console.log("\n2. La etiqueta sale del día real de la reunión");
{
  const martes6 = new Date(2026, 9, 6, 12);
  const domingo4 = new Date(2026, 9, 4, 12);
  check(
    meetingDayLabel("JUEVES", martes6) === "Martes (Entre semana)",
    `reunión del 6 de octubre: "${meetingDayLabel("JUEVES", martes6)}"`,
  );
  check(
    meetingDayLabel("SABADO", domingo4) === "Domingo (Fin de semana)",
    `reunión del 4 de octubre: "${meetingDayLabel("SABADO", domingo4)}"`,
  );
  // Una reunión creada en jueves sigue diciendo "Jueves" aunque la
  // congregación pase a reunirse los martes.
  const jueves1 = new Date(2026, 9, 1, 12);
  check(
    meetingDayLabel("JUEVES", jueves1) === "Jueves (Entre semana)",
    "una reunión ya creada no cambia de día al cambiar la configuración",
  );
  check(meetingDayLabel("JUEVES") === "Entre semana", "sin fecha, solo el tipo");
  check(weekdayNameOfISO("2026-10-06") === "Martes", "weekdayNameOfISO respeta la zona horaria");
}

// --- 3. Ida y vuelta del PDF de responsabilidades con martes y domingo ---
console.log("\n3. El PDF de responsabilidades se vuelve a leer con otros días");
{
  type Fila = { dateISO: string; day: "JUEVES" | "SABADO"; audio: string; video: string };
  const dias: [number, "JUEVES" | "SABADO"][] = [
    [4, "SABADO"], [6, "JUEVES"], [11, "SABADO"], [13, "JUEVES"],
    [18, "SABADO"], [20, "JUEVES"], [25, "SABADO"], [27, "JUEVES"],
  ];
  // Nombres de persona corrientes: un valor que contuviera "Audio" o "Video"
  // se confundiría con el encabezado de su columna (eso es cosa de los datos de
  // prueba, en la aplicación son nombres de hermanos).
  const filas: Fila[] = dias.map(([d, day], i) => ({
    dateISO: `2026-10-${String(d).padStart(2, "0")}`,
    day,
    audio: `Pedro Soto ${i}`,
    video: `Luis Rojas ${i}`,
  }));

  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  // Misma primera celda que genera la aplicación: el día real y el número.
  const dateCol = (r: Fila) =>
    `${weekdayNameOfISO(r.dateISO)} ${Number(r.dateISO.split("-")[2])}`;

  autoTable(doc, {
    startY: 54,
    margin: { left: 36, right: 36 },
    head: [
      [
        { content: "DIA/MES" }, { content: "AUDIO" }, { content: "VIDEO" },
        { content: "MICROFONO" }, { content: "PLATAFORMA" },
      ],
      [{ content: "OCTUBRE 2026", colSpan: 5 }],
    ],
    body: filas.map((r) => [dateCol(r), r.audio, r.video, `Juan Vera ${filas.indexOf(r)}`, `Ariel Paz ${filas.indexOf(r)}`]),
    styles: { fontSize: 9, halign: "center", valign: "middle", cellPadding: 4 },
  });

  const bytes = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({
    data: bytes,
    useSystemFonts: false,
    disableFontFace: true,
  }).promise;
  const items: PdfItem[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const c = await page.getTextContent();
    for (const raw of c.items as { str?: string; transform?: number[]; width?: number }[]) {
      if (!raw.str?.trim()) continue;
      const t = raw.transform ?? [1, 0, 0, 1, 0, 0];
      items.push({ text: raw.str, x: t[4], y: t[5], width: raw.width ?? 0, page: p });
    }
  }

  const parsed = parseResponsibilitiesPdf(
    items,
    filas.map((r) => ({ dateISO: r.dateISO, day: r.day })),
  );
  check(
    parsed.rows.length === filas.length,
    `reconoce las ${filas.length} fechas (${parsed.rows.length})`,
  );
  let malas = 0;
  for (const f of filas) {
    const leida = parsed.rows.find((r) => r.dateISO === f.dateISO);
    if (
      !leida ||
      (leida.values.r_audio ?? "").trim() !== f.audio ||
      (leida.values.r_video ?? "").trim() !== f.video
    ) {
      malas++;
      console.log(`     ${f.dateISO}: esperado ${f.audio}/${f.video}, leído ${leida?.values.r_audio}/${leida?.values.r_video}`);
    }
  }
  check(malas === 0, "los nombres de cada martes y domingo se recuperan bien");
  if (parsed.warnings.length) console.log(`     avisos: ${parsed.warnings.join(" | ")}`);
}

// --- 4. Lo que no es una fecha no se lee como fecha ---
console.log("\n4. Una celda que no es fecha no se confunde");
{
  // Se arma una tabla cuya primera columna trae "Grupo 1": si el lector lo
  // tomara por una fecha, inventaría una fila.
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  autoTable(doc, {
    startY: 54,
    margin: { left: 36, right: 36 },
    head: [
      [
        { content: "DIA/MES" }, { content: "AUDIO" }, { content: "VIDEO" },
        { content: "MICROFONO" }, { content: "PLATAFORMA" },
      ],
      [{ content: "OCTUBRE 2026", colSpan: 5 }],
    ],
    body: [
      ["Grupo 1", "Carlos Lima", "Mario Ruiz", "Juan Vera", "Ariel Paz"],
      ["Martes 6", "Hermano Lector", "Mario Ruiz", "Juan Vera", "Ariel Paz"],
    ],
    styles: { fontSize: 9, halign: "center", valign: "middle", cellPadding: 4 },
  });
  const bytes = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({
    data: bytes,
    useSystemFonts: false,
    disableFontFace: true,
  }).promise;
  const items: PdfItem[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const c = await page.getTextContent();
    for (const raw of c.items as { str?: string; transform?: number[]; width?: number }[]) {
      if (!raw.str?.trim()) continue;
      const t = raw.transform ?? [1, 0, 0, 1, 0, 0];
      items.push({ text: raw.str, x: t[4], y: t[5], width: raw.width ?? 0, page: p });
    }
  }
  const parsed = parseResponsibilitiesPdf(items, [
    { dateISO: "2026-10-06", day: "JUEVES" },
  ]);
  check(
    parsed.rows.length === 1 && parsed.rows[0].dateISO === "2026-10-06",
    `solo lee la fila real (${parsed.rows.length} fila(s))`,
  );
  check(
    (parsed.rows[0]?.values.r_audio ?? "") === "Hermano Lector",
    "y lee bien su nombre",
  );
}

// --- 5. Validación de los días elegidos ---
console.log("\n5. Días admitidos para cada reunión");
{
  for (const d of [1, 2, 3, 4, 5]) {
    check(isMidweekDay(d), `${weekdayName(d)} vale para entre semana`);
  }
  check(!isMidweekDay(6) && !isMidweekDay(0), "sábado y domingo no valen para entre semana");
  check(isWeekendDay(6) && isWeekendDay(0), "sábado y domingo valen para fin de semana");
  check(!isWeekendDay(3), "miércoles no vale para fin de semana");
  check(
    DEFAULT_MEETING_DAYS.midweekDay === 4 && DEFAULT_MEETING_DAYS.weekendDay === 6,
    "por defecto siguen siendo jueves y sábado (lo que había antes)",
  );
}

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
