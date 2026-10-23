// ============================================================================
//  Comprueba el PDF del programa de Vida y Ministerio.
//
//  Genera el PDF con los datos REALES de la base (solo lectura) y lo vuelve a
//  leer para verificar que:
//   1. Aparecen todas las semanas del mes.
//   2. No se pierde ningún nombre: cada hermano asignado está en el PDF.
//   3. No se inventa nada: no aparecen números de canción ni lectura semanal,
//      porque esos datos no se guardan (ver el comentario de programa-pdf.ts).
//   4. Cada congregación solo ve su propio programa.
//
//    npx tsx scripts/test-programa-pdf.mts
// ============================================================================
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { buildProgramaPdf } from "../src/lib/programa-pdf.js";
import { extractPdfItems } from "../src/lib/pdf-text.js";
import { MEETING_DAYS, monthName } from "../src/lib/constants.js";

const p = new PrismaClient();
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

const congs = await p.congregation.findMany({
  select: { id: true, name: true },
  orderBy: { name: "asc" },
});
console.log(`Congregaciones: ${congs.map((c) => c.name).join(", ")}\n`);

// Mes con más reuniones de Jueves cargadas: el que de verdad tiene programa.
const todas = await p.meeting.findMany({
  where: { day: MEETING_DAYS.JUEVES },
  select: { date: true, congregationId: true },
});
const conteo = new Map<string, number>();
for (const m of todas) {
  const k = `${m.date.getFullYear()}-${m.date.getMonth() + 1}`;
  conteo.set(k, (conteo.get(k) ?? 0) + 1);
}
const [mejor] = [...conteo.entries()].sort((a, b) => b[1] - a[1]);
if (!mejor) {
  console.log("No hay reuniones de Jueves en la base. Nada que comprobar.");
  await p.$disconnect();
  process.exit(0);
}
const [year, month] = mejor[0].split("-").map(Number);
console.log(`Período de prueba: ${monthName(month)} ${year}\n`);

async function pdfDe(congregationId: string) {
  const meetings = await p.meeting.findMany({
    where: {
      congregationId,
      day: MEETING_DAYS.JUEVES,
      date: {
        gte: new Date(year, month - 1, 1),
        lt: new Date(year, month, 1),
      },
    },
    orderBy: { date: "asc" },
    include: { assignments: { orderBy: { order: "asc" } } },
  });
  const buf = buildProgramaPdf(
    meetings.map((m) => ({
      date: m.date,
      weekLabel: m.weekLabel,
      assignments: m.assignments.map((a) => ({
        slotKey: a.slotKey,
        section: a.section,
        label: a.label,
        order: a.order,
        primaryName: a.primaryName,
        secondaryName: a.secondaryName,
      })),
    })),
    `${monthName(month).toUpperCase()} ${year}`,
  );
  // pdfjs se queda con el ArrayBuffer (lo transfiere y lo deja vacío), así que
  // se le entrega una copia y se conserva el original para guardarlo.
  const bytes = new Uint8Array(buf.byteLength);
  bytes.set(new Uint8Array(buf));
  const items = await extractPdfItems(new Uint8Array(bytes));
  return { meetings, bytes, items, texto: norm(items.map((i) => i.text).join(" ")) };
}

// --- La congregación con datos en ese mes ---
const principal =
  congs.find((c) =>
    todas.some(
      (m) =>
        m.congregationId === c.id &&
        m.date.getFullYear() === year &&
        m.date.getMonth() + 1 === month,
    ),
  ) ?? congs[0];

const { meetings, bytes, items: itemsPrincipal, texto } = await pdfDe(principal.id);
console.log(`1. Programa de "${principal.name}": ${meetings.length} semana(s)`);
check(meetings.length > 0, "el mes tiene reuniones de Jueves");
check(bytes.byteLength > 1000, `el PDF se genera (${Math.round(bytes.byteLength / 1024)} KB)`);

console.log("\n2. Las semanas y las secciones");
for (const m of meetings) {
  const etiqueta = m.weekLabel ?? "";
  if (etiqueta) {
    check(texto.includes(norm(etiqueta)), `aparece la semana "${etiqueta}"`);
  }
}
for (const s of [
  "TESOROS DE LA BIBLIA",
  "SEAMOS MEJORES MAESTROS",
  "NUESTRA VIDA CRISTIANA",
]) {
  check(texto.includes(norm(s)), `aparece la barra "${s}"`);
}

console.log("\n3. Ningún nombre se pierde");
const nombres = new Set<string>();
for (const m of meetings) {
  for (const a of m.assignments) {
    if (a.section === "RESPONSABILIDADES" || a.slotKey.startsWith("r_")) continue;
    for (const n of [a.primaryName, a.secondaryName]) {
      if (n && n.trim()) nombres.add(n.trim());
    }
  }
}
const faltan = [...nombres].filter((n) => !texto.includes(norm(n)));
console.log(`  nombres asignados en la base: ${nombres.size}`);
check(
  faltan.length === 0,
  faltan.length === 0
    ? "todos están en el PDF"
    : `faltan ${faltan.length}: ${faltan.slice(0, 5).join(", ")}`,
);

console.log("\n4. Ningún título de parte se pierde");
const labels = new Set<string>();
for (const m of meetings) {
  for (const a of m.assignments) {
    // Las responsabilidades (micrófono, acomodadores, audio…) no forman parte
    // del programa impreso.
    if (a.section === "RESPONSABILIDADES" || a.slotKey.startsWith("r_")) continue;
    if (a.label?.trim()) labels.add(a.label.trim());
  }
}
const faltanL = [...labels].filter((l) => !texto.includes(norm(l)));
check(
  faltanL.length === 0,
  faltanL.length === 0
    ? `los ${labels.size} títulos de parte están en el PDF`
    : `faltan ${faltanL.length}: ${faltanL.slice(0, 3).join(" | ")}`,
);

console.log("\n5. No se inventan datos que no se guardan");
check(
  !/cancion \d/.test(texto),
  "no aparece ningún número de canción inventado",
);
check(
  !texto.includes("lectura semanal de la biblia"),
  "no aparece una lectura semanal inventada",
);

console.log("\n6. Ninguna semana se parte entre dos hojas");
{
  // Cada semana lleva exactamente una barra de cada sección. Si una semana se
  // partiera, en alguna hoja quedarían descompensadas.
  const porPagina = new Map<number, string[]>();
  for (const i of itemsPrincipal) {
    if (!porPagina.has(i.page)) porPagina.set(i.page, []);
    porPagina.get(i.page)!.push(i.text);
  }
  let barras = 0;
  for (const [pag, txt] of [...porPagina].sort((a, b) => a[0] - b[0])) {
    const j = norm(txt.join(" "));
    const n = (s: string) => j.split(norm(s)).length - 1;
    const t = n("TESOROS DE LA BIBLIA");
    const s = n("SEAMOS MEJORES MAESTROS");
    const v = n("NUESTRA VIDA CRISTIANA");
    check(
      t === s && s === v,
      `hoja ${pag}: ${t} semana(s) completa(s) (tesoros ${t} · maestros ${s} · vida cristiana ${v})`,
    );
    barras += t;
  }
  check(
    barras === meetings.length,
    `las ${meetings.length} semanas están todas en el PDF (${barras})`,
  );
}

console.log("\n7. Cada congregación ve solo lo suyo");
for (const c of congs) {
  if (c.id === principal.id) continue;
  const otra = await pdfDe(c.id);
  const ajenos = [...nombres].filter((n) => otra.texto.includes(norm(n)));
  check(
    ajenos.length === 0,
    `"${c.name}" no recibe nombres de "${principal.name}" (${otra.meetings.length} semana(s) propias)`,
  );
}

const salida = process.env.SALIDA;
if (salida) {
  writeFileSync(salida, Buffer.from(bytes));
  console.log(`\nPDF guardado en ${salida}`);
}

await p.$disconnect();
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
