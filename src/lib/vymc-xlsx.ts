// ============================================================================
//  Generación de la PLANILLA EXCEL de Vida y Ministerio con los datos leídos
//  del PDF de la Guía de actividades.
//
//  No se dibuja una planilla nueva: se toma la de siempre
//  (src/assets/plantilla-vymc.xlsx) y se copia su formato bloque a bloque. De
//  ahí salen los tipos de letra, los colores, los bordes, las celdas
//  combinadas, los anchos de columna y los textos fijos ("Responsable",
//  "Auxiliar", "Lector:", "Oración final:"). Así la planilla generada se ve
//  igual que la que se descargaba en blanco, y la carga masiva la vuelve a
//  leer sin cambios.
//
//  Lo que sí cambia es el NÚMERO DE FILAS: la Guía trae cada mes un número
//  distinto de partes en cada sección, así que se añaden tantas filas como
//  haga falta repitiendo la fila modelo de esa sección.
//
//  La hoja generada se llama como el período ("Enero y Febrero 2027"): la
//  carga masiva saca el año del nombre de la hoja, de modo que no hay que
//  escribirlo a mano. Y se borra la hoja "Modelo" para que no se importen sus
//  semanas de ejemplo.
// ============================================================================

import type ExcelJS from "exceljs";
import type { GuiaLeida, GuiaSemana } from "@/lib/vymc-pdf";

/** Una celda de la fila modelo: su formato y el texto fijo que trae. */
type CeldaModelo = { col: number; estilo: unknown; texto: string };

type FilaModelo = {
  alto?: number;
  celdas: CeldaModelo[];
  /** Combinaciones de esta fila, como pares de columnas [desde, hasta]. */
  merges: [number, number][];
};

type Modelo = {
  /** Anchos de columna de la plantilla. */
  anchos: (number | undefined)[];
  semana: FilaModelo;
  intro: FilaModelo;
  seccion: FilaModelo;
  parte: FilaModelo;
  responsable: FilaModelo;
  auxiliar: FilaModelo;
  cancionVc: FilaModelo;
  parteVc: FilaModelo;
  estudio: FilaModelo;
  conclusion: FilaModelo;
  blanca: FilaModelo;
};

function texto(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text?: string }[] };
    if (typeof o.text === "string") return o.text;
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text ?? "").join("");
    if (o.result != null) return String(o.result);
  }
  return String(v);
}

const limpio = (s: string) => s.replace(/\s+/g, " ").trim();

/** Combinaciones de la plantilla, agrupadas por fila. */
function mergesPorFila(ws: ExcelJS.Worksheet): Map<number, [number, number][]> {
  const out = new Map<number, [number, number][]>();
  const modelo = ws as unknown as { model?: { merges?: string[] } };
  for (const m of modelo.model?.merges ?? []) {
    // "H18:I18" -> fila 18, columnas 8 a 9. Solo interesan las de una fila.
    const p = m.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!p || p[2] !== p[4]) continue;
    const col = (letras: string) =>
      [...letras].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0);
    const fila = Number(p[2]);
    const lista = out.get(fila) ?? [];
    lista.push([col(p[1]), col(p[3])]);
    out.set(fila, lista);
  }
  return out;
}

/** Lee una fila de la plantilla como modelo reutilizable. */
function filaModelo(
  ws: ExcelJS.Worksheet,
  fila: number,
  merges: Map<number, [number, number][]>,
  ultimaCol: number,
): FilaModelo {
  const propias = merges.get(fila) ?? [];
  // Las celdas "esclavas" de una combinación no se copian: basta la primera.
  const esclavas = new Set<number>();
  for (const [a, b] of propias) for (let c = a + 1; c <= b; c++) esclavas.add(c);

  const row = ws.getRow(fila);
  const celdas: CeldaModelo[] = [];
  for (let c = 1; c <= ultimaCol; c++) {
    if (esclavas.has(c)) continue;
    const cell = row.getCell(c);
    let t = "";
    try {
      t = limpio(texto(cell.value));
    } catch {
      t = "";
    }
    celdas.push({ col: c, estilo: cell.style, texto: t });
  }
  return { alto: row.height, celdas, merges: propias };
}

/**
 * Localiza en la plantilla la fila modelo de cada tipo de línea.
 *
 * Se busca por patrón dentro del PRIMER bloque de semana, no por número de
 * fila: si la plantilla cambia de orden o se le añaden filas, esto sigue
 * funcionando. Si alguna no aparece, se reutiliza la de una parte normal, que
 * es la que tiene el formato básico.
 */
export function modeloDePlantilla(wb: ExcelJS.Workbook): Modelo {
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("La plantilla no tiene hojas.");
  const merges = mergesPorFila(ws);
  const ultimaCol = Math.max(ws.columnCount, 9);

  const textoA = (r: number) => {
    try {
      return limpio(texto(ws.getRow(r).getCell(1).value));
    } catch {
      return "";
    }
  };
  const textoEn = (r: number, c: number) => {
    try {
      return limpio(texto(ws.getRow(r).getCell(c).value));
    } catch {
      return "";
    }
  };

  // Primer bloque: desde la primera fila "SEMANA…" hasta la siguiente.
  let inicio = 0;
  for (let r = 1; r <= ws.rowCount; r++) {
    if (/^SEMANA\b/i.test(textoA(r))) {
      inicio = r;
      break;
    }
  }
  if (!inicio) throw new Error('La plantilla no tiene ninguna fila "SEMANA…".');
  let fin = ws.rowCount;
  for (let r = inicio + 1; r <= ws.rowCount; r++) {
    if (/^SEMANA\b/i.test(textoA(r))) {
      fin = r - 1;
      break;
    }
  }

  const buscar = (pred: (r: number) => boolean): number | null => {
    for (let r = inicio; r <= fin; r++) if (pred(r)) return r;
    return null;
  };

  const esSeccion = (r: number) => /TESOROS DE LA BIBLIA/i.test(textoA(r));
  const esParteNum = (r: number) => /^\d+\.\s*$|^\d+\.\s/.test(textoA(r));
  const filaSeccion = buscar(esSeccion);
  // Partes de Tesoros: filas numeradas ANTES de "Seamos mejores maestros".
  const filaSmm = buscar((r) => /SEAMOS MEJORES MAESTROS/i.test(textoA(r)));
  const filaVc = buscar((r) => /NUESTRA VIDA CRISTIANA/i.test(textoA(r)));
  const filaParte = buscar(
    (r) => esParteNum(r) && (filaSmm === null || r < filaSmm),
  );
  const filaResp = buscar((r) => esParteNum(r) && /^Responsable$/i.test(textoEn(r, 7)));
  const filaAux = buscar((r) => !textoA(r) && /^Auxiliar$/i.test(textoEn(r, 7)));
  const filaCancionVc = buscar(
    (r) => filaVc !== null && r > filaVc && /canci[oó]n/i.test(textoA(r)),
  );
  const filaEstudio = buscar((r) => /estudio b[ií]blico/i.test(textoA(r)));
  const filaParteVc = buscar(
    (r) =>
      filaVc !== null &&
      r > filaVc &&
      esParteNum(r) &&
      (filaEstudio === null || r < filaEstudio),
  );
  const filaConclusion = buscar((r) => /palabras de conclusi/i.test(textoA(r)));
  const filaIntro = buscar(
    (r) => /canci[oó]n/i.test(textoA(r)) && (filaSeccion === null || r < filaSeccion),
  );
  const filaBlanca = buscar((r) => r > (filaConclusion ?? inicio) && !textoA(r));

  const mod = (r: number | null, respaldo: number) =>
    filaModelo(ws, r ?? respaldo, merges, ultimaCol);
  const base = filaParte ?? inicio + 3;

  return {
    anchos: Array.from({ length: ultimaCol }, (_, i) => ws.getColumn(i + 1).width),
    semana: mod(inicio, inicio),
    intro: mod(filaIntro, base),
    seccion: mod(filaSeccion, base),
    parte: mod(filaParte, base),
    responsable: mod(filaResp, base),
    auxiliar: mod(filaAux, base),
    cancionVc: mod(filaCancionVc, base),
    parteVc: mod(filaParteVc, base),
    estudio: mod(filaEstudio, base),
    conclusion: mod(filaConclusion, base),
    blanca: mod(filaBlanca, base),
  };
}

// ---------------------------------------------------------------------------
//  Escritura
// ---------------------------------------------------------------------------

/** Columna de notas: lo que la Guía dice y la planilla no tiene dónde poner. */
const COL_NOTA = 10;

type Valores = Record<number, string>;

function escribirFila(
  ws: ExcelJS.Worksheet,
  fila: number,
  modelo: FilaModelo,
  valores: Valores = {},
  nota = "",
): void {
  const row = ws.getRow(fila);
  if (modelo.alto) row.height = modelo.alto;
  for (const c of modelo.celdas) {
    const cell = row.getCell(c.col);
    cell.style = c.estilo as ExcelJS.Style;
    const nuevo = valores[c.col];
    const v = nuevo !== undefined ? nuevo : c.texto;
    cell.value = v === "" ? null : v;
  }
  if (nota) row.getCell(COL_NOTA).value = nota;
  for (const [a, b] of modelo.merges) {
    try {
      ws.mergeCells(fila, a, fila, b);
    } catch {
      /* ya combinada: no importa */
    }
  }
}

/**
 * Sustituye el número de canción dentro de un texto de la plantilla.
 *
 * La plantilla trae "● Canción: xx" o "● Canción 49": en los dos casos se
 * cambia lo que haya por el número de esta semana, y si la Guía no lo trajo se
 * deja el hueco ("xx") en vez de inventarlo.
 */
function conCancion(plantilla: string, numero: string): string {
  const base = plantilla || "● Canción:";
  const valor = numero || "xx";
  if (/canci[oó]n/i.test(base)) {
    return base.replace(
      /(canci[oó]n\s*[:·-]?\s*)(\d{1,3}|xx)?/i,
      (_m, p1: string) => `${p1}${valor}`,
    );
  }
  return `● Canción ${valor}`;
}

/**
 * Título tal como va en la planilla: con su número delante.
 *
 * La Guía numera las partes de corrido y la planilla también, así que se
 * respeta el número de la Guía en vez de volver a contarlas. La carga masiva
 * reconoce una parte justamente por ese "N." inicial.
 */
export function tituloConNumero(p: { numero: number; titulo: string }): string {
  return `${p.numero}. ${p.titulo}`.replace(/\s+/g, " ").trim();
}

/** Nota de una parte: su tipo y quién la presenta, si la Guía lo dice. */
function notaDeParte(p: {
  tipo: string;
  aCargoDe: string;
  duracion: string;
}): string {
  const trozos = [p.tipo, p.aCargoDe ? `a cargo del ${p.aCargoDe}` : ""].filter(
    Boolean,
  );
  return trozos.join(" · ");
}

/** Nombre de hoja válido para Excel (31 caracteres y sin : \\ / ? * [ ]). */
function nombreHoja(base: string, anio: number, anioPortada: number): string {
  // Si la guía arranca en diciembre del año anterior, se escriben los dos
  // ("Enero y Febrero 2026-2027"): el primero es el que lee la carga masiva y
  // el segundo evita que el nombre parezca equivocado al abrirlo.
  const cola = anioPortada > anio ? ` ${anio}-${anioPortada}` : ` ${anio}`;
  const limpio2 = base.replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim();
  // El año se recorta el ÚLTIMO: es lo que lee la carga masiva, así que un
  // título largo (tres meses) no puede dejarlo fuera.
  return (limpio2 || "Programa").slice(0, 31 - cola.length).trim() + cola;
}

/**
 * Año con el que se nombra la hoja: el de la PRIMERA semana, no el de la
 * portada.
 *
 * La carga masiva toma ese año como punto de partida y va sumando uno cada vez
 * que el mes retrocede (de diciembre a enero). Una guía de "enero y febrero de
 * 2027" que empieza con la semana del 29 de diciembre tiene que arrancar en
 * 2026 para que ese recuento salga bien; con 2027 se iría un año entero.
 */
function anioDeLaPrimeraSemana(guia: GuiaLeida): number {
  const iso = guia.semanas.find((s) => /^\d{4}-/.test(s.inicioISO))?.inicioISO;
  return iso ? Number(iso.slice(0, 4)) : guia.anio;
}

/**
 * Escribe las semanas de la Guía en una hoja nueva del libro de la plantilla.
 *
 * Devuelve el nombre de la hoja creada. Se borran las demás hojas (las de
 * ejemplo) para que la carga masiva no importe semanas que no son de esta
 * guía.
 */
export function escribirGuiaEnPlantilla(
  wb: ExcelJS.Workbook,
  guia: GuiaLeida,
): string {
  const modelo = modeloDePlantilla(wb);
  const viejas = [...wb.worksheets];

  // El nombre de la hoja lleva el año: la carga masiva lo lee de ahí.
  const nombre = nombreHoja(
    guia.titulo.replace(/\s+de\s+\d{4}$/i, ""),
    anioDeLaPrimeraSemana(guia),
    guia.anio,
  );
  const ws = wb.addWorksheet(nombre);
  modelo.anchos.forEach((w, i) => {
    if (w) ws.getColumn(i + 1).width = w;
  });
  ws.getColumn(COL_NOTA).width = 38;

  let fila = 1;
  // Fila de título: deja claro de qué guía salió y qué es la columna J.
  ws.getRow(fila).getCell(1).value = `VIDA Y MINISTERIO CRISTIANOS · ${guia.titulo.toUpperCase()}`;
  ws.getRow(fila).getCell(1).font = { bold: true, size: 12 };
  ws.getRow(fila).getCell(COL_NOTA).value =
    "Notas de la Guía (informativas: no se importan)";
  ws.getRow(fila).getCell(COL_NOTA).font = { italic: true, size: 9 };
  fila += 2;

  for (const s of guia.semanas) {
    fila = escribirSemana(ws, fila, modelo, s);
  }

  for (const v of viejas) wb.removeWorksheet(v.id);
  return nombre;
}

function escribirSemana(
  ws: ExcelJS.Worksheet,
  desde: number,
  modelo: Modelo,
  s: GuiaSemana,
): number {
  let fila = desde;

  // --- Encabezado de la semana ---
  // El texto se escribe como lo entiende la carga masiva: "SEMANA 4-10 DE
  // ENERO" o "SEMANA 29 DE DICIEMBRE A 4 DE ENERO".
  const celdaLectura =
    modelo.semana.celdas.find((c) => /lectura semanal/i.test(c.texto))?.col ?? 7;
  escribirFila(
    ws,
    fila++,
    modelo.semana,
    {
      1: `SEMANA ${s.etiqueta.toLocaleUpperCase("es")}`,
      [celdaLectura + 1]: s.lectura,
    },
    s.nota,
  );

  // --- Canción de inicio, oración y palabras de introducción ---
  const colCancion =
    modelo.intro.celdas.find((c) => /canci[oó]n/i.test(c.texto))?.col ?? 1;
  escribirFila(ws, fila++, modelo.intro, {
    [colCancion]: conCancion(
      modelo.intro.celdas.find((c) => c.col === colCancion)?.texto ?? "",
      s.cancionInicio,
    ),
  });

  const porSeccion = (sec: string) => s.partes.filter((p) => p.seccion === sec);
  const tituloSeccion = (c: CeldaModelo[], t: string): Valores => ({
    [c[0]?.col ?? 1]: t,
  });

  // --- Tesoros de la Biblia ---
  escribirFila(
    ws,
    fila++,
    modelo.seccion,
    tituloSeccion(modelo.seccion.celdas, "TESOROS DE LA BIBLIA"),
  );
  for (const p of porSeccion("TESOROS")) {
    escribirFila(ws, fila++, modelo.parte, { 1: tituloConNumero(p) }, notaDeParte(p));
  }

  // --- Seamos mejores maestros (cada parte, con Responsable y Auxiliar) ---
  escribirFila(
    ws,
    fila++,
    modelo.seccion,
    tituloSeccion(modelo.seccion.celdas, "SEAMOS MEJORES MAESTROS"),
  );
  for (const p of porSeccion("SMM")) {
    escribirFila(ws, fila++, modelo.responsable, { 1: tituloConNumero(p) }, notaDeParte(p));
    escribirFila(ws, fila++, modelo.auxiliar, { 1: "" });
  }

  // --- Nuestra vida cristiana ---
  escribirFila(
    ws,
    fila++,
    modelo.seccion,
    tituloSeccion(modelo.seccion.celdas, "NUESTRA VIDA CRISTIANA"),
  );
  const colCancionVc =
    modelo.cancionVc.celdas.find((c) => /canci[oó]n/i.test(c.texto))?.col ?? 1;
  escribirFila(ws, fila++, modelo.cancionVc, {
    [colCancionVc]: conCancion(
      modelo.cancionVc.celdas.find((c) => c.col === colCancionVc)?.texto ?? "",
      s.cancionIntermedia,
    ),
  });
  for (const p of porSeccion("VC")) {
    // El estudio bíblico de la congregación tiene su propia fila (conductor y
    // lector); el resto son partes normales.
    const esEstudio = /estudio b[ií]blico/i.test(p.titulo);
    escribirFila(
      ws,
      fila++,
      esEstudio ? modelo.estudio : modelo.parteVc,
      { 1: tituloConNumero(p) },
      notaDeParte(p),
    );
  }

  // --- Palabras de conclusión y canción final ---
  const colCancionFin =
    modelo.conclusion.celdas.find((c) => /canci[oó]n/i.test(c.texto))?.col ?? 6;
  escribirFila(ws, fila++, modelo.conclusion, {
    [colCancionFin]: conCancion(
      modelo.conclusion.celdas.find((c) => c.col === colCancionFin)?.texto ?? "",
      s.cancionFinal,
    ),
  });

  escribirFila(ws, fila++, modelo.blanca);
  return fila;
}
