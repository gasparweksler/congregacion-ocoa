// ============================================================================
//  Reconstrucción de LÍNEAS DE TEXTO a partir de los fragmentos de un PDF.
//
//  Un PDF no guarda párrafos: guarda trozos de texto con una posición. En las
//  publicaciones de la Guía de actividades esos trozos son casi letras
//  sueltas, los espacios no existen (se deducen de la distancia) y las tildes
//  se dibujan APARTE, en una línea propia unos puntos más arriba. Si se lee
//  el texto tal cual sale, "Canción" llega como "C anci o n" con una "´"
//  perdida en otro renglón.
//
//  Este módulo es puro (no sabe nada de la Guía ni de reuniones) y resuelve
//  cuatro cosas, en este orden:
//
//   1. TILDES. Cada acento se pega a la letra que tiene justo debajo.
//   2. ESPACIOS. Se insertan donde la distancia entre dos trozos es mayor que
//      la que hay entre letras de una misma palabra.
//   3. COLUMNAS. La página tiene dos columnas: se busca el pasillo vacío y se
//      separa lo de la izquierda de lo de la derecha.
//   4. ORDEN DE LECTURA. Primero la columna izquierda y después la derecha,
//      igual que se lee en papel; y lo que cruza el pasillo (un título a todo
//      el ancho) separa los bloques, en vez de colarse en medio de una
//      columna.
// ============================================================================

export type Fragmento = {
  text: string;
  /** Borde izquierdo. */
  x: number;
  /** Línea base: cuanto MAYOR, más arriba en la página. */
  y: number;
  width: number;
  /** Alto de la letra ≈ cuerpo de la fuente. Puede no venir. */
  height?: number;
  /** Nombre interno de la fuente ("g_d0_f3"): distingue negrita de redonda. */
  font?: string;
  page: number;
};

export type Linea = {
  page: number;
  /** 0 = izquierda, 1 = derecha, -1 = ocupa todo el ancho (cruza el pasillo). */
  col: number;
  y: number;
  /** Borde izquierdo del primer trozo. */
  x: number;
  texto: string;
  /** Cuerpo aproximado de la fuente dominante, en puntos. */
  alto: number;
  /** Fuentes que aparecen en la línea, de la más usada a la menos. */
  fuentes: string[];
};

// ---------------------------------------------------------------------------
//  1. Tildes
// ---------------------------------------------------------------------------

/**
 * Acento suelto -> letra acentuada.
 *
 * Son los signos que las publicaciones dibujan por separado. La "ı" es la i
 * sin punto: el PDF la usa precisamente porque le va a poner la tilde encima.
 */
const ACENTOS: Record<string, Record<string, string>> = {
  "´": {
    a: "á", e: "é", i: "í", o: "ó", u: "ú", ı: "í", n: "ń", c: "ć", s: "ś",
    A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú", N: "Ń", C: "Ć",
  },
  "`": {
    a: "à", e: "è", i: "ì", o: "ò", u: "ù", ı: "ì",
    A: "À", E: "È", I: "Ì", O: "Ò", U: "Ù",
  },
  "˜": { n: "ñ", a: "ã", o: "õ", N: "Ñ", A: "Ã", O: "Õ" },
  "¨": {
    a: "ä", e: "ë", i: "ï", o: "ö", u: "ü", ı: "ï",
    A: "Ä", E: "Ë", I: "Ï", O: "Ö", U: "Ü",
  },
  "ˆ": {
    a: "â", e: "ê", i: "î", o: "ô", u: "û", ı: "î",
    A: "Â", E: "Ê", I: "Î", O: "Ô", U: "Û",
  },
  "ˇ": { c: "č", s: "š", z: "ž", C: "Č", S: "Š", Z: "Ž" },
  "¸": { c: "ç", C: "Ç" },
};

/** ¿Este trozo es solo un acento esperando su letra? */
function esAcento(t: string): boolean {
  return t.length === 1 && t in ACENTOS;
}

/**
 * Pega cada acento a su letra y devuelve los fragmentos ya legibles.
 *
 * El acento se dibuja en su propia línea base, entre 1 y 9 puntos por encima
 * de la letra, y horizontalmente DENTRO de ella (el PDF la emite como trozo
 * aparte justo por eso). Se elige la letra más cercana que admita ese acento;
 * si no hay ninguna, el acento se descarta en vez de quedar como basura: pasa
 * con el símbolo de copyright del pie de página, que viene como "˘".
 */
export function componerTildes(frags: Fragmento[]): Fragmento[] {
  const acentos: Fragmento[] = [];
  const base: Fragmento[] = [];
  for (const f of frags) (esAcento(f.text) ? acentos : base).push(f);
  if (acentos.length === 0) return base;

  // El acento modifica UNA letra, así que solo interesan los trozos de una
  // letra (y, por si acaso, el último carácter de uno más largo).
  const porPagina = new Map<number, Fragmento[]>();
  for (const f of base) {
    const l = porPagina.get(f.page);
    if (l) l.push(f);
    else porPagina.set(f.page, [f]);
  }

  const cambios = new Map<Fragmento, string>();
  for (const a of acentos) {
    const mapa = ACENTOS[a.text];
    const centro = a.x + a.width / 2;
    let mejor: Fragmento | null = null;
    let mejorDist = Infinity;
    for (const f of porPagina.get(a.page) ?? []) {
      const dy = a.y - f.y;
      if (dy < 0.5 || dy > 9) continue; // el acento va ENCIMA, y pegado
      const letra = cambios.get(f) ?? f.text;
      if (letra.length !== 1) continue;
      if (!(letra in mapa)) continue;
      // Horizontalmente, dentro de la letra (con un punto de margen).
      if (centro < f.x - 1 || centro > f.x + Math.max(f.width, 1) + 1) continue;
      const dist = dy + Math.abs(centro - (f.x + f.width / 2));
      if (dist < mejorDist) {
        mejorDist = dist;
        mejor = f;
      }
    }
    if (mejor) cambios.set(mejor, mapa[cambios.get(mejor) ?? mejor.text]);
  }

  return base.map((f) => {
    const nuevo = cambios.get(f);
    return nuevo ? { ...f, text: nuevo } : f;
  });
}

// ---------------------------------------------------------------------------
//  2 y 3. Líneas, espacios y columnas
// ---------------------------------------------------------------------------

/**
 * Hueco horizontal a partir del cual dos trozos son palabras distintas.
 *
 * Medido sobre las publicaciones reales: entre letras de una palabra el hueco
 * va de -1 a 1 punto, y entre palabras pasa de 2,3. Se escala un poco con el
 * cuerpo de la letra para que los títulos grandes (cuerpo 20) no se queden sin
 * espacios.
 */
function huecoDeEspacio(alto: number): number {
  return Math.max(1.1, alto * 0.12);
}

/** Une los trozos de un segmento en texto, metiendo los espacios que faltan. */
function textoDe(frags: Fragmento[]): string {
  let out = "";
  let finAnterior: number | null = null;
  for (const f of frags) {
    if (finAnterior !== null) {
      const hueco = f.x - finAnterior;
      if (hueco > huecoDeEspacio(f.height ?? 9)) out += " ";
    }
    out += f.text;
    finAnterior = f.x + f.width;
  }
  // La "ı" que se quedó sin tilde es una i normal; y se normaliza para que
  // "ó" compuesta y "ó" de un solo carácter sean la misma cadena.
  return out.replace(/ı/g, "i").normalize("NFC").replace(/\s+/g, " ").trim();
}

type Segmento = {
  page: number;
  y: number;
  x: number;
  fin: number;
  frags: Fragmento[];
};

/**
 * Agrupa los fragmentos en renglones y parte cada renglón allí donde hay un
 * hueco grande: así "TESOROS" (izquierda) y "SEAMOS" (derecha), que comparten
 * renglón, no acaban en la misma frase.
 */
function segmentosDe(frags: Fragmento[], tolY = 1.6, huecoCol = 14): Segmento[] {
  const orden = [...frags]
    .filter((f) => f.text.trim() !== "")
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);

  const renglones: Fragmento[][] = [];
  for (const f of orden) {
    const ult = renglones[renglones.length - 1];
    if (ult && ult[0].page === f.page && Math.abs(ult[0].y - f.y) <= tolY) {
      ult.push(f);
    } else {
      renglones.push([f]);
    }
  }

  const out: Segmento[] = [];
  for (const r of renglones) {
    r.sort((a, b) => a.x - b.x);
    let actual: Fragmento[] = [];
    let fin = -Infinity;
    const cerrar = () => {
      if (actual.length === 0) return;
      out.push({
        page: actual[0].page,
        y: Math.max(...actual.map((f) => f.y)),
        x: actual[0].x,
        fin: Math.max(...actual.map((f) => f.x + f.width)),
        frags: actual,
      });
      actual = [];
    };
    for (const f of r) {
      if (actual.length > 0 && f.x - fin > huecoCol) cerrar();
      actual.push(f);
      fin = Math.max(fin, f.x + f.width);
    }
    cerrar();
  }
  return out;
}

/**
 * Busca el pasillo vertical que separa las dos columnas de una página.
 *
 * Se prueban las posiciones del tercio central y se elige la que menos
 * segmentos atraviesa. Solo se acepta como pasillo si lo cruzan muy pocos: en
 * una página de una sola columna, cualquier corte parte la mitad de las líneas
 * y entonces se devuelve `null` (sin columnas).
 */
function pasilloDe(segs: Segmento[]): number | null {
  if (segs.length < 6) return null;
  const izq = Math.min(...segs.map((s) => s.x));
  const der = Math.max(...segs.map((s) => s.fin));
  const ancho = der - izq;
  if (ancho < 160) return null;

  let mejor: number | null = null;
  let mejorCruces = Infinity;
  for (let x = izq + ancho * 0.3; x <= izq + ancho * 0.7; x += 2) {
    const cruces = segs.filter((s) => s.x < x && s.fin > x).length;
    if (cruces < mejorCruces) {
      mejorCruces = cruces;
      mejor = x;
    }
  }
  // Un pasillo de verdad lo cruzan como mucho un par de títulos a todo ancho.
  const tope = Math.max(2, Math.round(segs.length * 0.08));
  return mejor !== null && mejorCruces <= tope ? mejor : null;
}

/**
 * Devuelve las líneas del PDF en orden de lectura.
 *
 * El orden dentro de una página es: columna izquierda completa, luego columna
 * derecha. Lo que cruza el pasillo (un encabezado a todo el ancho) cierra el
 * bloque anterior y empieza uno nuevo, que es como se lee en papel.
 */
export function lineasDePdf(frags: Fragmento[]): Linea[] {
  const limpios = componerTildes(frags);
  const segs = segmentosDe(limpios);

  const porPagina = new Map<number, Segmento[]>();
  for (const s of segs) {
    const l = porPagina.get(s.page);
    if (l) l.push(s);
    else porPagina.set(s.page, [s]);
  }

  const out: Linea[] = [];
  for (const page of [...porPagina.keys()].sort((a, b) => a - b)) {
    const dePagina = porPagina.get(page)!;
    const pasillo = pasilloDe(dePagina);
    dePagina.sort((a, b) => b.y - a.y || a.x - b.x);

    const columna = (s: Segmento): number => {
      if (pasillo === null) return 0;
      if (s.x < pasillo && s.fin > pasillo) return -1; // a todo el ancho
      return s.x >= pasillo ? 1 : 0;
    };

    let izquierda: Segmento[] = [];
    let derecha: Segmento[] = [];
    const emitir = (s: Segmento, col: number) => {
      const alto = s.frags[0].height ?? 9;
      const cuenta = new Map<string, number>();
      for (const f of s.frags) {
        const k = f.font ?? "";
        if (k) cuenta.set(k, (cuenta.get(k) ?? 0) + f.text.length);
      }
      out.push({
        page: s.page,
        col,
        y: s.y,
        x: s.x,
        texto: textoDe(s.frags),
        alto,
        fuentes: [...cuenta.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([f]) => f),
      });
    };
    const vaciar = () => {
      for (const s of izquierda) emitir(s, 0);
      for (const s of derecha) emitir(s, 1);
      izquierda = [];
      derecha = [];
    };

    for (const s of dePagina) {
      const col = columna(s);
      if (col === -1) {
        vaciar();
        emitir(s, -1);
      } else if (col === 1) {
        derecha.push(s);
      } else {
        izquierda.push(s);
      }
    }
    vaciar();
  }

  return out.filter((l) => l.texto !== "");
}
