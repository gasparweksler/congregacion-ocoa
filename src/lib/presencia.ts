// ============================================================================
//  Quién está CONECTADO ahora mismo.
//
//  Tener la sesión iniciada no es estar conectado: la sesión dura días y una
//  pestaña cerrada no avisa de nada. Por eso cada pestaña abierta manda una
//  señal de vida (un "latido") cada poco rato, y se considera conectado a
//  quien haya avisado hace menos de la VENTANA. Si alguien cierra el portátil,
//  se le va la conexión o deja la pestaña abierta en un ordenador apagado,
//  deja de avisar y se apaga solo: no hace falta que nadie lo marque.
//
//  Al cerrar sesión la señal se borra, así que desaparece al instante.
//
//  Módulo puro: sin base de datos, para poder probar las reglas aparte.
// ============================================================================

/** Cada cuánto avisa una pestaña abierta. */
export const LATIDO_SEGUNDOS = 45;

/**
 * Cuánto se considera "conectado" desde el último aviso.
 *
 * Son casi cuatro latidos: en una pestaña de fondo el navegador frena los
 * temporizadores (suele dejarlos en uno por minuto), y con un margen más
 * corto la gente se apagaría y encendería sola por eso.
 */
export const VENTANA_SEGUNDOS = 180;

export function estaConectado(
  lastSeenAt: Date | string | null | undefined,
  ahora: Date = new Date(),
): boolean {
  if (!lastSeenAt) return false;
  const t = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
  const ms = t.getTime();
  if (!Number.isFinite(ms)) return false;
  const diferencia = ahora.getTime() - ms;
  // Un reloj adelantado en el servidor no debe dejar a nadie "conectado para
  // siempre" en el futuro, pero unos segundos de desfase son normales.
  if (diferencia < -VENTANA_SEGUNDOS * 1000) return false;
  return diferencia <= VENTANA_SEGUNDOS * 1000;
}

/** "hace 2 minutos", "ayer", "nunca ha entrado"… en lenguaje de todos los días. */
export function desdeCuando(
  lastSeenAt: Date | string | null | undefined,
  ahora: Date = new Date(),
): string {
  if (!lastSeenAt) return "sin entrar todavía";
  const t = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
  if (!Number.isFinite(t.getTime())) return "sin entrar todavía";

  const segundos = Math.round((ahora.getTime() - t.getTime()) / 1000);
  if (segundos < 0) return "hace un momento";
  if (segundos < 90) return "hace menos de un minuto";

  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `hace ${minutos} minutos`;

  const horas = Math.round(minutos / 60);
  if (horas < 24) return horas === 1 ? "hace una hora" : `hace ${horas} horas`;

  const dias = Math.round(horas / 24);
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;

  const meses = Math.round(dias / 30);
  if (meses === 1) return "hace un mes";
  if (meses < 12) return `hace ${meses} meses`;

  const anios = Math.round(meses / 12);
  return anios === 1 ? "hace un año" : `hace ${anios} años`;
}

export type UsuarioPresencia = {
  id: string;
  name: string | null;
  username: string;
  role: string;
  active: boolean;
  /** Último latido de una pestaña abierta. Se borra al salir. */
  lastSeenAt: Date | string | null;
  /** Última vez que usó la plataforma. No se borra nunca. */
  lastActiveAt: Date | string | null;
};

export type PresenciaDeCongregacion<T extends UsuarioPresencia> = {
  conectados: T[];
  desconectados: T[];
  /** true si hay al menos una persona conectada ahora. */
  enLinea: boolean;
};

/**
 * Reparte los usuarios de UNA congregación entre conectados y no conectados.
 *
 * Cada congregación se mira por separado a propósito: que una esté en verde no
 * dice nada de las demás.
 */
export function presenciaDe<T extends UsuarioPresencia>(
  usuarios: T[],
  ahora: Date = new Date(),
): PresenciaDeCongregacion<T> {
  const conectados: T[] = [];
  const desconectados: T[] = [];
  for (const u of usuarios) {
    if (u.active && estaConectado(u.lastSeenAt, ahora)) conectados.push(u);
    else desconectados.push(u);
  }
  // Los que hace menos tiempo que avisaron, primero.
  const porSeñal = (a: T, b: T) =>
    new Date(b.lastSeenAt ?? 0).getTime() - new Date(a.lastSeenAt ?? 0).getTime();
  conectados.sort(porSeñal);
  // Entre los desconectados manda el último acceso: el que entró más
  // recientemente va arriba, y los que nunca entraron, al final.
  desconectados.sort(
    (a, b) =>
      new Date(b.lastActiveAt ?? 0).getTime() -
      new Date(a.lastActiveAt ?? 0).getTime(),
  );
  return { conectados, desconectados, enLinea: conectados.length > 0 };
}
