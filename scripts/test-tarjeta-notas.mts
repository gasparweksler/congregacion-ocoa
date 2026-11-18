// ============================================================================
//  Las observaciones de los informes en la tarjeta del publicador (S-21).
//
//  La casilla de notas del formulario es estrecha y viene con letra de 13
//  puntos: cualquier observación de más de unas 25 letras se cortaba al
//  descargar la tarjeta. Aquí se genera una tarjeta de verdad y se vuelve a
//  abrir para comprobar qué quedó DIBUJADO en cada casilla (no basta con
//  mirar el valor del campo: el recorte pasaba al pintarlo).
//
//      npm run test:tarjeta-notas
//      GUARDAR=ruta.pdf npm run test:tarjeta-notas   (deja el PDF en disco)
// ============================================================================
import { writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { PDFDocument, PDFName, StandardFonts } from "pdf-lib";
import {
  buildPublisherCard,
  ajustarNota,
  enLineas,
  serviceYearMonths,
  type CardPublisher,
  type CardReport,
} from "../src/lib/publisher-card.js";

let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};
const titulo = (t: string) => console.log(`\n${t}`);

// El hueco real de la casilla de notas del formulario.
const ANCHO = 160;

const medidor = await PDFDocument.create();
const helvetica = await medidor.embedFont(StandardFonts.Helvetica);

const CORTA = "Visita";
const LA_DEL_INFORME = "ultimo mes precursora auxiliar";
const LARGA =
  "Empezó el curso con la familia del barrio nuevo y además acompañó al grupo del mercado";
const LARGUISIMA = Array(6).fill(LARGA).join(" ");

titulo("1. Una observación corta se escribe como siempre");
{
  const n = ajustarNota(CORTA, helvetica, ANCHO);
  check(n.texto === CORTA, "se escribe entera");
  check(n.tam === 13, `con la letra del formulario (${n.tam})`);
  check(!n.multilinea && n.completa, "en una sola línea");
}

titulo("2. La del informe de agosto ya no se corta");
{
  const n = ajustarNota(LA_DEL_INFORME, helvetica, ANCHO);
  check(n.texto === LA_DEL_INFORME, "se escribe entera");
  check(n.completa, "sin recortar nada");
  check(
    helvetica.widthOfTextAtSize(n.texto, n.tam) <= ANCHO,
    `y cabe de ancho con letra de ${n.tam} puntos`,
  );
  check(n.tam < 13 && n.tam >= 6, "la letra se encogió lo justo");
  // Antes, con la letra fija del formulario, se salía de la casilla.
  check(
    helvetica.widthOfTextAtSize(LA_DEL_INFORME, 13) > ANCHO,
    "(con la letra de 13 puntos no cabía: por eso se cortaba)",
  );
}

titulo("3. Una observación larga se reparte en dos líneas");
{
  const n = ajustarNota(LARGA, helvetica, ANCHO);
  check(n.texto === LARGA, "se escribe entera");
  check(n.multilinea && n.completa, "repartida, sin perder nada");
  const lineas = enLineas(n.texto, helvetica, n.tam, ANCHO);
  check(lineas.length <= 2, `en ${lineas.length} línea(s), que es lo que cabe`);
  check(
    lineas.every((l) => helvetica.widthOfTextAtSize(l, n.tam) <= ANCHO),
    "y ninguna línea se sale de la casilla",
  );
}

titulo("4. Una observación larguísima se recorta, pero no se pierde");
{
  const n = ajustarNota(LARGUISIMA, helvetica, ANCHO);
  check(!n.completa, "se avisa de que no cabe entera");
  check(n.texto.endsWith("…"), "lo que se escribe termina en puntos suspensivos");
  check(
    enLineas(n.texto, helvetica, n.tam, ANCHO).length <= 2,
    "y lo recortado sí cabe en la casilla",
  );
}

titulo("5. Un texto sin espacios tampoco se sale");
{
  const lineas = enLineas("a".repeat(200), helvetica, 6, ANCHO);
  check(
    lineas.every((l) => helvetica.widthOfTextAtSize(l, 6) <= ANCHO),
    "una palabra larguísima se parte en trozos que caben",
  );
}

// --- La tarjeta de verdad ---------------------------------------------------
const publisher: CardPublisher = {
  fullName: "Prueba De Notas",
  sex: "F",
  birthDate: new Date(1990, 4, 12),
  baptismDate: new Date(2008, 7, 3),
  hope: "OTRAS_OVEJAS",
  privilege: null,
  status: "PUBLICADOR",
};

const SERVICIO = 2027;
const meses = serviceYearMonths(SERVICIO);
/** Devuelve la fila (20..31) del mes que toque. */
const filaDe = (mes: number) => 20 + meses.findIndex((m) => m.month === mes);

const informe = (
  mes: number,
  comment: string | null,
): CardReport => {
  const m = meses.find((x) => x.month === mes)!;
  return {
    year: m.year,
    month: m.month,
    participated: true,
    bibleStudies: 0,
    hours: 18,
    auxiliaryPioneer: true,
    comment,
  };
};

/** Lo que quedó DIBUJADO en una casilla: su texto y su tamaño de letra. */
function dibujado(doc: PDFDocument, prefijo: string) {
  const form = doc.getForm();
  const nombre = form
    .getFields()
    .map((f) => f.getName())
    .find((n) => n === prefijo || n.startsWith(`${prefijo}_`));
  if (!nombre) return { texto: "", tam: 0 };
  const widget = form.getTextField(nombre).acroField.getWidgets()[0];
  const ref = widget.getNormalAppearance();
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const stream = doc.context.lookup(ref as any) as any;
  if (!stream?.getContents) return { texto: "", tam: 0 };
  const crudo: Buffer = Buffer.from(stream.getContents());
  const filtro = String(stream.dict?.get(PDFName.of("Filter")) ?? "");
  const contenido = (
    filtro.includes("FlateDecode") ? inflateSync(crudo) : crudo
  ).toString("latin1");

  // El texto va en grupos hexadecimales: <75 6c 74 ...> Tj
  const texto = [...contenido.matchAll(/<([0-9A-Fa-f\s]+)>\s*Tj/g)]
    .map(([, hex]) =>
      (hex.replace(/\s/g, "").match(/../g) ?? [])
        .map((par) => String.fromCharCode(parseInt(par, 16)))
        .join(""),
    )
    .join(" ");
  const tam = Number(/\/[^\s]+\s+([\d.]+)\s+Tf/.exec(contenido)?.[1] ?? 0);
  return { texto, tam };
}

titulo("6. En la tarjeta generada, la observación está dibujada entera");
{
  const bytes = await buildPublisherCard(
    publisher,
    [informe(8, LA_DEL_INFORME), informe(7, CORTA)],
    SERVICIO,
  );
  if (process.env.GUARDAR) {
    writeFileSync(process.env.GUARDAR, bytes);
    console.log(`  (PDF guardado en ${process.env.GUARDAR})`);
  }
  const doc = await PDFDocument.load(bytes);

  const agosto = dibujado(doc, `905_${filaDe(8)}`);
  check(
    agosto.texto === LA_DEL_INFORME,
    `agosto dibuja la observación entera ("${agosto.texto}")`,
  );
  check(
    agosto.tam > 0 && agosto.tam < 13,
    `con la letra encogida (${agosto.tam} puntos)`,
  );

  const julio = dibujado(doc, `905_${filaDe(7)}`);
  check(julio.texto === CORTA, "y la corta de julio, igual que siempre");
  check(julio.tam === 13, `con la letra del formulario (${julio.tam})`);

  check(doc.getPageCount() === 1, "la tarjeta sigue siendo de una sola hoja");

  // Lo de siempre tiene que seguir en su sitio.
  const form = doc.getForm();
  const val = (p: string) => {
    const n = form
      .getFields()
      .map((f) => f.getName())
      .find((x) => x === p || x.startsWith(`${p}_`));
    return n ? (form.getTextField(n).getText() ?? "") : "";
  };
  check(val("900_1") === "PRUEBA DE NOTAS", "el nombre sigue arriba");
  check(val("900_13") === String(SERVICIO), "y el año de servicio");
  check(val("904_32") === "36", `el total de horas suma bien (${val("904_32")})`);
}

titulo("7. Lo que no cabe se guarda en una hoja al final");
{
  const bytes = await buildPublisherCard(
    publisher,
    [informe(8, LARGUISIMA)],
    SERVICIO,
  );
  const doc = await PDFDocument.load(bytes);
  check(doc.getPageCount() === 2, `se añade una hoja (${doc.getPageCount()})`);

  // Se lee la hoja añadida para comprobar que el texto está completo.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const leido = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
  }).promise;
  const hoja = await leido.getPage(2);
  const contenido = await leido
    .getPage(2)
    .then(() => hoja.getTextContent());
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const texto = (contenido.items as any[])
    .map((i) => String(i.str ?? ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  check(
    texto.includes("Observaciones de los informes"),
    "la hoja lleva su título",
  );
  check(texto.includes("Agosto de 2027"), "y dice de qué mes es");
  check(
    texto.includes(LARGUISIMA.slice(0, 120)),
    "con la observación completa, sin recortar",
  );
  check(
    texto.includes(LARGUISIMA.slice(-60)),
    "incluido el final del texto",
  );
}

console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
