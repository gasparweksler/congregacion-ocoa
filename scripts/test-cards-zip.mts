// Prueba del lote: genera el ZIP de tarjetas de un filtro y lo vuelve a abrir
// para comprobar que cada PDF es válido y lleva el nombre correcto.
//   npx tsx scripts/test-cards-zip.mts [privilegio] [añoServicio]
import { writeFileSync } from "node:fs";
import JSZip from "jszip";
import { PrismaClient } from "@prisma/client";
import { installPdfNodePolyfills } from "../src/lib/pdf-node-polyfills.js";
import {
  buildPublisherCard, cardFileName, currentServiceYear, serviceYearMonths,
} from "../src/lib/publisher-card.js";

const privilegio = process.argv[2] || undefined;
const serviceYear = Number(process.argv[3]) || currentServiceYear();
const out = process.argv[4];

const prisma = new PrismaClient();
const publishers = await prisma.publisher.findMany({
  where: privilegio ? { privilege: privilegio } : {},
  orderBy: [{ group: { name: "asc" } }, { fullName: "asc" }],
  select: { id: true, fullName: true, sex: true, birthDate: true, baptismDate: true,
    hope: true, privilege: true, status: true },
});
const months = serviceYearMonths(serviceYear);
const reports = await prisma.monthlyReport.findMany({
  where: { publisherId: { in: publishers.map((p) => p.id) },
    OR: months.map((m) => ({ year: m.year, month: m.month })) },
  select: { publisherId: true, year: true, month: true, participated: true,
    bibleStudies: true, hours: true, auxiliaryPioneer: true, comment: true },
});
await prisma.$disconnect();
console.log(`Publicadores: ${publishers.length} · informes del año: ${reports.length}`);

const zip = new JSZip();
for (const p of publishers) {
  const pdf = await buildPublisherCard(
    p, reports.filter((r) => r.publisherId === p.id), serviceYear,
  );
  zip.file(cardFileName(p.fullName, serviceYear), pdf);
}
const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
if (out) writeFileSync(out, bytes);
console.log(`ZIP: ${(bytes.length / 1024).toFixed(0)} KB`);

// --- Reabrir el ZIP y validar cada PDF ---
installPdfNodePolyfills();
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
(globalThis as unknown as Record<string, unknown>).pdfjsWorker = await import(
  "pdfjs-dist/legacy/build/pdf.worker.mjs",
);
const reopened = await JSZip.loadAsync(bytes);
const names = Object.keys(reopened.files);
console.log(`Archivos dentro del ZIP: ${names.length}`);
let fallos = 0;
for (const fname of names) {
  const data = await reopened.files[fname].async("uint8array");
  const doc = await pdfjs.getDocument({ data, useSystemFonts: false, disableFontFace: true }).promise;
  const fields = (await doc.getFieldObjects()) ?? {};
  const entries = Object.entries(fields as Record<string, { value?: unknown }[]>);
  const nombre = String(entries.find(([k]) => k.startsWith("900_1_"))?.[1]?.[0]?.value ?? "");
  const anio = String(entries.find(([k]) => k.startsWith("900_13"))?.[1]?.[0]?.value ?? "");
  const esperado = publishers.find((p) => cardFileName(p.fullName, serviceYear) === fname);
  const ok = esperado && nombre === esperado.fullName.toUpperCase() && anio === String(serviceYear) && doc.numPages === 1;
  if (!ok) { fallos++; console.log(`  ❌ ${fname}: nombre="${nombre}" año="${anio}" páginas=${doc.numPages}`); }
  else console.log(`  ✅ ${fname}  →  ${nombre} (${anio})`);
  await doc.destroy();
}
console.log(fallos === 0 ? "\n✅ Todas las tarjetas del ZIP son válidas." : `\n❌ ${fallos} tarjeta(s) con problemas.`);
process.exit(fallos === 0 ? 0 : 1);
