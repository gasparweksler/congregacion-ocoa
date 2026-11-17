// ============================================================================
//  Comprobación de los DOS PDF de reuniones, con los datos reales que haya en
//  la base: el de entre semana y el de fin de semana.
//
//  No escribe nada: solo lee, arma los PDF igual que lo hacen las páginas de
//  descarga y los vuelve a leer para ver que el texto está dentro.
//    npx tsx scripts/verificar-pdfs-reunion.mts [congregación] [año] [mes]
// ============================================================================
import { PrismaClient } from "@prisma/client";
import { buildProgramaPdf } from "../src/lib/programa-pdf.js";
import { buildFinDeSemanaPdf } from "../src/lib/fin-de-semana-pdf.js";

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

/** Saca el texto de un PDF con el mismo lector que usa la aplicación. */
async function textoDelPdf(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
  let texto = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    texto += content.items.map((t) => ("str" in t ? t.str : "")).join(" ") + "\n";
  }
  return texto;
}

const slug = process.argv[2] ?? "ocoa";
const cong = await prisma.congregation.findFirstOrThrow({ where: { slug } });

// Mes con reuniones: el del último registro, salvo que se indique otro.
const ultima = await prisma.meeting.findFirst({
  where: { congregationId: cong.id },
  orderBy: { date: "desc" },
  select: { date: true },
});
if (!ultima) {
  console.log(`La congregación "${cong.name}" no tiene reuniones cargadas.`);
  await prisma.$disconnect();
  process.exit(0);
}
const anio = Number(process.argv[3] ?? ultima.date.getFullYear());
const mes = Number(process.argv[4] ?? ultima.date.getMonth() + 1);
const desde = new Date(anio, mes - 1, 1);
const hasta = new Date(anio, mes, 1);
console.log(`\nCongregación "${cong.name}" · ${mes}/${anio}`);

const meetings = await prisma.meeting.findMany({
  where: { congregationId: cong.id, date: { gte: desde, lt: hasta } },
  orderBy: { date: "asc" },
  include: { assignments: { orderBy: { order: "asc" } } },
});
const entreSemana = meetings.filter((m) => m.day !== "SABADO");
const finde = meetings.filter((m) => m.day === "SABADO");
console.log(
  `  reuniones: ${meetings.length} (entre semana ${entreSemana.length} · fin de semana ${finde.length})`,
);

// --- PDF de entre semana ----------------------------------------------------
console.log("\n--- PDF de entre semana ---");
if (entreSemana.length === 0) {
  console.log("  (no hay reuniones de entre semana ese mes)");
} else {
  const pdf = buildProgramaPdf(
    entreSemana.map((m) => ({
      date: m.date,
      weekLabel: m.weekLabel,
      weeklyReading: m.weeklyReading,
      songStart: m.songStart,
      songMiddle: m.songMiddle,
      songEnd: m.songEnd,
      assignments: m.assignments.map((a) => ({
        section: a.section,
        label: a.label,
        primaryName: a.primaryName,
        secondaryName: a.secondaryName,
        order: a.order,
        slotKey: a.slotKey,
      })),
    })),
    `${mes}/${anio}`,
    cong.name,
  );
  const bytes = new Uint8Array(pdf);
  const tam = bytes.byteLength;
  check(tam > 2000, `el PDF tiene contenido (${Math.round(tam / 1024)} KB)`);
  const texto = await textoDelPdf(bytes);
  check(texto.includes(cong.name.toUpperCase()) || texto.includes(cong.name),
    "lleva el nombre de la congregación");
  const conCancionFinal = entreSemana.filter((m) => m.songEnd?.trim());
  if (conCancionFinal.length) {
    const n = conCancionFinal[0].songEnd!.trim();
    check(
      texto.includes(`Canción ${n} y oración`),
      `imprime la canción final y su oración ("Canción ${n} y oración")`,
    );
  }
  check(
    /[Oo]ración/.test(texto),
    "aparecen las oraciones",
  );
}

// --- PDF de fin de semana ---------------------------------------------------
console.log("\n--- PDF de fin de semana ---");
if (finde.length === 0) {
  console.log("  (no hay reuniones de fin de semana ese mes)");
} else {
  const pdf = buildFinDeSemanaPdf(
    finde.map((m) => ({
      date: m.date,
      weekLabel: m.weekLabel,
      presidente: m.assignments.find((a) => a.slotKey === "s_presidente")?.primaryName ?? null,
      lectorAtalaya:
        m.assignments.find((a) => a.slotKey === "s_lector_atalaya")?.primaryName ?? null,
      oracionInicio:
        m.assignments.find((a) => a.slotKey === "s_oracion_inicio")?.primaryName ?? null,
      speakerName: m.speakerName,
      talkNumber: m.talkNumber,
      talkTitle: m.talkTitle,
      hospitalityGroup: m.hospitalityGroup,
    })),
    `${mes}/${anio}`,
    cong.name,
  );
  const bytes = new Uint8Array(pdf);
  const tam = bytes.byteLength;
  check(tam > 2000, `el PDF tiene contenido (${Math.round(tam / 1024)} KB)`);
  const texto = await textoDelPdf(bytes);
  check(
    texto.toUpperCase().includes("FIN DE SEMANA"),
    "se titula como programa de fin de semana",
  );
  check(
    texto.toUpperCase().includes("PRESIDENTE") || texto.toUpperCase().includes("DISCURSO"),
    "trae las columnas del fin de semana",
  );
  const conOrador = finde.find((m) => m.speakerName?.trim());
  if (conOrador) {
    check(
      texto.includes(conOrador.speakerName!.trim().split(" ")[0]),
      "aparece el orador guardado",
    );
  }
}

await prisma.$disconnect();
console.log(`\n=== ${ok} bien, ${bad} mal ===`);
process.exit(bad === 0 ? 0 : 1);
