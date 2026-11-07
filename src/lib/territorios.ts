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

/** Horas que se proponen al generar (se pueden cambiar una por una). */
export const HORA_POR_DEFECTO: Record<Turno, string> = {
  MANANA: "9:30",
  TARDE: "15:30",
};

// ---------------------------------------------------------------------------
//  EL PLAN DE LA SEMANA
//
//  Cada día de la semana se predica a su manera: hay días con salida de
//  mañana y de tarde, días con una sola y días sin ninguna. Y cada salida
//  tiene su hora, su lugar de encuentro, su capitán y, si se quiere, un
//  territorio fijo. Eso es lo que guarda el plan, y de ahí salen las salidas
//  del mes.
// ---------------------------------------------------------------------------

/** Los dos turnos, en el orden del día. */
export const TURNOS_ORDEN: Turno[] = [TURNOS.MANANA, TURNOS.TARDE];

/** Los días como los numera el navegador: 0 = domingo. */
export const DIAS_SEMANA = [0, 1, 2, 3, 4, 5, 6];

/** Los mismos días, en el orden en que se leen: de lunes a domingo. */
export const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0];

/** Lo que se hace en un turno de un día de la semana. */
export type TurnoSemanal = {
  /** ¿Ese día tiene salida en este turno? */
  activo: boolean;
  time: string;
  place: string;
  captainName: string;
  /** Territorio fijo. Vacío = se reparten solos, por antigüedad. */
  territoryId: string;
};

/** Un día de la semana, con sus dos turnos. */
export type DiaSemanal = Record<Turno, TurnoSemanal>;

/** Los siete días, del domingo (0) al sábado (6). */
export type PlanSemanal = DiaSemanal[];

function turnoEnBlanco(turno: Turno, lugar: string): TurnoSemanal {
  return {
    activo: false,
    time: HORA_POR_DEFECTO[turno],
    place: lugar,
    captainName: "",
    territoryId: "",
  };
}

/** Un plan sin ninguna salida. */
export function planVacio(lugar = ""): PlanSemanal {
  return DIAS_SEMANA.map(() => ({
    MANANA: turnoEnBlanco(TURNOS.MANANA, lugar),
    TARDE: turnoEnBlanco(TURNOS.TARDE, lugar),
  }));
}

/** El plan que se propone la primera vez: sábado y domingo por la mañana. */
export function planPorDefecto(lugar = ""): PlanSemanal {
  const plan = planVacio(lugar);
  for (const dia of [6, 0]) plan[dia].MANANA.activo = true;
  return plan;
}

/** Cuántas salidas por semana tiene el plan. */
export function turnosDelPlan(plan: PlanSemanal): number {
  let n = 0;
  for (const dia of plan) {
    for (const turno of TURNOS_ORDEN) if (dia[turno]?.activo) n += 1;
  }
  return n;
}

// ---------------------------------------------------------------------------
//  EL RANGO DE DÍAS
//
//  Un programa no tiene que abarcar el mes entero: se puede armar del 1 al 15
//  de noviembre y después, aparte, del 16 al 30. El rango son dos días del
//  mes, y siempre se guarda recortado y en orden para que ninguna cuenta se
//  salga del calendario.
// ---------------------------------------------------------------------------

/** El último día del mes: 28, 29, 30 o 31. */
export function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate();
}

/** Desde qué día del mes hasta qué día se arma el programa. */
export type RangoDias = { desde: number; hasta: number };

/** El mes entero: del día 1 al último. */
export function rangoDelMes(anio: number, mes: number): RangoDias {
  return { desde: 1, hasta: ultimoDiaDelMes(anio, mes) };
}

/**
 * Deja el rango dentro del mes y en orden.
 *
 * Un día fuera del mes se recorta (el 31 de febrero pasa a ser el 28), lo que
 * no es un número se cambia por el extremo que le toca, y si vienen al revés
 * se dan la vuelta en vez de devolver un rango vacío.
 */
export function normalizarRango(
  anio: number,
  mes: number,
  rango?: Partial<RangoDias> | null,
): RangoDias {
  const ultimo = ultimoDiaDelMes(anio, mes);
  const dentro = (valor: unknown, porDefecto: number) => {
    const n = Math.trunc(Number(valor));
    if (!Number.isFinite(n) || n <= 0) return porDefecto;
    return Math.min(n, ultimo);
  };
  let desde = dentro(rango?.desde, 1);
  let hasta = dentro(rango?.hasta, ultimo);
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  return { desde, hasta };
}

/** ¿El rango abarca el mes completo? */
export function esMesCompleto(
  anio: number,
  mes: number,
  rango: RangoDias,
): boolean {
  return rango.desde === 1 && rango.hasta === ultimoDiaDelMes(anio, mes);
}

/**
 * Cómo se titula el período en el PDF: "Noviembre 2026" si es el mes entero,
 * y "Del 1 al 15 de noviembre de 2026" si es solo un trozo.
 */
export function periodoDelPrograma(
  anio: number,
  mes: number,
  rango: RangoDias,
): string {
  if (esMesCompleto(anio, mes, rango)) return `${monthName(mes)} ${anio}`;
  const nombre = monthName(mes).toLowerCase();
  if (rango.desde === rango.hasta) {
    return `${rango.desde} de ${nombre} de ${anio}`;
  }
  return `Del ${rango.desde} al ${rango.hasta} de ${nombre} de ${anio}`;
}

/**
 * Cuántas salidas saldrían de este mes (o de este trozo), sin armarlas.
 * Las de los grupos cuentan igual que las demás, y una compartida cuenta
 * como una sola, que es lo que se va a ver en la tabla.
 */
export function cuantasSalidas(
  anio: number,
  mes: number,
  plan: PlanSemanal,
  rango?: Partial<RangoDias> | null,
  salidasDeGrupo?: SalidaDeGrupo[] | null,
): number {
  let n = 0;
  const { desde, hasta } = normalizarRango(anio, mes, rango);
  const deGrupo = (salidasDeGrupo ?? []).filter((s) => s.grupos.length > 0);
  for (let d = desde; d <= hasta; d++) {
    const semana = new Date(anio, mes - 1, d, 12, 0, 0).getDay();
    const dia = plan[semana];
    if (dia) {
      for (const turno of TURNOS_ORDEN) if (dia[turno]?.activo) n += 1;
    }
    for (const salida of deGrupo) if (salida.dia === semana) n += 1;
  }
  return n;
}

/** Un resumen en palabras: "lunes y miércoles (mañana y tarde)…". */
export function resumenDelPlan(plan: PlanSemanal): string {
  const partes: string[] = [];
  for (const d of ORDEN_SEMANA) {
    const dia = plan[d];
    if (!dia) continue;
    const turnos = TURNOS_ORDEN.filter((t) => dia[t]?.activo).map((t) =>
      TURNO_LABELS[t].toLowerCase(),
    );
    if (turnos.length === 0) continue;
    partes.push(`${weekdayName(d).toLowerCase()} (${turnos.join(" y ")})`);
  }
  return partes.length === 0 ? "ningún día" : partes.join(", ");
}

/**
 * Comprueba que lo guardado sigue siendo un plan antes de usarlo.
 *
 * Lo que viene de la base es texto: pudo guardarlo una versión anterior de
 * la pantalla, o quedar a medias. Si no encaja, se devuelve null y la
 * pantalla empieza con el plan de siempre, en vez de romperse.
 */
function textoHasta(v: unknown, tope: number): string {
  return typeof v === "string" ? v.slice(0, tope) : "";
}

/** Un día cualquiera, dejado en forma: lo que falte se rellena. */
function normalizarDia(crudo: Record<string, unknown>): DiaSemanal {
  const dia = {} as DiaSemanal;
  for (const turno of TURNOS_ORDEN) {
    const t = (crudo[turno] ?? {}) as Record<string, unknown>;
    dia[turno] = {
      activo: t.activo === true,
      time: textoHasta(t.time, 20) || HORA_POR_DEFECTO[turno],
      place: textoHasta(t.place, 120),
      captainName: textoHasta(t.captainName, 120),
      territoryId: textoHasta(t.territoryId, 40),
    };
  }
  return dia;
}

export function normalizarPlan(crudo: unknown): PlanSemanal | null {
  if (!Array.isArray(crudo) || crudo.length !== 7) return null;
  const plan: PlanSemanal = [];
  for (const dia of crudo) {
    if (!dia || typeof dia !== "object") return null;
    plan.push(normalizarDia(dia as Record<string, unknown>));
  }
  return plan;
}

/**
 * El plan partido en una fila por día, que es como se guarda.
 *
 * Va por días y no de una pieza por un motivo muy concreto: la tabla de
 * "guardados" tiene un índice único sobre el texto, y Postgres no admite
 * entradas de índice de más de unos 2.700 bytes. Un plan entero con nombres
 * largos los pasaría y el guardado fallaría; un día suelto no llega ni a la
 * mitad. Cada fila lleva dentro su número de día, así que dos días iguales
 * no se pisan entre ellos.
 */
export function planAFilas(plan: PlanSemanal): string[] {
  return plan.map((dia, d) =>
    JSON.stringify({ d, MANANA: dia.MANANA, TARDE: dia.TARDE }),
  );
}

/** Rehace el plan a partir de sus filas. Null si no se entendió ninguna. */
export function planDeFilas(valores: string[]): PlanSemanal | null {
  const plan = planVacio();
  let leidos = 0;
  for (const valor of valores) {
    try {
      const crudo = JSON.parse(valor) as Record<string, unknown>;
      const d = Number(crudo?.d);
      if (!Number.isInteger(d) || d < 0 || d > 6) continue;
      plan[d] = normalizarDia(crudo);
      leidos += 1;
    } catch {
      // Una fila ilegible no tira abajo el resto del plan.
    }
  }
  return leidos > 0 ? plan : null;
}

// ---------------------------------------------------------------------------
//  PREDICACIÓN POR GRUPOS
//
//  Además de la salida de toda la congregación, cada grupo puede tener la
//  suya: su día, su hora, su lugar de encuentro y su territorio. Y dos o más
//  grupos pueden salir juntos, que entonces es una sola salida con los dos
//  nombres, no una por grupo.
//
//  Los grupos van por nombre, como el capitán y el lugar: lo que importa es
//  lo que se imprime, y así renombrar o borrar un grupo no estropea los
//  programas de los meses pasados.
// ---------------------------------------------------------------------------

/** Lo que se escribe cuando una salida no es de ningún grupo en concreto. */
export const TODA_LA_CONGREGACION = "Toda la congregación";

/** Separador de los nombres dentro de la columna "groups" de la base. */
const SEPARADOR_GRUPOS = "|";

/** Nombres sin espacios de sobra, sin vacíos, sin repetidos y sin el "|". */
export function limpiarGrupos(grupos: unknown): string[] {
  if (!Array.isArray(grupos)) return [];
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const g of grupos) {
    if (typeof g !== "string") continue;
    const nombre = g.split(SEPARADOR_GRUPOS).join(" ").trim().slice(0, 80);
    if (!nombre || vistos.has(nombre)) continue;
    vistos.add(nombre);
    out.push(nombre);
  }
  return out.slice(0, 20);
}

/** Los nombres de grupo, listos para guardar en una sola columna de texto. */
export function gruposATexto(grupos: string[]): string {
  return limpiarGrupos(grupos).join(SEPARADOR_GRUPOS);
}

/** Lo contrario: de la columna de texto a la lista de nombres. */
export function gruposDeTexto(texto: string): string[] {
  return limpiarGrupos((texto ?? "").split(SEPARADOR_GRUPOS));
}

/** "Grupo 1", "Grupo 1 y Grupo 2", "Grupo 1, Grupo 2 y Grupo 3". */
export function etiquetaDeGrupos(grupos: string[]): string {
  const limpios = limpiarGrupos(grupos);
  if (limpios.length === 0) return TODA_LA_CONGREGACION;
  if (limpios.length === 1) return limpios[0];
  return `${limpios.slice(0, -1).join(", ")} y ${limpios[limpios.length - 1]}`;
}

/**
 * Los mismos grupos, como se escriben en el bloque del impreso: "Grupo 1,2".
 * Solo se abrevia cuando todos se llaman "Grupo " y algo; si alguno tiene
 * otro nombre, se escriben enteros para que no quede un galimatías.
 */
export function etiquetaCortaDeGrupos(grupos: string[]): string {
  const limpios = limpiarGrupos(grupos);
  if (limpios.length === 0) return TODA_LA_CONGREGACION;
  if (limpios.length === 1) return limpios[0];
  const sufijos = limpios.map((g) => /^Grupo\s+(.+)$/i.exec(g)?.[1]);
  if (sufijos.every((s) => s && s.length <= 3)) {
    return `Grupo ${sufijos.join(",")}`;
  }
  return limpios.join(", ");
}

/** Una salida de uno o varios grupos, dentro del plan de la semana. */
export type SalidaDeGrupo = {
  /** Llave solo del editor. */
  key: string;
  /** Qué grupos salen. Dos o más = salida compartida, una sola actividad. */
  grupos: string[];
  /** Día de la semana, como lo numera el navegador (0 = domingo). */
  dia: number;
  time: string;
  place: string;
  /** Territorio fijo. Vacío = entra en el reparto con las demás. */
  territoryId: string;
  captainName: string;
};

/** Una salida de grupo recién añadida, con lo razonable puesto. */
export function salidaDeGrupoEnBlanco(
  grupos: string[] = [],
  lugar = "",
): SalidaDeGrupo {
  return {
    key: nuevaKey(),
    grupos: limpiarGrupos(grupos),
    dia: 6,
    time: HORA_POR_DEFECTO.MANANA,
    place: lugar,
    territoryId: "",
    captainName: "",
  };
}

/** Comprueba que una salida de grupo guardada sigue teniendo sentido. */
function normalizarSalidaDeGrupo(crudo: unknown): SalidaDeGrupo | null {
  if (!crudo || typeof crudo !== "object") return null;
  const c = crudo as Record<string, unknown>;
  const dia = Math.trunc(Number(c.dia));
  if (!Number.isFinite(dia) || dia < 0 || dia > 6) return null;
  return {
    key: nuevaKey(),
    grupos: limpiarGrupos(c.grupos),
    dia,
    time: textoHasta(c.time, 20) || HORA_POR_DEFECTO.MANANA,
    place: textoHasta(c.place, 120),
    territoryId: textoHasta(c.territoryId, 40),
    captainName: textoHasta(c.captainName, 120),
  };
}

/**
 * Las salidas de grupo, una fila de texto por salida.
 *
 * Igual que el plan de la semana: cada una en su fila, porque el índice de
 * Postgres no admite valores muy largos y un solo JSON con todas se pasaría.
 * El número de orden va dentro para que dos salidas iguales no choquen.
 */
export function gruposAFilas(salidas: SalidaDeGrupo[]): string[] {
  return salidas.slice(0, 60).map((s, i) =>
    JSON.stringify({
      i,
      grupos: limpiarGrupos(s.grupos),
      dia: s.dia,
      time: s.time,
      place: s.place,
      territoryId: s.territoryId,
      captainName: s.captainName,
    }),
  );
}

/** Lo contrario: de las filas guardadas a las salidas de grupo. */
export function gruposDeFilas(valores: string[]): SalidaDeGrupo[] {
  const conOrden: { i: number; salida: SalidaDeGrupo }[] = [];
  for (const valor of valores) {
    try {
      const crudo = JSON.parse(valor) as { i?: unknown };
      const salida = normalizarSalidaDeGrupo(crudo);
      if (!salida) continue;
      const i = Number(crudo.i);
      conOrden.push({ i: Number.isFinite(i) ? i : conOrden.length, salida });
    } catch {
      /* una fila ilegible se salta: el resto del plan vale igual */
    }
  }
  return conOrden.sort((a, b) => a.i - b.i).map((x) => x.salida);
}

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

/**
 * La fecha como va en el programa impreso: "Domingo 1", "Miércoles 25".
 *
 * Sin el mes: el mes ya encabeza la tabla, repetirlo en cada fila solo
 * alargaba la columna y obligaba a partir el texto en dos renglones.
 */
export function etiquetaCortaDeFecha(d: Date): string {
  return `${weekdayName(d.getDay())} ${d.getDate()}`;
}

/**
 * La hora como va en el programa impreso: "09:30 HRS", "16:00 HRS".
 *
 * Siempre en 24 horas, porque así es como se lee de un vistazo sin pensar si
 * era de mañana o de tarde. Lo que se escribe en pantalla es texto libre
 * ("9:30", "4 pm", "16.00"), así que aquí se entiende lo que se pueda; si no
 * hay forma de leerlo, se imprime tal cual en vez de inventar una hora.
 */
export function horaEn24(texto: string, turno?: Turno): string {
  const t = (texto ?? "").trim();
  const m = /^(\d{1,2})\s*[:.h]?\s*(\d{2})?/.exec(t);
  if (!m) return t;
  let hora = Number(m[1]);
  const minuto = m[2] ? Number(m[2]) : 0;
  if (!Number.isFinite(hora) || hora > 23 || minuto > 59) return t;

  const tarde = /p\.?\s*m/i.test(t);
  const manana = /a\.?\s*m/i.test(t);
  if (tarde && hora < 12) hora += 12;
  else if (manana && hora === 12) hora = 0;
  // Sin "am" ni "pm": una salida de tarde a las "4" son las 16:00.
  else if (!tarde && !manana && turno === TURNOS.TARDE && hora < 12) hora += 12;

  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")} HRS`;
}

/** De qué turno es una hora escrita a mano: de 13:00 en adelante, tarde. */
export function turnoDeHora(texto: string): Turno {
  const t = (texto ?? "").trim();
  if (/p\.?\s*m/i.test(t)) return TURNOS.TARDE;
  if (/a\.?\s*m/i.test(t)) return TURNOS.MANANA;
  const hora = Number(/^(\d{1,2})/.exec(t)?.[1] ?? 0);
  return Number.isFinite(hora) && hora >= 13 ? TURNOS.TARDE : TURNOS.MANANA;
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
  /** Qué grupos salen. Vacío = toda la congregación. */
  groups: string[];
};

let contador = 0;
/** Una llave distinta para cada fila nueva del editor. */
export function nuevaKey(): string {
  contador += 1;
  return `s${Date.now().toString(36)}-${contador}`;
}

/**
 * Arma las salidas de un mes siguiendo el plan de la semana.
 *
 * Cada día del mes mira cómo está ese día de la semana en el plan: si tiene
 * salida de mañana, de tarde o las dos, y con qué hora, lugar y capitán.
 *
 * Los territorios se van repartiendo en orden, empezando por el que lleva
 * más tiempo sin predicarse, para no proponer siempre los mismos. Un día con
 * territorio fijo se queda con el suyo y no entra en ese reparto.
 */
export function generarSalidas(opciones: {
  anio: number;
  mes: number;
  plan: PlanSemanal;
  /** En el orden en el que conviene usarlos (el primero, el más olvidado). */
  territoriosSugeridos?: string[];
  /** Del día X al día Y del mes. Sin esto, el mes entero. */
  rango?: Partial<RangoDias> | null;
  /** Las salidas de cada grupo, que se suman a las de la congregación. */
  salidasDeGrupo?: SalidaDeGrupo[];
}): SalidaBorrador[] {
  const sugeridos = opciones.territoriosSugeridos ?? [];
  const out: SalidaBorrador[] = [];
  let siguiente = 0;
  const { desde, hasta } = normalizarRango(
    opciones.anio,
    opciones.mes,
    opciones.rango,
  );

  /** El territorio que toca: el fijo del plan, o el siguiente del reparto. */
  const territorioQueToca = (fijo: string): string => {
    if (fijo) return fijo;
    if (sugeridos.length === 0) return "";
    const id = sugeridos[siguiente % sugeridos.length];
    siguiente += 1;
    return id;
  };

  // Las salidas de grupo, ordenadas por el día de la semana al que van.
  const deGrupoPorDia = new Map<number, SalidaDeGrupo[]>();
  for (const s of opciones.salidasDeGrupo ?? []) {
    const lista = deGrupoPorDia.get(s.dia) ?? [];
    lista.push(s);
    deGrupoPorDia.set(s.dia, lista);
  }

  for (let d = desde; d <= hasta; d++) {
    const fecha = new Date(opciones.anio, opciones.mes - 1, d, 12, 0, 0);
    const iso = isoDeFecha(fecha);
    const dia = opciones.plan?.[fecha.getDay()];

    // Primero las de toda la congregación…
    if (dia) {
      for (const turno of TURNOS_ORDEN) {
        const cfg = dia[turno];
        if (!cfg?.activo) continue;
        out.push({
          key: nuevaKey(),
          iso,
          turno,
          time: cfg.time || HORA_POR_DEFECTO[turno],
          place: cfg.place ?? "",
          territoryId: territorioQueToca(cfg.territoryId ?? ""),
          captainName: cfg.captainName ?? "",
          groups: [],
        });
      }
    }

    // …y después las de los grupos que predican ese día.
    for (const g of deGrupoPorDia.get(fecha.getDay()) ?? []) {
      const time = g.time || HORA_POR_DEFECTO.MANANA;
      out.push({
        key: nuevaKey(),
        iso,
        turno: turnoDeHora(time),
        time,
        place: g.place ?? "",
        territoryId: territorioQueToca(g.territoryId ?? ""),
        captainName: g.captainName ?? "",
        groups: limpiarGrupos(g.grupos),
      });
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
  /** Qué grupos salen. Vacío o ausente = toda la congregación. */
  grupos?: string[];
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

// ---------------------------------------------------------------------------
//  REPARTO AUTOMÁTICO DE TERRITORIOS
// ---------------------------------------------------------------------------

/**
 * Reparte los territorios entre las salidas, lo más parejo posible.
 *
 * Se recorren las salidas en el orden del programa y se van dando los
 * territorios en círculo, empezando por el que lleva más tiempo sin
 * predicarse. Como la vuelta es entera antes de repetir, ninguno sale más de
 * una vez más que otro: con 10 salidas y 4 territorios, dos salen 3 veces y
 * dos salen 2. Y entre dos turnos del mismo territorio pasa la vuelta
 * completa, así que no cae el mismo dos días seguidos mientras queden otros.
 *
 * Es una propuesta: devuelve salidas nuevas y no toca las que le pasan, para
 * que la pantalla las siga pudiendo cambiar a mano antes de guardar.
 */
export function asignarTerritorios(
  salidas: SalidaBorrador[],
  territoriosSugeridos: string[],
): SalidaBorrador[] {
  const sugeridos = territoriosSugeridos.filter((id) => Boolean(id));
  if (sugeridos.length === 0) return salidas.map((s) => ({ ...s }));
  const leToca = new Map<string, string>();
  ordenarSalidas(salidas).forEach((s, i) => {
    leToca.set(s.key, sugeridos[i % sugeridos.length]);
  });
  return salidas.map((s) => ({
    ...s,
    territoryId: leToca.get(s.key) ?? s.territoryId,
  }));
}

/** Cuántas veces le toca a cada territorio en estas salidas. */
export function vecesPorTerritorio(
  salidas: { territoryId: string }[],
): Map<string, number> {
  const cuenta = new Map<string, number>();
  for (const s of salidas) {
    if (!s.territoryId) continue;
    cuenta.set(s.territoryId, (cuenta.get(s.territoryId) ?? 0) + 1);
  }
  return cuenta;
}

/**
 * El reparto en palabras, para enseñarlo antes de guardar:
 * "24 salidas repartidas entre 23 territorios: cada uno sale 1 o 2 veces."
 */
export function resumenDelReparto(salidas: { territoryId: string }[]): string {
  const cuenta = vecesPorTerritorio(salidas);
  if (cuenta.size === 0) return "Ninguna salida tiene territorio.";

  const con = salidas.filter((s) => s.territoryId).length;
  const sin = salidas.length - con;
  const veces = [...cuenta.values()];
  const minimo = Math.min(...veces);
  const maximo = Math.max(...veces);
  const cuantas =
    minimo === maximo
      ? `cada uno sale ${minimo} ${minimo === 1 ? "vez" : "veces"}`
      : `cada uno sale ${minimo} o ${maximo} veces`;
  const cola =
    sin > 0
      ? ` ${sin} ${sin === 1 ? "salida queda" : "salidas quedan"} sin territorio.`
      : "";
  return (
    `${con} ${con === 1 ? "salida repartida" : "salidas repartidas"} entre ` +
    `${cuenta.size} ${cuenta.size === 1 ? "territorio" : "territorios"}: ` +
    `${cuantas}.${cola}`
  );
}

/** Las filas del PDF del programa, ya con todo escrito. */
export type FilaPrograma = {
  /** "Lunes" */
  dia: string;
  /** "2" */
  fecha: string;
  /** "2026-11-02": para juntar en el impreso las salidas del mismo día. */
  iso: string;
  /** "09:30 HRS" */
  horario: string;
  lugar: string;
  territorio: string;
  capitan: string;
  /** "Toda la congregación", "Grupo 1" o "Grupo 1 y Grupo 2". */
  grupos: string;
  /** "Grupo 1,2", como se escribe en el bloque del impreso. */
  gruposCorto: string;
  /** Si es de uno o varios grupos (para destacarlo en el PDF). */
  esDeGrupo: boolean;
  /** Si la comparten dos o más grupos. */
  compartida: boolean;
};

export function filasDelPrograma(salidas: Salida[]): FilaPrograma[] {
  return ordenarSalidas(salidas).map((s) => {
    const grupos = limpiarGrupos(s.grupos ?? []);
    return {
      dia: weekdayName(s.date.getDay()),
      fecha: String(s.date.getDate()),
      iso: isoDeFecha(s.date),
      horario: horaEn24(
        s.time,
        s.turno === TURNOS.TARDE ? TURNOS.TARDE : TURNOS.MANANA,
      ),
      lugar: s.place || "—",
      territorio: s.territorio ? nombreCompleto(s.territorio) : "—",
      capitan: s.captainName || "—",
      grupos: etiquetaDeGrupos(grupos),
      gruposCorto: etiquetaCortaDeGrupos(grupos),
      esDeGrupo: grupos.length > 0,
      compartida: grupos.length > 1,
    };
  });
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

// CAPITAN y LUGAR son listas de nombres para elegir rápido. PLAN es otra
// cosa: ahí se guarda, en una sola fila, el plan de la semana de la
// congregación, para no tener que rellenarlo cada mes.
export const PRESET_KINDS = {
  CAPITAN: "CAPITAN",
  LUGAR: "LUGAR",
  PLAN: "PLAN_SEMANAL",
  /** Las salidas de los grupos: una fila por salida. */
  GRUPOS: "PLAN_GRUPOS",
} as const;

/** Las listas de sugerencias (lo que se enseña en "guardados"). */
export const PRESET_LISTAS = [PRESET_KINDS.CAPITAN, PRESET_KINDS.LUGAR];
export type PresetKind = (typeof PRESET_KINDS)[keyof typeof PRESET_KINDS];

// ---------------------------------------------------------------------------
//  LAS FOTOS DEL ENCABEZADO DEL PROGRAMA
//
//  La franja de fotos de arriba del programa impreso. Las sube la propia
//  congregación y se quedan puestas mes a mes: no van dentro del programa,
//  van en la base, como los mapas.
// ---------------------------------------------------------------------------

/** Cuántas fotos caben en la franja sin que queden como sellos. */
export const MAX_FOTOS_ENCABEZADO = 6;

/** Tamaño máximo de una foto del encabezado (el navegador la reduce antes). */
export const MAX_BYTES_FOTO = 2 * 1024 * 1024;
