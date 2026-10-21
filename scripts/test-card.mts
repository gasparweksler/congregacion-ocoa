// Prueba: genera la tarjeta de un publicador y vuelve a leer el PDF para
// comprobar que cada campo quedó con el valor esperado.
//   npx tsx scripts/test-card.mts "Horacio Tapia" 2027 [salida.pdf]
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { installPdfNodePolyfills } from "../src/lib/pdf-node-polyfills.js";
import {
  buildPublisherCard,
  serviceYearMonths,
  currentServiceYear,
} from "../src/lib/publisher-card.js";
import { MONTH_NAMES } from "../src/lib/constants.js";

const name = process.argv[2] ?? "Horacio Tapia";
const serviceYear = Number(process.argv[3]) || currentServiceYear();
const out = process.argv[4];

const prisma = new PrismaClient();
const p = await prisma.publisher.findFirst({
  where: { fullName: name },
  select: {
    fullName: true, sex: true, birthDate: true, baptismDate: true,
    hope: true, privilege: true, status: true,
    reports: {
      select: { year: true, month: true, participated: true, bibleStudies: true,
        hours: true, auxiliaryPioneer: true, comment: true },
    },
  },
});
if (!p) throw new Error(`No existe el publicador "${name}"`);
await prisma.$disconnect();

const pdf = await buildPublisherCard(p, p.reports, serviceYear);
if (out) writeFileSync(out, pdf);
console.log(`PDF generado: ${pdf.length} bytes · informes del hermano: ${p.reports.length}`);

// --- Releer y verificar ---
installPdfNodePolyfills();
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
(globalThis as unknown as Record<string, unknown>).pdfjsWorker = await import(
  "pdfjs-dist/legacy/build/pdf.worker.mjs",
);
const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: false, disableFontFace: true }).promise;
const fields = (await doc.getFieldObjects()) ?? {};
const entries = Object.entries(fields as Record<string, { value?: unknown }[]>);
const val = (prefix: string) =>
  entries.find(([k]) => k === prefix || k.startsWith(`${prefix}_`))?.[1]?.[0]?.value ?? "";
const on = (prefix: string) => String(val(prefix)) !== "Off" && String(val(prefix)) !== "";

console.log("\n--- ENCABEZADO LEÍDO DEL PDF ---");
console.log("Nombre:      ", val("900_1"));
console.log("Nacimiento:  ", val("900_2"), "| Hombre:", on("900_3"), "| Mujer:", on("900_4"));
console.log("Bautismo:    ", val("900_5"), "| Otras ovejas:", on("900_6"), "| Ungido:", on("900_7"));
console.log("Anciano:", on("900_8"), "| Siervo:", on("900_9"), "| Prec. regular:", on("900_10"));
console.log("Año servicio:", val("900_13"));

console.log("\n--- FILAS DE MESES ---");
const months = serviceYearMonths(serviceYear);
let suma = 0;
months.forEach((m, i) => {
  const row = 20 + i;
  const part = on(`901_${row}`), cursos = val(`902_${row}`), aux = on(`903_${row}`);
  const horas = val(`904_${row}`), notas = val(`905_${row}`);
  const esperado = p.reports.find((r) => r.year === m.year && r.month === m.month);
  if (horas) suma += Number(horas);
  const marca = esperado ? "·" : " ";
  console.log(
    `${marca} ${MONTH_NAMES[m.month - 1].padEnd(10)} ${m.year}  participó:${part ? "Sí" : "No "} cursos:${String(cursos).padEnd(3)} aux:${aux ? "Sí" : "No "} horas:${String(horas).padEnd(4)} notas:${notas}`,
  );
  // Comprobación contra el informe real
  if (esperado) {
    const okPart = part === esperado.participated;
    const okCursos = String(cursos) === (esperado.bibleStudies > 0 ? String(esperado.bibleStudies) : "");
    const okHoras = String(horas) === ((esperado.hours ?? 0) > 0 ? String(esperado.hours) : "");
    const okAux = aux === esperado.auxiliaryPioneer;
    if (!okPart || !okCursos || !okHoras || !okAux) {
      console.log(`   ❌ no coincide con el informe guardado`, esperado);
      process.exitCode = 1;
    }
  } else if (part || cursos || aux || horas || notas) {
    console.log("   ❌ fila sin informe pero con datos");
    process.exitCode = 1;
  }
});
console.log(`\nTotal de horas en el PDF: ${val(`904_32`)} · suma de las filas: ${suma}`);
if (String(val("904_32") || "0") !== String(suma || "")) {
  if (!(suma === 0 && String(val("904_32")) === "")) {
    console.log("❌ el total no coincide con la suma de las filas");
    process.exitCode = 1;
  }
}
if (!process.exitCode) console.log("✅ Todas las filas coinciden con los informes guardados.");
