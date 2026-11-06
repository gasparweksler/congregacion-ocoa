// ============================================================================
//  Territorios: lo que se puede calcular sin base de datos ni navegador.
//
//  Aquí vive la lógica de la sección "Superintendente de Servicio":
//   · leer una lista de territorios escrita a mano ("1 - Camino al Túnel"),
//   · armar las salidas de un mes según la modalidad elegida,
//   · y sacar las estadísticas: cuántas veces se predicó cada territorio,
//     cuándo fue la última y cuáles llevan más tiempo sin predicarse.
//
//  Nada de esto toca Prisma ni el navegador a propósito: así se puede probar
//  entero desde un script, que es donde se comprueba que las cuentas cuadran.
// ============================================================================

import { monthName, weekdayName } from "@/lib/constants";

// ---------------------------------------------------------------------------
//  TURNOS Y MODALIDAD
// ---------------------------------------------------------------------------

export const TURNOS = { MANANA: "MANANA", TARDE: "TARDE" } as const;
export type Turno = (typeof TURNOS)[keyof typeof TURNOS];

export const TURNO_LABELS: Record<Turno, string> = {
  MANANA: "Mañana",
  TARDE: "Tarde",
};

export function turnoLabel(t: string): string {
  return TURNO_LABELS[t as Turno] ?? t;
}

/** Qué salidas tiene el programa del mes. */
export type Modalidad = "manana" | "tarde" | "ambos";

export const MODALIDAD_LABELS: Record<Modalidad, string> = {
  manana: "Solo mañana",
  tarde: "Solo tarde",
  ambos: "Mañana y tarde",
};

/** Los turnos que le tocan a cada día según la modalidad. */
export function turnosDeModalidad(m: Modalidad): Turno[] {
  if (m === "manana") return [TURNOS.MANANA];
  if (m === "tarde") return [TURNOS.TARDE];
  return [TURNOS.MANANA, TURNOS.TARDE];
}

/** Horas que se proponen al generar (se pueden cambiar una por una). */
export const HORA_POR_DEFECTO: Record<Turno, string> = {
  MANANA: "9:30",
  TARDE: "15:30",
};

// ---------------------------------------------------------------------------
//  FECHAS
//  Todas las fechas se guardan a MEDIODÍA local, como el resto del sistema:
//  así no se corren de día al convertirlas a UTC.
// ---------------------------------------------------------------------------

/** "2027-01-03" -> Date del 3 de enero de 2027 a mediodía. Null si no vale. */
export function fechaDeISO(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const f = new Date(y, mo - 1, d, 12, 0, 0);
  // Rechaza el 31 de febrero y compañía: el Date se habría corrido de mes.
  if (f.getFullYear() !== y || f.getMonth() !== mo - 1 || f.getDate() !== d) {
    return null;
  }
  return f;
}

/** Date -> "2027-01-03" (en hora local, no en UTC). */
export function isoDeFecha(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** "domingo 3 de enero" — como se lee en el programa impreso. */
export function etiquetaDeFecha(d: Date): string {
  return `${weekdayName(d.getDay()).toLowerCase()} ${d.getDate()} de ${monthName(
    d.getMonth() + 1,
  ).toLowerCase()}`;
}

/** Los días del mes que caen en alguno de esos días de la semana (0..6). */
export function diasDelMes(
  anio: number,
  mes: number,
  diasSemana: number[],
): Date[] {
  const quiero = new Set(diasSemana);
  const out: Date[] = [];
  const ultimo = new Date(anio, mes, 0).getDate();
  for (let d = 1; d <= ultimo; d++) {
    const f = new Date(anio, mes - 1, d, 12, 0, 0);
    if (quiero.has(f.getDay())) out.push(f);
  }
  return out;
}

// ---------------------------------------------------------------------------
//  TERRITORIOS
// ---------------------------------------------------------------------------

export type Territorio = {
  id: string;
  number: number;
  name: string;
  order: number;
};

/** "3 - Vista Hermosa": como se nombra un territorio en todas las pantallas. */
export function nombreCompleto(t: { number: number; name: string }): string {
  return `${t.number} - ${t.name}`;
}

/** El número libre más bajo a partir del mayor que ya exista. */
export function siguienteNumero(usados: number[]): number {
  if (usados.length === 0) return 1;
  return Math.max(...usados) + 1;
}

export type LineaLeida = { numero: number | null; nombre: string };

/**
 * Lee una lista escrita a mano, una por línea. Acepta todas estas formas:
 *
 *    1 - Camino al Túnel      1. Camino al Túnel      1) Camino al Túnel
 *    1 Camino al Túnel        Camino al Túnel         1 – La Febre 1
 *
 * Si la línea no trae número, devuelve `numero: null` y quien llame le pone
 * el siguiente libre. Los nombres que acaban en número ("La Febre 1") no se
 * confunden: el número solo se busca al principio.
 */
export function leerListaDeTerritorios(texto: string): LineaLeida[] {
  const out: LineaLeida[] = [];
  for (const cruda of (texto ?? "").split(/\r?\n/)) {
    const linea = cruda.trim();
    if (!linea) continue;
    // Número al principio, separado por guion, punto, paréntesis o espacio.
    const m = /^(\d{1,4})\s*(?:[-–—.)]\s*|\s+)(.+)$/.exec(linea);
    if (m && m[2].trim()) {
      out.push({ numero: Number(m[1]), nombre: m[2].trim() });
      continue;
    }
    // Solo un número: no es un territorio, es basura.
    if (/^\d+$/.test(linea)) continue;
    out.push({ numero: null, nombre: linea });
  }
  return out;
}

// ---------------------------------------------------------------------------
//  ESTADÍSTICAS
//
//  Una "vez predicado" puede venir de dos sitios y las dos cuentan igual:
//   · anotada a mano en el territorio (TerritoryVisit),
//   · o de una salida del programa del mes (ServiceOuting con territorio).
//  No se copian de un lado al otro: se suman aquí al calcular, así nunca
//  quedan descuadradas.
// ---------------------------------------------------------------------------

/** Una vez que se predicó un territorio, de donde sea que venga. */
export type VezPredicado = {
  territoryId: string;
  date: Date;
  /** De dónde salió, para poder explicarlo en pantalla. */
  origen: "manual" | "programa";
};

export type EstadisticaTerritorio = {
  territorio: Territorio;
  /** Veces en total (en el período consultado). */
  veces: number;
  /** La última vez que se predicó, o null si nunca. */
  ultima: Date | null;
  /** Días desde la última vez; null si nunca se predicó. */
  diasSinPredicar: number | null;
  /** porMes["2027-01"] = cuántas veces se predicó ese mes. */
  porMes: Record<string, number>;
};

/** "2027-01" — la clave con la que se agrupa por mes. */
export function claveDeMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "Enero 2027" a partir de "2027-01". */
export function etiquetaDeMes(clave: string): string {
  const [a, m] = clave.split("-");
  return `${monthName(Number(m))} ${a}`;
}

/** Días completos entre dos fechas (ignorando la hora). */
export function diasEntre(desde: Date, hasta: Date): number {
  const a = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const b = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Las estadísticas de cada territorio, en el mismo orden de la lista.
 * `hoy` llega como argumento para que las pruebas no dependan del día.
 */
export function estadisticas(
  territorios: Territorio[],
  veces: VezPredicado[],
  hoy: Date = new Date(),
): EstadisticaTerritorio[] {
  const porTerritorio = new Map<string, VezPredicado[]>();
  for (const v of veces) {
    const lista = porTerritorio.get(v.territoryId);
    if (lista) lista.push(v);
    else porTerritorio.set(v.territoryId, [v]);
  }

  return territorios.map((territorio) => {
    const suyas = porTerritorio.get(territorio.id) ?? [];
    const porMes: Record<string, number> = {};
    let ultima: Date | null = null;
    for (const v of suyas) {
      const k = claveDeMes(v.date);
      porMes[k] = (porMes[k] ?? 0) + 1;
      if (!ultima || v.date.getTime() > ultima.getTime()) ultima = v.date;
    }
    return {
      territorio,
      veces: suyas.length,
      ultima,
      diasSinPredicar: ultima ? Math.max(0, diasEntre(ultima, hoy)) : null,
      porMes,
    };
  });
}

/**
 * Los que llevan más tiempo sin predicarse, primero los que nunca se
 * predicaron. Se usa para destacarlos en la pantalla.
 */
export function masOlvidados(
  stats: EstadisticaTerritorio[],
  cuantos = 5,
): EstadisticaTerritorio[] {
  return [...stats]
    .sort((a, b) => {
      // Nunca predicado va primero; entre dos "nunca", por número.
      if (a.ultima === null && b.ultima === null) {
        return a.territorio.number - b.territorio.number;
      }
      if (a.ultima === null) return -1;
      if (b.ultima === null) return 1;
      return a.ultima.getTime() - b.ultima.getTime();
    })
    .slice(0, cuantos);
}

/** Los meses que aparecen en las estadísticas, del más nuevo al más viejo. */
export function mesesConDatos(stats: EstadisticaTerritorio[]): string[] {
  const todos = new Set<string>();
  for (const s of stats) for (const k of Object.keys(s.porMes)) todos.add(k);
  return [...todos].sort().reverse();
}

/** Los últimos N meses hasta `hoy`, del más nuevo al más viejo. */
export function ultimosMeses(n: number, hoy: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(claveDeMes(new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)));
  }
  return out;
}

// ---------------------------------------------------------------------------
//  PROGRAMA DE PREDICACIÓN
// ---------------------------------------------------------------------------

/** Una salida tal como se edita en pantalla (antes de guardarse). */
export type SalidaBorrador = {
  /** Identificador solo del editor; al guardar se crea de nuevo. */
  key: string;
  /** "2027-01-03" */
  iso: string;
  turno: Turno;
  time: string;
  place: string;
  /** Id del territorio, o "" si todavía no se eligió. */
  territoryId: string;
  captainName: string;
};

let contador = 0;
/** Una llave distinta para cada fila nueva del editor. */
export function nuevaKey(): string {
  contador += 1;
  return `s${Date.now().toString(36)}-${contador}`;
}

/**
 * Arma las salidas de un mes: por cada día elegido, una salida por turno.
 *
 * Los territorios se van repartiendo en orden, empezando por el que lleva
 * más tiempo sin predicarse, para no proponer siempre los mismos. Si no hay
 * territorios, las salidas quedan sin territorio y se eligen a mano.
 */
export function generarSalidas(opciones: {
  anio: number;
  mes: number;
  diasSemana: number[];
  modalidad: Modalidad;
  lugar: string;
  capitan?: string;
  horas?: Partial<Record<Turno, string>>;
  /** En el orden en el que conviene usarlos (el primero, el más olvidado). */
  territoriosSugeridos?: string[];
}): SalidaBorrador[] {
  const turnos = turnosDeModalidad(opciones.modalidad);
  const sugeridos = opciones.territoriosSugeridos ?? [];
  const out: SalidaBorrador[] = [];
  let i = 0;
  for (const dia of diasDelMes(opciones.anio, opciones.mes, opciones.diasSemana)) {
    for (const turno of turnos) {
      out.push({
        key: nuevaKey(),
        iso: isoDeFecha(dia),
        turno,
        time: opciones.horas?.[turno] ?? HORA_POR_DEFECTO[turno],
        place: opciones.lugar,
        territoryId: sugeridos.length > 0 ? sugeridos[i % sugeridos.length] : "",
        captainName: opciones.capitan ?? "",
      });
      i += 1;
    }
  }
  return out;
}

/** Una salida ya guardada, como la devuelve la base. */
export type Salida = {
  id: string;
  date: Date;
  turno: string;
  time: string;
  place: string;
  captainName: string;
  territorio: { id: string; number: number; name: string } | null;
};

/** Las salidas en el orden del programa impreso: por fecha y turno. */
export function ordenarSalidas<
  T extends { date?: Date; iso?: string; turno: string; time: string },
>(salidas: T[]): T[] {
  const clave = (s: T) =>
    `${s.date ? isoDeFecha(s.date) : (s.iso ?? "")}|${
      s.turno === TURNOS.MANANA ? "0" : "1"
    }|${s.time.padStart(5, "0")}`;
  return [...salidas].sort((a, b) => clave(a).localeCompare(clave(b)));
}

/** Las filas del PDF del programa, ya con todo escrito. */
export type FilaPrograma = {
  fecha: string;
  horario: string;
  lugar: string;
  territorio: string;
  capitan: string;
};

export function filasDelPrograma(salidas: Salida[]): FilaPrograma[] {
  return ordenarSalidas(salidas).map((s) => ({
    fecha: etiquetaDeFecha(s.date),
    horario: `${turnoLabel(s.turno)} · ${s.time}`,
    lugar: s.place || "—",
    territorio: s.territorio ? nombreCompleto(s.territorio) : "—",
    capitan: s.captainName || "—",
  }));
}

/** Los territorios que aparecen en el programa, sin repetir y en orden. */
export function territoriosDelPrograma(
  salidas: Salida[],
): { id: string; number: number; name: string }[] {
  const vistos = new Map<string, { id: string; number: number; name: string }>();
  for (const s of ordenarSalidas(salidas)) {
    if (s.territorio && !vistos.has(s.territorio.id)) {
      vistos.set(s.territorio.id, s.territorio);
    }
  }
  return [...vistos.values()];
}

// ---------------------------------------------------------------------------
//  MAPAS
// ---------------------------------------------------------------------------

/** Tamaño máximo que se guarda de un mapa (el navegador ya lo comprime). */
export const MAX_BYTES_MAPA = 3 * 1024 * 1024;

/** Formatos de imagen que se aceptan para un mapa. */
export const MIMES_MAPA = ["image/jpeg", "image/png", "image/webp"] as const;

/** ¿Es un formato de imagen que sirve como mapa? */
export function esMimeDeMapa(mime: string): boolean {
  return (MIMES_MAPA as readonly string[]).includes(mime);
}

/** "1,2 MB" — para enseñar cuánto ocupa un mapa. */
export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/**
 * A qué escala se dibuja una página del PDF para que el mapa pese poco y
 * siga leyéndose. Nunca agranda de más ni deja un mapa ilegible.
 */
export function escalaDeMapa(
  anchoPt: number,
  altoPt: number,
  ladoMaximo = 1600,
): number {
  const mayor = Math.max(anchoPt, altoPt);
  if (!Number.isFinite(mayor) || mayor <= 0) return 1;
  return Math.min(2, Math.max(0.5, ladoMaximo / mayor));
}

/**
 * Reparto automático de las páginas de un PDF entre los territorios: la
 * página 1 al primero de la lista, la 2 al segundo… Devuelve, para cada
 * página, el id del territorio que le toca ("" si ya no quedan).
 */
export function repartoPorOrden(
  paginas: number,
  territorios: Territorio[],
): string[] {
  const out: string[] = [];
  for (let i = 0; i < paginas; i++) out.push(territorios[i]?.id ?? "");
  return out;
}

// ---------------------------------------------------------------------------
//  CAPITANES Y LUGARES GUARDADOS
//  Vive aquí y no en las acciones porque un archivo "use server" solo puede
//  exportar funciones: una constante importada desde una pantalla rompería
//  la compilación.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
//  IMPORTAR TARJETAS EN PDF
// ---------------------------------------------------------------------------

/** Una tarjeta que la pantalla manda a crear. */
export type TarjetaParaCrear = {
  pagina: number;
  numero: number | null;
  nombre: string;
};

/** Dónde acabó cada página del PDF: en qué territorio, nuevo o ya existente. */
export type PaginaImportada = {
  pagina: number;
  territoryId: string;
  numero: number;
  nombre: string;
  nuevo: boolean;
};

/** Lo que devuelve la importación, para poder seguir con los mapas. */
export type ResultadoImportacion = {
  ok: boolean;
  /** Qué salió mal, si salió mal. */
  error?: string;
  /** Qué se hizo, en palabras. */
  mensaje?: string;
  creados: number;
  yaExistian: number;
  paginas: PaginaImportada[];
};

export const PRESET_KINDS = { CAPITAN: "CAPITAN", LUGAR: "LUGAR" } as const;
export type PresetKind = (typeof PRESET_KINDS)[keyof typeof PRESET_KINDS];
