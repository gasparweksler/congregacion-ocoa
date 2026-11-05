// ============================================================================
//  Lector de la GUÍA DE ACTIVIDADES (Vida y Ministerio Cristianos) en PDF.
//
//  Módulo puro: recibe las líneas ya reconstruidas (ver pdf-lines.ts) y
//  devuelve las semanas del programa. No toca la base de datos ni el sistema
//  de archivos, así que se puede probar con casos inventados.
//
//  REGLA DE ORO: NADA FIJO. Cada guía trae títulos distintos, un número
//  distinto de partes en cada sección y un número distinto de semanas. Por eso
//  aquí no hay ninguna lista de títulos ni ninguna cuenta esperada: todo se
//  reconoce por su FORMA.
//
//    · Semana        "4-10 DE ENERO" + libro bíblico a la derecha
//    · Sección       su título ("TESOROS…", "SEAMOS MEJORES MAESTROS",
//                    "NUESTRA VIDA CRISTIANA"); la parte pertenece a la
//                    sección cuyo título la precede
//    · Parte         "N. Título (X mins.)" — el título puede ocupar varias
//                    líneas, así que se van uniendo hasta la duración
//    · Canciones     la primera de la semana es la de inicio; la que sigue a
//                    "NUESTRA VIDA CRISTIANA", la intermedia; la que sigue a
//                    "Palabras de conclusión", la final
//    · Tipo          "DE CASA EN CASA", "Discurso a cargo del presidente"…
//                    Se acepta cualquiera: no hay lista cerrada
//
//  Lo que no encaje en ninguno de esos patrones (párrafos, preguntas, pies de
//  foto, recuadros, números de página, copyright) se ignora, y lo que falte se
//  informa en `avisos` indicando la semana, sin detener el resto.
// ============================================================================

import type { Linea } from "@/lib/pdf-lines";

const MESES: Record<string, number> = {
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
  JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
};
const NOMBRE_MES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export type Seccion = "TESOROS" | "SMM" | "VC";

export type GuiaParte = {
  /** El número con el que la Guía la nombra (1, 2, 3…). */
  numero: number;
  /** Título completo con su duración, tal como se imprime. */
  titulo: string;
  /** "10 mins." — vacío si la Guía no la indica. */
  duracion: string;
  /** "De casa en casa", "Discurso", "Análisis con el auditorio"… o vacío. */
  tipo: string;
  /** "presidente de la reunión", "superintendente de servicio"… o vacío. */
  aCargoDe: string;
  seccion: Seccion;
};

export type GuiaSemana = {
  /** Lunes (primer día del rango) en formato ISO, "2027-01-04". */
  inicioISO: string;
  /** Como lo escribe la planilla: "4-10 de Enero". */
  etiqueta: string;
  /** Tal cual en el PDF: "22-28 DE FEBRERO". */
  encabezado: string;
  /** Lectura semanal de la Biblia: "EZEQUIEL 11, 12". */
  lectura: string;
  cancionInicio: string;
  cancionIntermedia: string;
  cancionFinal: string;
  partes: GuiaParte[];
  /** Semana especial (asamblea, Conmemoración, visita…) o aviso propio. */
  nota: string;
};

export type GuiaLeida = {
  /** Año del programa, tomado de la portada. */
  anio: number;
  /** Meses que abarca, en el orden de la portada. */
  meses: number[];
  /** "Enero y Febrero de 2027". */
  titulo: string;
  semanas: GuiaSemana[];
  /** Lo que falta o no se pudo leer, en lenguaje claro. */
  avisos: string[];
};

// ---------------------------------------------------------------------------
//  Validación de lo que vuelve del navegador
// ---------------------------------------------------------------------------

const TOPE_TEXTO = 400;
const TOPE_SEMANAS = 60;
const TOPE_PARTES = 40;

function cadena(v: unknown, tope = TOPE_TEXTO): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, tope) : "";
}

/**
 * Comprueba y limpia una guía que llega del navegador.
 *
 * La vista previa deja corregir a mano cualquier dato, así que lo que llega
 * para generar la planilla ya no es lo que se leyó del PDF: puede traer
 * cualquier cosa. Se recorta, se descarta lo que no encaje y se devuelve
 * `null` si no queda ninguna semana aprovechable, en vez de confiar.
 */
export function normalizarGuia(v: unknown): GuiaLeida | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const semanasEntrada = Array.isArray(o.semanas) ? o.semanas : [];

  const semanas: GuiaSemana[] = [];
  for (const s of semanasEntrada.slice(0, TOPE_SEMANAS)) {
    if (typeof s !== "object" || s === null) continue;
    const w = s as Record<string, unknown>;
    const etiqueta = cadena(w.etiqueta, 120);
    if (!etiqueta) continue; // sin etiqueta no hay fila de semana que escribir
    const partesEntrada = Array.isArray(w.partes) ? w.partes : [];
    const partes: GuiaParte[] = [];
    for (const p of partesEntrada.slice(0, TOPE_PARTES)) {
      if (typeof p !== "object" || p === null) continue;
      const q = p as Record<string, unknown>;
      const titulo = cadena(q.titulo);
      if (!titulo) continue;
      const numero = Number(q.numero);
      const seccion = q.seccion;
      partes.push({
        numero: Number.isFinite(numero) ? Math.trunc(numero) : partes.length + 1,
        titulo,
        duracion: cadena(q.duracion, 40),
        tipo: cadena(q.tipo, 120),
        aCargoDe: cadena(q.aCargoDe, 120),
        seccion:
          seccion === "SMM" || seccion === "VC" || seccion === "TESOROS"
            ? seccion
            : "TESOROS",
      });
    }
    // Primero se quitan los no-dígitos y DESPUÉS se recorta: al revés, un
    // "abc12" se cortaba a "abc1" y el número de canción salía 1.
    const soloNumero = (x: unknown) =>
      cadena(x, 40).replace(/\D/g, "").slice(0, 3);
    semanas.push({
      inicioISO: /^\d{4}-\d{2}-\d{2}$/.test(cadena(w.inicioISO, 10))
        ? cadena(w.inicioISO, 10)
        : "",
      etiqueta,
      encabezado: cadena(w.encabezado, 160),
      lectura: cadena(w.lectura, 160),
      cancionInicio: soloNumero(w.cancionInicio),
      cancionIntermedia: soloNumero(w.cancionIntermedia),
      cancionFinal: soloNumero(w.cancionFinal),
      partes,
      nota: cadena(w.nota),
    });
  }
  if (semanas.length === 0) return null;

  const anio = Number(o.anio);
  const meses = (Array.isArray(o.meses) ? o.meses : [])
    .map((m) => Number(m))
    .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12)
    .slice(0, 12);
  return {
    anio: Number.isInteger(anio) && anio >= 2000 && anio <= 2100
      ? anio
      : new Date().getFullYear(),
    meses,
    titulo: cadena(o.titulo, 80) || "Programa",
    semanas,
    avisos: (Array.isArray(o.avisos) ? o.avisos : [])
      .map((a) => cadena(a))
      .filter(Boolean)
      .slice(0, 100),
  };
}

// ---------------------------------------------------------------------------
//  Patrones
// ---------------------------------------------------------------------------

const MES_MAY = "[A-ZÁÉÍÓÚÑ]+";

/**
 * Encabezado de semana: "4-10 DE ENERO", "29 DE DICIEMBRE-4 DE ENERO",
 * "26 DE ENERO A 1 DE FEBRERO", con el año escrito o sin él, y a continuación
 * (en la misma línea o en la de al lado) el libro bíblico.
 */
const RE_SEMANA = new RegExp(
  `^(\\d{1,2})` + // día de inicio
    `(?:\\s+DE\\s+(${MES_MAY}))?` + // mes de inicio, si lo dice
    `(?:\\s+DE\\s+(\\d{4}))?` + // año de inicio, si lo dice
    `\\s*(?:[-–—]|\\sA)\\s*` + // separador del rango
    `(\\d{1,2})\\s+DE\\s+(${MES_MAY})` + // día y mes de fin
    `(?:\\s+DE\\s+(\\d{4}))?` + // año de fin, si lo dice
    `\\s*(.*)$`,
);

/** "N. Resto del título…" */
const RE_PARTE = /^(\d{1,3})\.\s*(.+)$/;

/** "(10 mins.)", "(1 min.)", "(5 min)" — la duración cierra el título. */
const RE_DURACION = /\((\d{1,3}\s*(?:mins?|minutos?)\.?)\)/i;

/** "Canción 83 y oración", "Canción 2". */
const RE_CANCION = /^[•●▪◦·*-]?\s*canci[oó]n\s*[:·-]?\s*(\d{1,3})\b/i;

const RE_CONCLUSION = /^[•●▪◦·*-]?\s*palabras\s+de\s+conclusi/i;
const RE_INTRO = /^[•●▪◦·*-]?\s*palabras\s+de\s+introducci/i;

/** "a cargo del presidente de la reunión" -> "presidente de la reunión". */
const RE_A_CARGO = /a\s+cargo\s+del?\s+(?:la\s+|el\s+)?([^.)]+)/i;

/** Qué sección empieza en esta línea, si empieza alguna. */
function seccionDe(texto: string): Seccion | null {
  const t = texto.toUpperCase();
  // Se mira palabra por palabra y no la frase entera: el título va partido en
  // dos líneas ("TESOROS" / "DE LA BIBLIA") y cada mitad tiene que bastar.
  if (/\bTESOROS\b/.test(t)) return "TESOROS";
  if (/\bSEAMOS\b/.test(t) || /\bMEJORES\s+MAESTROS\b/.test(t)) return "SMM";
  if (/\bVIDA\s+CRISTIANA\b/.test(t)) return "VC";
  return null;
}

/** ¿La línea es una de las que marcan la estructura del programa? */
function esEstructural(texto: string): boolean {
  return (
    RE_SEMANA.test(texto) ||
    RE_PARTE.test(texto) ||
    RE_CANCION.test(texto) ||
    RE_CONCLUSION.test(texto) ||
    RE_INTRO.test(texto) ||
    seccionDe(texto) !== null
  );
}

function tituloCase(s: string): string {
  const l = s.toLocaleLowerCase("es");
  return l.charAt(0).toLocaleUpperCase("es") + l.slice(1);
}

/** Letras (sin signos ni dígitos) de un texto, para ver si está en mayúsculas. */
function soloLetras(s: string): string {
  return s.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
}

/**
 * Tipo de parte escrito en VERSALITAS ("DE CASA EN CASA. Enseña…") o con la
 * forma "Discurso a cargo del presidente de la reunión.".
 *
 * No hay lista de tipos: se acepta lo que diga la publicación. Lo único que se
 * exige es que sea una frase corta al principio del texto de la parte, para no
 * confundirla con el contenido.
 */
function tipoDeLinea(texto: string): string {
  const frase = texto.split(/(?<=\.)\s/)[0].replace(/\.$/, "").trim();
  if (!frase || frase.length > 70) return "";
  const letras = soloLetras(frase);
  if (letras.length >= 3 && letras === letras.toLocaleUpperCase("es")) {
    return tituloCase(frase);
  }
  const m = frase.match(/^(.+?)\s+a\s+cargo\s+del?\s+/i);
  if (m && soloLetras(m[1]).length >= 3) return tituloCase(m[1]);
  return "";
}

// ---------------------------------------------------------------------------
//  Portada: meses y año
// ---------------------------------------------------------------------------

/**
 * Meses y año de la portada ("ENERO Y FEBRERO DE 2027").
 *
 * En la portada el texto va con las letras separadas, así que sale como
 * "E N E R O Y F E B R E R O D E 2 0 2 7". Se quitan los espacios antes de
 * buscar: así da igual cómo esté espaciado.
 */
export function portadaDe(lineas: Linea[]): { meses: number[]; anio: number } {
  const dePortada = lineas.filter((l) => l.page <= 1);
  const texto = (dePortada.length ? dePortada : lineas.slice(0, 20))
    .map((l) => l.texto.toUpperCase())
    .join(" ");
  const juntas = texto.replace(/\s+/g, "");

  const encontrados: { mes: number; pos: number }[] = [];
  for (const [nombre, num] of Object.entries(MESES)) {
    const pos = juntas.indexOf(nombre);
    if (pos >= 0) encontrados.push({ mes: num, pos });
  }
  encontrados.sort((a, b) => a.pos - b.pos);

  const anio = juntas.match(/(20\d{2})/);
  return {
    meses: encontrados.map((e) => e.mes),
    anio: anio ? Number(anio[1]) : new Date().getFullYear(),
  };
}

/**
 * Año que le toca a una semana que empieza en el mes `mes`.
 *
 * La portada dice los meses y el año, pero una guía de enero-febrero puede
 * empezar con la semana del 29 de diciembre: ese diciembre es del año
 * anterior. Y una de noviembre-diciembre puede acabar en enero del siguiente.
 *
 * Para que los dos casos salgan bien se cuenta en MESES ABSOLUTOS (año × 12 +
 * mes) y se elige el año que deja la semana más cerca del centro del período
 * de la portada. Contar solo con el número de mes fallaba justo en el salto de
 * año, que es cuando importa: con una portada de "diciembre y enero", el
 * promedio de 12 y 1 da junio.
 */
function anioDeLaSemana(
  mes: number,
  portada: { meses: number[]; anio: number },
): number {
  // Los meses de la portada son consecutivos: el primero es el del año que
  // aparece escrito, y los siguientes van detrás (cruzando el año si toca).
  const inicio = portada.anio * 12 + ((portada.meses[0] ?? 6) - 1);
  const centro = inicio + Math.max(0, portada.meses.length - 1) / 2;
  let mejor = portada.anio;
  let mejorDist = Infinity;
  for (const a of [portada.anio - 1, portada.anio, portada.anio + 1]) {
    const dist = Math.abs(a * 12 + (mes - 1) - centro);
    if (dist < mejorDist) {
      mejorDist = dist;
      mejor = a;
    }
  }
  return mejor;
}

// ---------------------------------------------------------------------------
//  Lectura de la guía
// ---------------------------------------------------------------------------

type EnCurso = GuiaSemana & {
  /** Orden en que apareció cada parte y cada título de sección. */
  seccionesVistas: { seccion: Seccion; orden: number }[];
  partesConOrden: (GuiaParte & { orden: number })[];
  tieneConclusion: boolean;
  seccionActual: Seccion | null;
};

function fechaISO(anio: number, mes: number, dia: number): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${anio}-${p(mes)}-${p(dia)}`;
}

/** "4-10 de Enero" o "29 de Diciembre a 4 de Enero", como en la planilla. */
function etiquetaDe(
  dia1: number,
  mes1: number,
  dia2: number,
  mes2: number,
): string {
  return mes1 === mes2
    ? `${dia1}-${dia2} de ${NOMBRE_MES[mes1]}`
    : `${dia1} de ${NOMBRE_MES[mes1]} a ${dia2} de ${NOMBRE_MES[mes2]}`;
}

export function leerGuia(lineas: Linea[]): GuiaLeida {
  const portada = portadaDe(lineas);
  const avisos: string[] = [];
  const semanas: EnCurso[] = [];
  let cur: EnCurso | null = null;
  let orden = 0;

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    const texto = linea.texto;
    orden++;

    // --- ¿Empieza una semana? -----------------------------------------------
    const sem = texto.match(RE_SEMANA);
    if (sem) {
      const mes2 = MESES[(sem[5] ?? "").toUpperCase()];
      const mes1 = MESES[(sem[2] ?? "").toUpperCase()] ?? mes2;
      if (mes1 && mes2) {
        const dia1 = Number(sem[1]);
        const dia2 = Number(sem[4]);
        const anio1 = sem[3]
          ? Number(sem[3])
          : anioDeLaSemana(mes1, portada);
        // La lectura va en la misma línea o justo al lado (misma altura).
        let lectura = (sem[7] ?? "").trim();
        if (!lectura) {
          const alLado = lineas[i + 1];
          if (
            alLado &&
            alLado.page === linea.page &&
            Math.abs(alLado.y - linea.y) <= 2.5 &&
            !esEstructural(alLado.texto) &&
            // Un número solo es el número de página, no la lectura.
            !/^\d{1,3}$/.test(alLado.texto)
          ) {
            lectura = alLado.texto.trim();
            i++; // ya consumida
          }
        }
        cur = {
          inicioISO: fechaISO(anio1, mes1, dia1),
          etiqueta: etiquetaDe(dia1, mes1, dia2, mes2),
          encabezado: texto.replace(/\s+/g, " ").trim(),
          lectura,
          cancionInicio: "",
          cancionIntermedia: "",
          cancionFinal: "",
          partes: [],
          nota: "",
          seccionesVistas: [],
          partesConOrden: [],
          tieneConclusion: false,
          seccionActual: null,
        };
        semanas.push(cur);
        continue;
      }
    }

    if (!cur) continue; // portada, índice, lo que sea: todavía no hay semana

    // --- ¿Título de sección? ------------------------------------------------
    const sec = seccionDe(texto);
    if (sec) {
      if (cur.seccionActual !== sec) {
        cur.seccionActual = sec;
        cur.seccionesVistas.push({ seccion: sec, orden });
      }
      continue;
    }

    // --- ¿Canción? ----------------------------------------------------------
    const can = texto.match(RE_CANCION);
    if (can) {
      const n = can[1];
      if (cur.tieneConclusion) cur.cancionFinal = cur.cancionFinal || n;
      else if (cur.seccionActual === "VC")
        cur.cancionIntermedia = cur.cancionIntermedia || n;
      else if (cur.seccionActual === null)
        cur.cancionInicio = cur.cancionInicio || n;
      continue;
    }

    if (RE_CONCLUSION.test(texto)) {
      cur.tieneConclusion = true;
      continue;
    }
    if (RE_INTRO.test(texto)) continue;

    // --- ¿Parte numerada? ---------------------------------------------------
    const par = texto.match(RE_PARTE);
    if (!par) continue;

    const numero = Number(par[1]);
    let titulo = par[2].trim();
    let consumidas = 0;
    // El título puede seguir en las líneas de abajo: se unen HASTA la
    // duración, que es lo que lo cierra. Como mucho dos líneas más, para que
    // una parte sin duración no se trague el texto de la parte.
    while (!RE_DURACION.test(titulo) && consumidas < 2) {
      const sig = lineas[i + 1 + consumidas];
      if (!sig || sig.page - linea.page > 1) break;
      if (esEstructural(sig.texto)) break;
      titulo = `${titulo} ${sig.texto.trim()}`.replace(/\s+/g, " ");
      consumidas++;
    }
    if (RE_DURACION.test(titulo)) i += consumidas;
    else titulo = par[2].trim(); // no había duración: se deja el título solo

    const dur = titulo.match(RE_DURACION);
    const duracion = dur ? dur[1].replace(/\s+/g, " ") : "";
    if (!duracion) {
      avisos.push(
        `En la semana del ${cur.etiqueta}, la parte ${numero} ("${titulo}") no indica duración.`,
      );
    }

    // Tipo: lo que va después de la duración en el propio título, o la frase
    // corta con la que empieza el texto de la parte.
    let tipo = "";
    let aCargoDe = "";
    if (dur) {
      const cola = titulo.slice((dur.index ?? 0) + dur[0].length).trim();
      if (cola) {
        tipo = tipoDeLinea(cola) || tituloCase(cola.replace(/\.$/, ""));
        const mc = cola.match(RE_A_CARGO);
        if (mc) aCargoDe = mc[1].trim();
      }
    }
    for (let k = 1; k <= 2 && (!tipo || !aCargoDe); k++) {
      const sig = lineas[i + k];
      if (!sig || esEstructural(sig.texto)) break;
      if (!tipo) tipo = tipoDeLinea(sig.texto);
      if (!aCargoDe) {
        const mc = sig.texto.match(RE_A_CARGO);
        if (mc) aCargoDe = mc[1].trim();
      }
    }

    cur.partesConOrden.push({
      numero,
      titulo,
      duracion,
      tipo,
      aCargoDe,
      seccion: cur.seccionActual ?? "TESOROS",
      orden,
    });
  }

  // --- Las semanas van en orden en la publicación ----------------------------
  // Si una sale anterior a la que la precede, su año se resolvió mal (es el
  // salto de diciembre a enero) y se corrige con la siguiente vuelta.
  for (let i = 1; i < semanas.length; i++) {
    const antes = semanas[i - 1].inicioISO;
    const ahora = semanas[i].inicioISO;
    if (antes && ahora && ahora <= antes) {
      const [a, m, d] = ahora.split("-").map(Number);
      semanas[i].inicioISO = fechaISO(a + 1, m, d);
    }
  }

  // --- Orden y sección definitivos de cada parte ----------------------------
  const RANGO: Seccion[] = ["TESOROS", "SMM", "VC"];
  for (const s of semanas) {
    // Las partes se ordenan por su NÚMERO (el texto sale mezclado por las dos
    // columnas, pero la Guía las numera de corrido).
    const partes = [...s.partesConOrden].sort(
      (a, b) => a.numero - b.numero || a.orden - b.orden,
    );
    // Y la sección no puede ir hacia atrás: si una parte posterior quedó en una
    // sección anterior, se arrastra la que ya se había alcanzado.
    let maxima = 0;
    for (const p of partes) {
      const idx = RANGO.indexOf(p.seccion);
      if (idx < maxima) p.seccion = RANGO[maxima];
      else maxima = idx;
    }
    s.partes = partes.map((p) => ({
      numero: p.numero,
      titulo: p.titulo,
      duracion: p.duracion,
      tipo: p.tipo,
      aCargoDe: p.aCargoDe,
      seccion: p.seccion,
    }));
  }

  // --- Avisos ---------------------------------------------------------------
  for (const s of semanas) {
    if (s.partes.length === 0) {
      s.nota =
        s.nota ||
        "Semana sin partes numeradas (asamblea, Conmemoración, visita del superintendente u otro formato). Revísala a mano.";
      avisos.push(
        `La semana del ${s.etiqueta} no trae partes numeradas: se registró con una nota para que la revises.`,
      );
      continue;
    }
    if (!s.lectura)
      avisos.push(`La semana del ${s.etiqueta} no indica la lectura de la Biblia.`);
    const faltan: string[] = [];
    if (!s.cancionInicio) faltan.push("la de inicio");
    if (!s.cancionIntermedia) faltan.push("la intermedia");
    if (!s.cancionFinal) faltan.push("la final");
    if (faltan.length)
      avisos.push(
        `En la semana del ${s.etiqueta} falta ${faltan.join(" y ")} de las canciones.`,
      );
  }
  if (semanas.length === 0) {
    avisos.push(
      "No se reconoció ninguna semana. Comprueba que el PDF sea la Guía de actividades (con encabezados como “4-10 DE ENERO”).",
    );
  }

  const nombres = portada.meses.map((m) => NOMBRE_MES[m]);
  const titulo = nombres.length
    ? `${nombres.length > 1 ? `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}` : nombres[0]} de ${portada.anio}`
    : `Programa ${portada.anio}`;

  return {
    anio: portada.anio,
    meses: portada.meses,
    titulo,
    // Se devuelve solo la semana, sin lo que se usó para armarla.
    semanas: semanas.map((s) => ({
      inicioISO: s.inicioISO,
      etiqueta: s.etiqueta,
      encabezado: s.encabezado,
      lectura: s.lectura,
      cancionInicio: s.cancionInicio,
      cancionIntermedia: s.cancionIntermedia,
      cancionFinal: s.cancionFinal,
      partes: s.partes,
      nota: s.nota,
    })),
    avisos,
  };
}
