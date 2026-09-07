// ============================================================================
//  Lectura del PDF de "Todas las Responsabilidades del mes".
//
//  Estrategia: NO se busca texto suelto. Se reconstruye la TABLA a partir de la
//  posición (x, y) de cada fragmento de texto del PDF:
//    1. Los fragmentos se agrupan en líneas por su coordenada Y.
//    2. Se detectan las bandas de encabezado (AUDIO, VIDEO, MICROFONO,
//       PLATAFORMA, ENTRADA, AUDITORIO, LIMPIEZA) y se guarda el centro X de
//       cada columna -> así se sabe a qué responsabilidad pertenece cada celda.
//    3. Cada fila de datos se reconoce por su primera celda ("Jueves 4",
//       "Sábado 6", "Jue 4", "4"...). El resto de fragmentos se asigna a la
//       columna cuyo centro X esté más cerca.
//    4. "Limpieza por Grupos" suele venir en celdas combinadas (rowSpan). El
//       texto queda centrado verticalmente sobre varias filas, así que los
//       grupos se reparten de forma secuencial resolviendo dónde termina cada
//       bloque (ver `spreadMergedColumn`).
//
//  Esto lo hace tolerante a espacios, saltos de línea, columnas movidas y
//  encabezados repartidos en dos renglones ("ACOMODADOR" / "ENTRADA").
//  Este módulo es puro (sin acceso a red ni a la base de datos) para poder
//  probarlo de forma aislada.
// ============================================================================

export type PdfItem = {
  text: string;
  x: number; // borde izquierdo
  y: number; // línea base (mayor = más arriba en la página)
  width: number;
  page: number;
};

export type ParsedRespRow = {
  dateISO: string; // YYYY-MM-DD
  day: "JUEVES" | "SABADO";
  values: Record<string, string>; // slotKey -> nombre/grupo
};

export type ParseRespResult = {
  rows: ParsedRespRow[];
  /** Fechas leídas en el PDF que no corresponden a una reunión del mes. */
  ignoredDates: string[];
  warnings: string[];
};

// ---------------------------------------------------------------------------
//  Utilidades de texto
// ---------------------------------------------------------------------------

/** Mayúsculas sin acentos ni espacios repetidos, para comparar encabezados. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Limpia un nombre leído del PDF (espacios, guiones sueltos, viñetas). */
function cleanName(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/^[•●▪◦·\-–—]+\s*/, "")
    .trim();
}

// Palabra distintiva de cada columna -> responsabilidad. Se usan solo palabras
// que no se repiten entre columnas ("ACOMODADOR" sola es ambigua y se ignora).
const COLUMN_KEYWORDS: { word: string; slotKey: string }[] = [
  { word: "AUDIO", slotKey: "r_audio" },
  { word: "VIDEO", slotKey: "r_video" },
  { word: "MICROFONO", slotKey: "r_microfono" },
  { word: "PLATAFORMA", slotKey: "r_acom_plataforma" },
  { word: "ENTRADA", slotKey: "r_acom_entrada" },
  { word: "AUDITORIO", slotKey: "r_acom_auditorio" },
  { word: "LIMPIEZA", slotKey: "r_limpieza" },
];

/** Renglón de período dentro del encabezado: "SEPTIEMBRE 2026", "2026". */
const PERIOD_RE =
  /^(?:ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)?\s*\d{4}$/;

function keywordOf(text: string): string | null {
  const t = norm(text);
  for (const k of COLUMN_KEYWORDS) if (t.includes(k.word)) return k.slotKey;
  return null;
}

const DATE_RE =
  /^(?:(JUEVES|JUEV|JUE|SABADO|SAB)\.?\s*)?(\d{1,2})(?:\s*[/-]\s*\d{1,2})?$/;

/** Interpreta la primera celda de una fila: "Jueves 4", "Sáb 6", "4"… */
function parseDateCell(text: string): { day?: "JUEVES" | "SABADO"; dayNum: number } | null {
  const m = DATE_RE.exec(norm(text));
  if (!m) return null;
  const dayNum = Number(m[2]);
  if (!dayNum || dayNum < 1 || dayNum > 31) return null;
  const w = m[1];
  const day = !w ? undefined : w.startsWith("J") ? "JUEVES" : "SABADO";
  return { day, dayNum };
}

// ---------------------------------------------------------------------------
//  Agrupación en líneas
// ---------------------------------------------------------------------------

type Line = { page: number; y: number; items: PdfItem[] };

/** Agrupa los fragmentos en líneas por coordenada Y (tolerancia en puntos). */
function toLines(items: PdfItem[], tolerance = 3.5): Line[] {
  const lines: Line[] = [];
  const sorted = [...items]
    .filter((i) => i.text.trim() !== "")
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);

  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && last.page === it.page && Math.abs(last.y - it.y) <= tolerance) {
      last.items.push(it);
    } else {
      lines.push({ page: it.page, y: it.y, items: [it] });
    }
  }
  for (const l of lines) l.items.sort((a, b) => a.x - b.x);
  return lines;
}

const centerX = (i: PdfItem) => i.x + i.width / 2;

// ---------------------------------------------------------------------------
//  Detección de tablas
// ---------------------------------------------------------------------------

type Column = { slotKey: string; x: number };
type Table = { page: number; columns: Column[]; fromY: number; toY: number };

/**
 * Localiza las tablas del PDF. Una tabla empieza donde aparece una banda de
 * encabezado (dos o más columnas conocidas en la misma línea o en líneas
 * consecutivas) y termina donde empieza la siguiente banda o la página.
 */
function findTables(lines: Line[]): Table[] {
  type Band = { page: number; topY: number; bottomY: number; cols: Column[] };
  const bands: Band[] = [];

  // Los encabezados se reparten en varios renglones muy juntos:
  //   "ACOMODADOR   ACOMODADOR"      (sin palabra distintiva)
  //   "DIA/MES              LIMPIEZA POR GRUPOS"
  //   "ENTRADA      AUDITORIO"
  // Por eso NO se exige que un renglón traiga dos columnas: se agrupan todos
  // los renglones con palabras de columna que estén muy cerca en vertical, y
  // recién la banda completa debe reunir dos o más columnas.
  for (const line of lines) {
    const hits: Column[] = [];
    for (const it of line.items) {
      // Los títulos ("ASIGNACIONES PARA LAS REUNIONES AUDIO Y VIDEO") también
      // contienen palabras de columna: se descartan por su longitud.
      if (norm(it.text).length > 24) continue;
      const slotKey = keywordOf(it.text);
      if (slotKey) hits.push({ slotKey, x: centerX(it) });
    }
    if (hits.length === 0) continue;

    const prev = bands[bands.length - 1];
    const continues =
      prev && prev.page === line.page && prev.bottomY - line.y <= 22;

    if (continues) {
      prev.bottomY = line.y;
      for (const h of hits) {
        // Mismo encabezado partido en dos renglones: se conserva una columna.
        const same = prev.cols.find(
          (c) => c.slotKey === h.slotKey && Math.abs(c.x - h.x) < 40,
        );
        if (same) same.x = (same.x + h.x) / 2;
        else prev.cols.push(h);
      }
    } else {
      bands.push({ page: line.page, topY: line.y, bottomY: line.y, cols: hits });
    }
  }

  // El encabezado suele traer un renglón extra con el período ("SEPTIEMBRE
  // 2026"), sin palabras de columna. Se absorbe en la banda para que no se
  // confunda con una fila de datos.
  for (const b of bands) {
    for (;;) {
      const next = lines.find(
        (l) =>
          l.page === b.page &&
          l.y < b.bottomY &&
          b.bottomY - l.y <= 26 &&
          l.items.length === 1 &&
          PERIOD_RE.test(norm(l.items[0].text)),
      );
      if (!next) break;
      b.bottomY = next.y;
    }
  }

  // Una tabla real reúne al menos dos columnas conocidas.
  const real = bands.filter(
    (b) => new Set(b.cols.map((c) => c.slotKey)).size >= 2,
  );

  return real.map((b, i) => {
    const next = real[i + 1];
    const sameePage = next && next.page === b.page;
    return {
      page: b.page,
      columns: b.cols.sort((a, c) => a.x - c.x),
      // Las filas de datos empiezan bajo el encabezado (y menor).
      fromY: b.bottomY - 2,
      toY: sameePage ? next!.topY : -Infinity,
    };
  });
}

// ---------------------------------------------------------------------------
//  Celdas combinadas (rowSpan) — columna de Limpieza
// ---------------------------------------------------------------------------

/**
 * Reparte valores de una columna con celdas combinadas entre las filas.
 * El texto de una celda combinada se dibuja centrado verticalmente sobre su
 * bloque, así que no coincide con ninguna fila. Se resuelve en orden: el bloque
 * de cada valor empieza donde terminó el anterior y termina en la fila que hace
 * que el centro del bloque quede lo más cerca posible de la Y del texto.
 */
function spreadMergedColumn(
  rowYs: number[],
  values: { y: number; text: string }[],
): string[] {
  const out = new Array<string>(rowYs.length).fill("");
  if (values.length === 0) return out;
  const vals = [...values].sort((a, b) => b.y - a.y); // de arriba hacia abajo

  let start = 0;
  for (let v = 0; v < vals.length; v++) {
    if (start >= rowYs.length) break;
    let end: number;
    if (v === vals.length - 1) {
      end = rowYs.length - 1;
    } else {
      // Buscar el final del bloque que deja su centro más cerca del texto.
      end = start;
      let best = Infinity;
      for (let e = start; e < rowYs.length; e++) {
        const center = (rowYs[start] + rowYs[e]) / 2;
        const d = Math.abs(center - vals[v].y);
        if (d < best) {
          best = d;
          end = e;
        }
      }
    }
    for (let i = start; i <= end && i < rowYs.length; i++) out[i] = vals[v].text;
    start = end + 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
//  Parser principal
// ---------------------------------------------------------------------------

/**
 * Convierte los fragmentos de texto del PDF en filas de responsabilidades para
 * el mes indicado. `validDates` son las fechas reales de reunión del mes
 * (las mismas que muestra la pantalla), y determinan qué se conserva.
 */
export function parseResponsibilitiesPdf(
  items: PdfItem[],
  validDates: { dateISO: string; day: "JUEVES" | "SABADO" }[],
): ParseRespResult {
  const warnings: string[] = [];
  const lines = toLines(items);
  const tables = findTables(lines);

  if (tables.length === 0) {
    return {
      rows: [],
      ignoredDates: [],
      warnings: [
        "No se reconocieron las columnas del PDF (Audio, Video, Micrófono, Plataforma, Acomodadores, Limpieza).",
      ],
    };
  }

  // dateISO -> valores acumulados de todas las tablas del PDF.
  const acc = new Map<string, Record<string, string>>();
  const ignored = new Set<string>();

  const byDayNum = new Map<string, { dateISO: string; day: "JUEVES" | "SABADO" }>();
  for (const d of validDates) {
    byDayNum.set(`${d.day}_${Number(d.dateISO.split("-")[2])}`, d);
    // También por número de día suelto, cuando el PDF no dice Jueves/Sábado.
    const k = `?_${Number(d.dateISO.split("-")[2])}`;
    if (!byDayNum.has(k)) byDayNum.set(k, d);
  }

  for (const table of tables) {
    const dateCol = table.columns.length ? table.columns[0].x : 0;
    const bodyLines = lines.filter(
      (l) => l.page === table.page && l.y < table.fromY && l.y > table.toY,
    );

    // --- Filas: la primera celda debe ser una fecha ---
    type Row = { y: number; dateISO: string; rest: PdfItem[] };
    const rows: Row[] = [];
    // Centro X de la columna de fecha (se aprende de las propias celdas leídas).
    let dateAnchorSum = 0;
    for (const line of bodyLines) {
      const first = line.items[0];
      if (!first) continue;
      const parsed = parseDateCell(first.text);
      // La celda de fecha debe estar a la izquierda de la primera columna.
      if (!parsed || centerX(first) > dateCol) continue;

      const match =
        (parsed.day ? byDayNum.get(`${parsed.day}_${parsed.dayNum}`) : null) ??
        byDayNum.get(`?_${parsed.dayNum}`);
      if (!match) {
        ignored.add(cleanName(first.text));
        continue;
      }
      dateAnchorSum += centerX(first);
      rows.push({ y: line.y, dateISO: match.dateISO, rest: line.items.slice(1) });
    }

    if (rows.length === 0) continue;

    // Pseudo-columna de fecha: el texto que cae ahí (p. ej. "Sábado" en un
    // renglón aparte cuando la fila es alta) se descarta, no se mete en Audio.
    const dateAnchor = dateAnchorSum / rows.length;
    const cols: Column[] = [{ slotKey: "", x: dateAnchor }, ...table.columns];
    const nearestColumn = (cx: number): Column | null => {
      let col: Column | null = null;
      let best = Infinity;
      for (const c of cols) {
        const d = Math.abs(c.x - cx);
        if (d < best) {
          best = d;
          col = c;
        }
      }
      return col && col.slotKey ? col : null;
    };

    // --- Celdas: cada fragmento va a la columna con el centro X más cercano ---
    for (const row of rows) {
      const values = acc.get(row.dateISO) ?? {};
      for (const it of row.rest) {
        const col = nearestColumn(centerX(it));
        if (!col) continue;
        const text = cleanName(it.text);
        if (!text) continue;
        // Se acumula por si una celda viene partida en varios fragmentos.
        values[col.slotKey] = values[col.slotKey]
          ? `${values[col.slotKey]} ${text}`
          : text;
      }
      acc.set(row.dateISO, values);
    }

    // --- Texto suelto: nombres largos partidos en dos renglones dentro de la
    // misma celda, y celdas combinadas de Limpieza (rowSpan). ---
    const limpiezaCol = table.columns.find((c) => c.slotKey === "r_limpieza");
    const rowYs = new Set(rows.map((r) => r.y));
    const looseLimpieza: { y: number; text: string }[] = [];
    // Altura típica de fila, para no absorber texto de fuera de la tabla.
    const rowGap =
      rows.length > 1
        ? Math.abs(rows[0].y - rows[1].y)
        : 24;

    for (const line of bodyLines) {
      if (rowYs.has(line.y)) continue;
      for (const it of line.items) {
        const text = cleanName(it.text);
        if (!text) continue;
        const col = nearestColumn(centerX(it));
        if (!col) continue;
        if (col.slotKey === "r_limpieza") {
          // Se resuelve aparte (puede ser una celda combinada).
          looseLimpieza.push({ y: line.y, text });
          continue;
        }
        // Continuación de una celda: se une a la fila más cercana.
        let row: Row | null = null;
        let bestY = Infinity;
        for (const r of rows) {
          const d = Math.abs(r.y - line.y);
          if (d < bestY) {
            bestY = d;
            row = r;
          }
        }
        if (!row || bestY > rowGap * 0.75) continue;
        const values = acc.get(row.dateISO) ?? {};
        // Respeta el orden vertical: lo de arriba va primero.
        values[col.slotKey] =
          line.y > row.y
            ? `${text} ${values[col.slotKey] ?? ""}`.trim()
            : `${values[col.slotKey] ?? ""} ${text}`.trim();
        acc.set(row.dateISO, values);
      }
    }

    if (limpiezaCol) {
      const loose = looseLimpieza;
      // Valores ya asignados a una fila + los sueltos, todos en orden vertical.
      const inline = rows
        .map((r) => ({ y: r.y, text: acc.get(r.dateISO)?.r_limpieza ?? "" }))
        .filter((v) => v.text);
      const all = [...inline, ...loose];
      if (all.length) {
        const spread = spreadMergedColumn(
          rows.map((r) => r.y),
          all,
        );
        rows.forEach((r, i) => {
          const values = acc.get(r.dateISO) ?? {};
          if (spread[i]) values.r_limpieza = spread[i];
          acc.set(r.dateISO, values);
        });
      }
    }
  }

  // --- "Pasa Micrófono": una sola columna con "Nombre1 / Nombre2" ---
  for (const values of acc.values()) {
    const mic = values.r_microfono;
    if (mic && mic.includes("/")) {
      const [a, b] = mic.split("/").map((s) => cleanName(s));
      values.r_microfono = a ?? "";
      if (b) values.r_microfono_2 = b;
    }
  }

  const rows: ParsedRespRow[] = validDates
    .filter((d) => acc.has(d.dateISO))
    .map((d) => ({
      dateISO: d.dateISO,
      day: d.day,
      values: acc.get(d.dateISO)!,
    }));

  if (rows.length === 0) {
    warnings.push(
      "Se reconocieron las columnas, pero ninguna fecha del PDF corresponde a una reunión de este mes. Revisa el mes seleccionado.",
    );
  }
  if (ignored.size) {
    warnings.push(
      `Se ignoraron fechas que no son reuniones de este mes: ${[...ignored].join(", ")}.`,
    );
  }

  return { rows, ignoredDates: [...ignored], warnings };
}
