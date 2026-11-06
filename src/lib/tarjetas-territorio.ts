// ============================================================================
//  Leer las TARJETAS DE TERRITORIO de un PDF.
//
//  Cada congregación imprime sus tarjetas con un programa distinto, así que
//  no hay un único formato. Este módulo reconoce los tres que se ven en la
//  práctica, y siempre saca lo mismo: número y nombre de cada territorio.
//
//   1. TARJETA OFICIAL (S-12): una tarjeta por página, con los rótulos
//      "TARJETA DEL MAPA DEL TERRITORIO", "Localidad" y "TERR. NÚM.".
//      Es la más fiable: no se adivina nada, se lee el campo que hay debajo
//      de cada rótulo.
//   2. CUADRÍCULA: varias tarjetas en la misma hoja (2x2, 3x3…), sin
//      rótulos. Aquí sí hay que deducir: el número es un texto que son solo
//      cifras y está escrito en grande, y el nombre es el texto grande que
//      tiene al lado, en el mismo renglón.
//   3. LISTA: un listado corrido, "1 - Camino al Túnel" por línea.
//
//  El módulo es PURO: recibe los fragmentos de texto del PDF (con su
//  posición) y devuelve datos. No sabe de pdfjs, ni del navegador, ni de la
//  base de datos, y por eso se puede probar con datos inventados.
//
//  Lo que NO hace: inventar. Si de una página no sale nada en claro, esa
//  página se queda fuera y se avisa, para que la persona lo corrija en
//  pantalla antes de crear nada.
// ============================================================================

import { lineasDePdf, type Fragmento, type Linea } from "@/lib/pdf-lines";

export type TarjetaLeida = {
  /** Página del PDF en la que estaba la tarjeta (empieza en 1). */
  pagina: number;
  /** Número del territorio, o null si la tarjeta no lo decía. */
  numero: number | null;
  /** Nombre del territorio, ya limpio. Puede venir vacío. */
  nombre: string;
};

export type FormatoTarjetas = "oficial" | "cuadricula" | "lista" | "ninguno";

export const FORMATO_LABELS: Record<FormatoTarjetas, string> = {
  oficial: "Tarjetas oficiales (una por página)",
  cuadricula: "Varias tarjetas por hoja",
  lista: "Lista escrita",
  ninguno: "No se reconoció ningún formato",
};

export type LecturaTarjetas = {
  formato: FormatoTarjetas;
  tarjetas: TarjetaLeida[];
  /** Páginas que tiene el PDF. */
  paginas: number;
  /**
   * Ninguna página trae dos tarjetas. Solo entonces tiene sentido guardar
   * cada página como el mapa de su territorio.
   */
  unaPorPagina: boolean;
  /** Cosas que conviene mirar antes de crear nada. */
  avisos: string[];
};

// ---------------------------------------------------------------------------
//  Utilidades de texto
// ---------------------------------------------------------------------------

/** Texto comparable: sin tildes, en minúsculas y con los espacios normales. */
function clave(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Rótulos y textos impresos que trae la tarjeta y que NUNCA son el nombre de
 * un territorio. Van anclados de principio a fin a propósito: un territorio
 * llamado "Calle Las Calles" no debe caer aquí.
 */
const RELLENO: RegExp[] = [
  /^tarjeta del (mapa del )?territorio$/,
  /^mapa del territorio$/,
  /^territory map card$/,
  /^localidad$/,
  /^ciudad$/,
  /^city$/,
  /^terr\.? ?num\.?$/,
  /^n[.ºo°]? ?de ?terr\.?$/,
  /^num\.? ?de ?terr\.?$/,
  /^numero de territorio$/,
  /^territory number$/,
  /^calles$/,
  /^streets$/,
  /^limites$/,
  /^limites del territorio$/,
  /^s-?1[23](-s)?$/,
  /^\d{1,4} ?\/ ?\d{1,4}$/,
  /^pagina \d+/,
  /^sirvase mantener/,
  /^archivos del territorio\.?$/,
  /^please keep this card/,
  /^fecha$/,
  /^fechas$/,
  /^fecha de /,
  /^publicador(es)?$/,
  /^asignado a$/,
  /^completado$/,
  /^terminado$/,
  /^nombre$/,
  /^numero$/,
  /^num\.?$/,
  /^congregacion/,
];

function esRelleno(texto: string): boolean {
  const k = clave(texto);
  if (k === "") return true;
  return RELLENO.some((r) => r.test(k));
}

/** Un texto que son solo cifras ("13", "N.º 13"). */
const SOLO_NUMERO = /^(?:n[.ºo°]?\s*)?(\d{1,4})$/;

/** "3 - Vista Hermosa", "3. Vista Hermosa", "3 Vista Hermosa". */
const NUMERO_Y_NOMBRE =
  /^(?:territorio\s*)?(?:n[.ºo°]?\s*)?(\d{1,4})\s*(?:[-–—.):]\s*|\s+)(.+)$/i;

function tieneLetras(t: string): boolean {
  return /\p{L}/u.test(t);
}

/** Deja el nombre presentable: sin espacios de más ni puntuación suelta. */
export function limpiarNombre(t: string): string {
  return t
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[·:;,\-–—]+/, "")
    .replace(/[·:;,\-–—]+$/, "")
    .trim()
    .slice(0, 120)
    .trim();
}

/**
 * Dónde acaba la línea. `lineasDePdf` lo entrega; si no viniera (líneas
 * construidas a mano en una prueba), se estima por el largo del texto.
 */
function finDe(l: Linea): number {
  return l.fin ?? l.x + l.texto.length * l.alto * 0.5;
}

// ---------------------------------------------------------------------------
//  1. Tarjeta oficial (S-12): se lee por rótulos, no se adivina
// ---------------------------------------------------------------------------

const CABECERA: RegExp[] = [
  /^tarjeta del (mapa del )?territorio$/,
  /^mapa del territorio$/,
  /^territory map card$/,
];

const ETIQUETA_NUMERO: RegExp[] = [
  /^terr\.? ?num\.?$/,
  /^n[.ºo°]? ?de ?terr\.?$/,
  /^num\.? ?de ?terr\.?$/,
  /^numero de territorio$/,
  /^territory number$/,
];

const ETIQUETA_LOCALIDAD: RegExp[] = [/^localidad$/, /^ciudad$/, /^city$/];

function coincide(l: Linea, lista: RegExp[]): boolean {
  const k = clave(l.texto);
  return lista.some((r) => r.test(k));
}

/**
 * Lee la tarjeta oficial de una página.
 *
 * El nombre es el texto que hay ENTRE la cabecera y el rótulo "Localidad"
 * (así está impresa la tarjeta), y el número es el que hay debajo de
 * "TERR. NÚM.". Leerlo por los rótulos y no por el tamaño de la letra evita
 * el error típico: el mapa dibujado lleva el nombre repetido en grande y a
 * veces con una errata, y aquí gana siempre lo que dice el encabezado.
 */
function tarjetaOficial(lineas: Linea[], pagina: number): TarjetaLeida | null {
  const cabeceras = lineas.filter((l) => coincide(l, CABECERA));
  // Dos cabeceras en la misma hoja = varias tarjetas por página: eso no es
  // el formato oficial de una por hoja, lo resuelve la cuadrícula.
  if (cabeceras.length !== 1) return null;
  const cab = cabeceras[0];

  const localidad = lineas.find(
    (l) => coincide(l, ETIQUETA_LOCALIDAD) && l.y < cab.y,
  );
  const suelo = localidad ? localidad.y : cab.y - 70;
  const candidatos = lineas
    .filter(
      (l) =>
        l.y < cab.y &&
        l.y > suelo &&
        !esRelleno(l.texto) &&
        !SOLO_NUMERO.test(clave(l.texto)) &&
        tieneLetras(l.texto),
    )
    // Letra más grande primero; a igualdad, el más pegado a la cabecera.
    .sort((a, b) => b.alto - a.alto || b.y - a.y);

  let numero: number | null = null;
  const etiqueta = lineas.find((l) => coincide(l, ETIQUETA_NUMERO));
  if (etiqueta) {
    const cifras = lineas
      .filter(
        (l) =>
          l.y < etiqueta.y &&
          l.y > etiqueta.y - 70 &&
          l.x > etiqueta.x - 60 &&
          SOLO_NUMERO.test(clave(l.texto)),
      )
      .sort((a, b) => b.alto - a.alto);
    const m = cifras[0] ? SOLO_NUMERO.exec(clave(cifras[0].texto)) : null;
    if (m) numero = Number(m[1]);
  }

  let nombre = candidatos[0] ? limpiarNombre(candidatos[0].texto) : "";
  // "3 - Vista Hermosa" escrito en el campo del nombre.
  if (numero === null && nombre) {
    const m = NUMERO_Y_NOMBRE.exec(nombre);
    if (m && tieneLetras(m[2])) {
      numero = Number(m[1]);
      nombre = limpiarNombre(m[2]);
    }
  }

  if (!nombre && numero === null) return null;
  return { pagina, numero, nombre };
}

// ---------------------------------------------------------------------------
//  2. Cuadrícula: varias tarjetas por hoja, sin rótulos
// ---------------------------------------------------------------------------

type Candidata = { linea: Linea; valor: number };

/**
 * Lee las tarjetas de una hoja con varias.
 *
 * La idea: en estas hojas el número va escrito en grande en una esquina de
 * la tarjeta y el nombre, también grande, en la otra. Los dos comparten
 * renglón. Las calles y el resto de letra pequeña quedan descartados por
 * tamaño. Después se empareja cada número con el nombre más cercano, de los
 * más cercanos a los menos, y ningún nombre sirve para dos números.
 */
function tarjetasDeCuadricula(lineas: Linea[], pagina: number): TarjetaLeida[] {
  const utiles = lineas.filter((l) => !esRelleno(l.texto));
  if (utiles.length === 0) return [];
  const altoMax = Math.max(...utiles.map((l) => l.alto));

  const numeros: Candidata[] = [];
  for (const l of utiles) {
    const m = SOLO_NUMERO.exec(clave(l.texto));
    if (!m) continue;
    if (l.alto < altoMax * 0.5) continue;
    const valor = Number(m[1]);
    // El mismo número dos veces en la hoja (el mapa lo repite): se queda el
    // que está escrito más grande.
    const previo = numeros.find((n) => n.valor === valor);
    if (previo) {
      if (l.alto > previo.linea.alto) previo.linea = l;
      continue;
    }
    numeros.push({ linea: l, valor });
  }
  if (numeros.length === 0) return [];

  const nombres = utiles.filter(
    (l) =>
      !SOLO_NUMERO.test(clave(l.texto)) &&
      tieneLetras(l.texto) &&
      l.alto >= altoMax * 0.45,
  );

  type Par = { numero: Candidata; nombre: Linea; coste: number };
  const pares: Par[] = [];
  for (const numero of numeros) {
    for (const nombre of nombres) {
      const dy = Math.abs(numero.linea.y - nombre.y);
      // Tienen que compartir renglón: si no, son de tarjetas distintas.
      if (dy > Math.max(10, numero.linea.alto * 0.8)) continue;
      const hueco =
        numero.linea.x >= nombre.x
          ? numero.linea.x - finDe(nombre)
          : nombre.x - finDe(numero.linea);
      pares.push({ numero, nombre, coste: dy * 4 + Math.max(0, hueco) });
    }
  }
  pares.sort((a, b) => a.coste - b.coste);

  const usados = new Set<Linea>();
  const asignado = new Map<Candidata, Linea>();
  for (const p of pares) {
    if (asignado.has(p.numero) || usados.has(p.nombre)) continue;
    asignado.set(p.numero, p.nombre);
    usados.add(p.nombre);
  }

  // De arriba abajo y de izquierda a derecha, como se lee la hoja. El
  // renglón se redondea a bandas del alto de la letra: dos tarjetas de la
  // misma fila casi nunca están en la misma línea base exacta.
  const banda = Math.max(10, altoMax);
  const fila = (l: Linea) => Math.round(l.y / banda);

  return numeros
    .sort(
      (a, b) => fila(b.linea) - fila(a.linea) || a.linea.x - b.linea.x,
    )
    .map((n) => ({
      pagina,
      numero: n.valor,
      nombre: limpiarNombre(asignado.get(n)?.texto ?? ""),
    }));
}

// ---------------------------------------------------------------------------
//  3. Lista escrita
// ---------------------------------------------------------------------------

function tarjetasDeLista(lineas: Linea[]): TarjetaLeida[] {
  const out: TarjetaLeida[] = [];
  for (const l of lineas) {
    if (esRelleno(l.texto)) continue;
    const m = NUMERO_Y_NOMBRE.exec(l.texto.trim());
    if (!m) continue;
    const nombre = limpiarNombre(m[2]);
    if (!tieneLetras(nombre)) continue;
    out.push({ pagina: l.page, numero: Number(m[1]), nombre });
  }
  return out;
}

// ---------------------------------------------------------------------------
//  Lectura completa
// ---------------------------------------------------------------------------

function porPaginas(lineas: Linea[]): Map<number, Linea[]> {
  const mapa = new Map<number, Linea[]>();
  for (const l of lineas) {
    const previo = mapa.get(l.page);
    if (previo) previo.push(l);
    else mapa.set(l.page, [l]);
  }
  return mapa;
}

/**
 * Lee las tarjetas de un PDF ya convertido en fragmentos de texto.
 *
 * `paginas` es el total de páginas del documento: se pasa aparte porque una
 * página que solo trae el mapa dibujado no deja ningún fragmento de texto y,
 * sin este dato, ni siquiera sabríamos que existe.
 */
export function leerTarjetasDePdf(
  frags: Fragmento[],
  paginas?: number,
): LecturaTarjetas {
  const lineas = lineasDePdf(frags);
  const mapa = porPaginas(lineas);
  const numerosDePagina = [...mapa.keys()].sort((a, b) => a - b);
  const total =
    paginas && paginas > 0
      ? paginas
      : numerosDePagina.length > 0
        ? Math.max(...numerosDePagina)
        : 0;

  const avisos: string[] = [];

  // --- 1. ¿Son tarjetas oficiales? ---
  const oficiales: TarjetaLeida[] = [];
  for (const p of numerosDePagina) {
    const t = tarjetaOficial(mapa.get(p)!, p);
    if (t) oficiales.push(t);
  }

  let formato: FormatoTarjetas = "ninguno";
  let tarjetas: TarjetaLeida[] = [];

  if (oficiales.length > 0 && oficiales.length >= numerosDePagina.length / 2) {
    formato = "oficial";
    tarjetas = oficiales;
    const sinLeer = numerosDePagina.length - oficiales.length;
    if (sinLeer > 0) {
      avisos.push(
        `${sinLeer} ${sinLeer === 1 ? "página no parecía" : "páginas no parecían"} una tarjeta y ${sinLeer === 1 ? "se dejó" : "se dejaron"} fuera.`,
      );
    }
  } else {
    // --- 2 y 3: cuadrícula o lista, gana la que saque más ---
    const cuadricula: TarjetaLeida[] = [];
    for (const p of numerosDePagina) {
      cuadricula.push(...tarjetasDeCuadricula(mapa.get(p)!, p));
    }
    const lista = tarjetasDeLista(lineas);
    if (lista.length > cuadricula.length) {
      formato = "lista";
      tarjetas = lista;
    } else if (cuadricula.length > 0) {
      formato = "cuadricula";
      tarjetas = cuadricula;
    }
  }

  // Avisos sobre lo leído: lo que le falta algo y lo que viene repetido.
  const sinNombre = tarjetas.filter((t) => !t.nombre).length;
  if (sinNombre > 0) {
    avisos.push(
      `${sinNombre} ${sinNombre === 1 ? "tarjeta se quedó" : "tarjetas se quedaron"} sin nombre: escríbelo antes de crear.`,
    );
  }
  const sinNumero = tarjetas.filter((t) => t.numero === null).length;
  if (sinNumero > 0) {
    avisos.push(
      `${sinNumero} ${sinNumero === 1 ? "tarjeta no traía" : "tarjetas no traían"} número: se les pondrá el siguiente libre.`,
    );
  }
  const cuenta = new Map<number, number>();
  for (const t of tarjetas) {
    if (t.numero !== null) cuenta.set(t.numero, (cuenta.get(t.numero) ?? 0) + 1);
  }
  const repetidos = [...cuenta.entries()]
    .filter(([, n]) => n > 1)
    .map(([n]) => n);
  if (repetidos.length > 0) {
    avisos.push(
      `El número ${repetidos.slice(0, 6).join(", ")} aparece más de una vez en el PDF.`,
    );
  }
  if (total > 0 && formato !== "ninguno" && tarjetas.length < total / 2) {
    avisos.push(
      `El PDF tiene ${total} páginas y solo se reconocieron ${tarjetas.length} tarjetas: revísalas bien.`,
    );
  }

  const paginasConTarjeta = new Set(tarjetas.map((t) => t.pagina));
  const unaPorPagina =
    tarjetas.length > 0 && paginasConTarjeta.size === tarjetas.length;

  return { formato, tarjetas, paginas: total, unaPorPagina, avisos };
}
