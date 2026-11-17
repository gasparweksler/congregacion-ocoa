// ============================================================================
//  Prueba: los estados del publicador.
//
//  Comprueba que los dos estados nuevos —Precursor Especial y Misionero que
//  sirve en el campo— se comportan como los demás en todo lo que depende del
//  estado: el desplegable de la tarjeta, la planilla de Excel, la validación
//  del formulario, las horas del informe y las casillas de la tarjeta S-21.
//
//  Sin base de datos: todo son funciones puras y el PDF oficial. Se puede
//  correr tantas veces como haga falta sin tocar nada.
//      npm run test:estados
// ============================================================================

import ExcelJS from "exceljs";
import { installPdfNodePolyfills } from "../src/lib/pdf-node-polyfills.js";
import { buildPublisherCard, currentServiceYear } from "../src/lib/publisher-card.js";
import {
  PUBLISHER_STATUS,
  PUBLISHER_STATUS_LABELS,
  PUBLISHER_STATUS_VALUES,
  isPioneer,
  statusLabel,
} from "../src/lib/constants.js";
import { publisherSchema } from "../src/lib/validations.js";
import {
  buildPublishersTemplate,
  parsePublishersSheet,
} from "../src/lib/publishers-xlsx.js";

let fallos = 0;
const ok = (cond: boolean, texto: string) => {
  console.log(`  ${cond ? "OK " : "FALLA"}  ${texto}`);
  if (!cond) fallos++;
};

const NUEVOS = [
  PUBLISHER_STATUS.PRECURSOR_ESPECIAL,
  PUBLISHER_STATUS.MISIONERO_CAMPO,
] as const;

// ---------------------------------------------------------------------------
console.log("\n1) Los estados existen y tienen nombre");
// ---------------------------------------------------------------------------
ok(PUBLISHER_STATUS_VALUES.length === 8, `son 8 estados (${PUBLISHER_STATUS_VALUES.length})`);
ok(
  PUBLISHER_STATUS_LABELS.PRECURSOR_ESPECIAL === "Precursor Especial",
  `"${PUBLISHER_STATUS_LABELS.PRECURSOR_ESPECIAL}"`,
);
ok(
  PUBLISHER_STATUS_LABELS.MISIONERO_CAMPO === "Misionero que sirve en el campo",
  `"${PUBLISHER_STATUS_LABELS.MISIONERO_CAMPO}"`,
);
for (const s of NUEVOS) {
  ok(PUBLISHER_STATUS_VALUES.includes(s), `${s} está en la lista del desplegable`);
  ok(statusLabel(s) !== s, `${s} se enseña con su nombre, no con la clave`);
}

// Los de antes siguen todos ahí: no se cambió ni se quitó ninguno.
for (const s of [
  "BAUTIZADO", "NO_BAUTIZADO", "INACTIVO",
  "PRECURSOR_REGULAR", "PRECURSOR_AUXILIAR", "PRECURSOR_AUXILIAR_INDEFINIDO",
]) {
  ok(PUBLISHER_STATUS_VALUES.includes(s as never), `sigue existiendo ${s}`);
}

// ---------------------------------------------------------------------------
console.log("\n2) Informan horas, como los demás precursores");
// ---------------------------------------------------------------------------
for (const s of NUEVOS) ok(isPioneer(s), `${s} informa horas`);
ok(isPioneer(PUBLISHER_STATUS.PRECURSOR_REGULAR), "el precursor regular sigue informando horas");
ok(!isPioneer(PUBLISHER_STATUS.BAUTIZADO), "un bautizado sigue SIN informar horas");
ok(!isPioneer(PUBLISHER_STATUS.NO_BAUTIZADO), "un no bautizado sigue SIN informar horas");
ok(!isPioneer(PUBLISHER_STATUS.INACTIVO), "un inactivo sigue SIN informar horas");

// ---------------------------------------------------------------------------
console.log("\n3) El formulario los acepta al guardar");
// ---------------------------------------------------------------------------
for (const s of NUEVOS) {
  const r = publisherSchema.safeParse({
    fullName: "Hermano De Prueba",
    status: s,
    groupId: "g1",
  });
  ok(r.success, `publisherSchema acepta ${s}`);
}
ok(
  !publisherSchema.safeParse({ fullName: "X Y", status: "INVENTADO", groupId: "g1" }).success,
  "y sigue rechazando un estado inventado",
);

// ---------------------------------------------------------------------------
console.log("\n4) La planilla de Excel los ofrece y los lee");
// ---------------------------------------------------------------------------
{
  const wb = new ExcelJS.Workbook();
  buildPublishersTemplate(wb);
  const ayuda = wb.getWorksheet("Valores admitidos")!;
  let textoAyuda = "";
  ayuda.eachRow((row) => {
    textoAyuda += String(row.getCell(2).value ?? "") + "\n";
  });
  for (const s of NUEVOS) {
    ok(
      textoAyuda.includes(PUBLISHER_STATUS_LABELS[s]),
      `la hoja "Valores admitidos" nombra "${PUBLISHER_STATUS_LABELS[s]}"`,
    );
  }

  const ws = wb.getWorksheet("Publicadores")!;
  ws.addRow({
    fullName: "Pedro Precursor Especial",
    groupNumber: 1,
    status: "Precursor Especial",
    sex: "H",
  });
  ws.addRow({
    fullName: "Marta Misionera",
    groupNumber: 2,
    status: "Misionero que sirve en el campo",
    sex: "M",
  });
  const buf = await wb.xlsx.writeBuffer();
  const leido = new ExcelJS.Workbook();
  await leido.xlsx.load(buf as ArrayBuffer);
  const { rows, errors } = parsePublishersSheet(leido);
  ok(errors.length === 0, `la planilla se lee sin errores (${errors.length})`);
  ok(rows.length === 2, `se leen las 2 filas (${rows.length})`);
  ok(rows[0]?.status === PUBLISHER_STATUS.PRECURSOR_ESPECIAL, `fila 1 -> ${rows[0]?.status}`);
  ok(rows[1]?.status === PUBLISHER_STATUS.MISIONERO_CAMPO, `fila 2 -> ${rows[1]?.status}`);
}

// ---------------------------------------------------------------------------
console.log("\n5) La tarjeta S-21 marca su casilla");
// ---------------------------------------------------------------------------
installPdfNodePolyfills();
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
(globalThis as unknown as Record<string, unknown>).pdfjsWorker = await import(
  "pdfjs-dist/legacy/build/pdf.worker.mjs"
);

const anio = currentServiceYear();

/** Lee las tres casillas de precursor/misionero de una tarjeta generada. */
async function casillasDe(status: string) {
  const pdf = await buildPublisherCard(
    {
      fullName: "Hermano De Prueba",
      sex: "M",
      birthDate: new Date(1980, 2, 12, 12),
      baptismDate: new Date(1998, 6, 4, 12),
      hope: "OTRAS_OVEJAS",
      privilege: null,
      status,
    },
    [],
    anio,
  );
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdf),
    useSystemFonts: false,
    disableFontFace: true,
  }).promise;
  const fields = (await doc.getFieldObjects()) ?? {};
  const entries = Object.entries(fields as Record<string, { value?: unknown }[]>);
  const marcada = (prefijo: string) => {
    const v = entries.find(([k]) => k === prefijo || k.startsWith(`${prefijo}_`))?.[1]?.[0]
      ?.value;
    return String(v ?? "") !== "Off" && String(v ?? "") !== "";
  };
  return {
    regular: marcada("900_10"),
    especial: marcada("900_11"),
    misionero: marcada("900_12"),
  };
}

{
  const especial = await casillasDe(PUBLISHER_STATUS.PRECURSOR_ESPECIAL);
  ok(especial.especial, "Precursor Especial marca la casilla «Precursor especial»");
  ok(!especial.regular && !especial.misionero, "y no marca ninguna otra");

  const misionero = await casillasDe(PUBLISHER_STATUS.MISIONERO_CAMPO);
  ok(misionero.misionero, "Misionero marca la casilla «Misionero»");
  ok(!misionero.regular && !misionero.especial, "y no marca ninguna otra");

  const regular = await casillasDe(PUBLISHER_STATUS.PRECURSOR_REGULAR);
  ok(regular.regular, "el Precursor Regular sigue marcando la suya");
  ok(!regular.especial && !regular.misionero, "y no se le marcan las nuevas");

  const bautizado = await casillasDe(PUBLISHER_STATUS.BAUTIZADO);
  ok(
    !bautizado.regular && !bautizado.especial && !bautizado.misionero,
    "un bautizado no marca ninguna de las tres",
  );
}

console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
