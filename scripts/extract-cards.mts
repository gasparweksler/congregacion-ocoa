// ============================================================================
//  Lee las tarjetas "Registro de Publicador de la Congregación" (PDF con
//  campos de formulario) y vuelca los datos personales a JSON.
//  NO toca la base de datos: solo lee los PDF.
//    npx tsx scripts/extract-cards.mts "<carpeta raíz>" [salida.json]
//
//  Mapa de campos del formulario oficial (S-21):
//    900_1  Nombre              900_7  Ungido
//    900_2  Fecha de nacimiento 900_8  Anciano
//    900_3  Hombre              900_9  Siervo ministerial
//    900_4  Mujer               900_10 Precursor regular
//    900_5  Fecha de bautismo   900_11 Precursor especial
//    900_6  Otras ovejas        900_12 Misionero
// ============================================================================

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, basename, relative } from "node:path";
import { installPdfNodePolyfills } from "../src/lib/pdf-node-polyfills.js";

export type CardData = {
  file: string;
  folder: string;
  name: string;
  birthDate: string | null; // DD-MM-YYYY tal cual viene en el PDF
  baptismDate: string | null;
  sex: "M" | "F" | null;
  otherSheep: boolean; // Otras ovejas
  anointed: boolean; // Ungido
  elder: boolean;
  ministerialServant: boolean;
  regularPioneer: boolean;
  specialPioneer: boolean;
  missionary: boolean;
  serviceYear: string | null;
};

function listPdfs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith("~$")) continue; // temporales de Office
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listPdfs(full));
    else if (entry.toLowerCase().endsWith(".pdf")) out.push(full);
  }
  return out.sort();
}

const clean = (v: unknown): string | null => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s.length ? s : null;
};

export async function extractCards(root: string): Promise<CardData[]> {
  installPdfNodePolyfills();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  (globalThis as unknown as Record<string, unknown>).pdfjsWorker = await import(
    "pdfjs-dist/legacy/build/pdf.worker.mjs"
  );

  const cards: CardData[] = [];
  for (const file of listPdfs(root)) {
    const data = new Uint8Array(readFileSync(file));
    const doc = await pdfjs.getDocument({
      data,
      useSystemFonts: false,
      disableFontFace: true,
    }).promise;
    const fields = (await doc.getFieldObjects()) ?? {};

    // Los nombres reales llevan sufijo de tipo ("900_2_Text_SanSerif",
    // "900_3_CheckBox"), así que se busca por prefijo exacto "900_<n>_".
    const entries = Object.entries(
      fields as Record<string, { value?: unknown }[]>,
    );
    const val = (n: number): unknown => {
      const hit = entries.find(
        ([k]) => k === `900_${n}` || k.startsWith(`900_${n}_`),
      );
      return hit?.[1]?.[0]?.value;
    };
    const checked = (n: number) => String(val(n) ?? "Off") !== "Off";

    const sexo: "M" | "F" | null = checked(3) ? "M" : checked(4) ? "F" : null;

    cards.push({
      file: relative(root, file),
      folder: relative(root, file).split(/[\\/]/)[0],
      name: clean(val(1)) ?? basename(file, ".pdf"),
      birthDate: clean(val(2)),
      baptismDate: clean(val(5)),
      sex: sexo,
      otherSheep: checked(6),
      anointed: checked(7),
      elder: checked(8),
      ministerialServant: checked(9),
      regularPioneer: checked(10),
      specialPioneer: checked(11),
      missionary: checked(12),
      serviceYear: clean(val(13)),
    });
    await doc.destroy();
  }
  return cards;
}

// Ejecutado directamente: vuelca el JSON y un resumen.
const root = process.argv[2];
if (root) {
  const cards = await extractCards(root);
  const out = process.argv[3];
  if (out) writeFileSync(out, JSON.stringify(cards, null, 2), "utf8");
  console.log(`Tarjetas leídas: ${cards.length}`);
  const sinNac = cards.filter((c) => !c.birthDate).length;
  const sinBau = cards.filter((c) => !c.baptismDate).length;
  const sinSexo = cards.filter((c) => !c.sex).length;
  console.log(
    `Sin fecha de nacimiento: ${sinNac} · sin fecha de bautismo: ${sinBau} · sin sexo: ${sinSexo}`,
  );
  if (out) console.log(`JSON: ${out}`);
  else for (const c of cards) console.log(JSON.stringify(c));
}
