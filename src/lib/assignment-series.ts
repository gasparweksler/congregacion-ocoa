// ============================================================================
//  La serie mensual de las Estadísticas de Asignaciones.
//
//  Módulo PURO (sin base de datos ni React) para poder probarlo aislado.
//
//  Se arma a partir de las MISMAS participaciones que ya se enseñan en la
//  pantalla, o sea, después de todos los filtros (nombre, sección, fechas y
//  "incluir responsabilidades"). Así el gráfico no puede discrepar de los
//  recuadros ni de la lista: cuando cambia un filtro, cambian los dos juntos
//  porque salen del mismo sitio.
// ============================================================================

import { MONTH_NAMES } from "@/lib/constants";
import type { DoneState } from "@/lib/assignment-stats";

/** Una participación, tal como viaja del servidor a la pantalla. */
export type ParticipacionDeLaSerie = {
  /** Fecha de la reunión, en ISO. */
  date: string;
  done: DoneState;
};

/** Un hermano con sus participaciones ya filtradas. */
export type HermanoDeLaSerie = {
  name: string;
  participations: ParticipacionDeLaSerie[];
};

/** Un punto del gráfico: un mes. */
export type PuntoDeLaSerie = {
  /** "2026-06", para ordenar. */
  clave: string;
  /** "Jun 2026", lo que se lee en el eje. */
  etiqueta: string;
  /** "Junio de 2026", lo que se lee en el globo del gráfico. */
  etiquetaLarga: string;
  total: number;
  confirmadas: number;
  rechazadas: number;
  sinRespuesta: number;
  /** Cuántos hermanos distintos participaron ese mes. */
  hermanos: number;
};

const MES_CORTO = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
] as const;

/** "2026-06" -> el mes siguiente, para rellenar los huecos. */
function siguienteMes(clave: string): string {
  const [a, m] = clave.split("-").map(Number);
  return m === 12
    ? `${a + 1}-01`
    : `${a}-${String(m + 1).padStart(2, "0")}`;
}

function etiquetasDe(clave: string): { corta: string; larga: string } {
  const [a, m] = clave.split("-").map(Number);
  return {
    corta: `${MES_CORTO[m - 1]} ${a}`,
    larga: `${MONTH_NAMES[m - 1]} de ${a}`,
  };
}

/**
 * Agrupa las participaciones por mes.
 *
 * Los meses sin ninguna asignación salen igual, con sus ceros: un hueco en la
 * línea se leería como "no hay dato", cuando lo que pasó es que ese mes no le
 * tocó a nadie, que es justo lo que interesa ver.
 *
 * @param maxMeses tope de puntos, contando desde el más reciente hacia atrás.
 */
export function serieMensual(
  hermanos: HermanoDeLaSerie[],
  maxMeses = 36,
): PuntoDeLaSerie[] {
  const porMes = new Map<
    string,
    { total: number; confirmadas: number; rechazadas: number; sinRespuesta: number; quienes: Set<string> }
  >();

  for (const h of hermanos) {
    for (const p of h.participations) {
      const d = new Date(p.date);
      if (Number.isNaN(d.getTime())) continue;
      const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      let mes = porMes.get(clave);
      if (!mes) {
        mes = {
          total: 0,
          confirmadas: 0,
          rechazadas: 0,
          sinRespuesta: 0,
          quienes: new Set<string>(),
        };
        porMes.set(clave, mes);
      }
      mes.total++;
      mes.quienes.add(h.name);
      if (p.done === "confirmada") mes.confirmadas++;
      else if (p.done === "rechazada") mes.rechazadas++;
      else mes.sinRespuesta++;
    }
  }

  if (porMes.size === 0) return [];

  const claves = [...porMes.keys()].sort();
  // Del primer mes al último, sin saltarse ninguno.
  const seguidas: string[] = [];
  let actual = claves[0];
  const ultima = claves[claves.length - 1];
  // El tope evita que un historial muy largo haga un eje ilegible.
  for (let i = 0; i < 1200 && actual <= ultima; i++) {
    seguidas.push(actual);
    actual = siguienteMes(actual);
  }

  const recortadas =
    seguidas.length > maxMeses ? seguidas.slice(seguidas.length - maxMeses) : seguidas;

  return recortadas.map((clave) => {
    const m = porMes.get(clave);
    const { corta, larga } = etiquetasDe(clave);
    return {
      clave,
      etiqueta: corta,
      etiquetaLarga: larga,
      total: m?.total ?? 0,
      confirmadas: m?.confirmadas ?? 0,
      rechazadas: m?.rechazadas ?? 0,
      sinRespuesta: m?.sinRespuesta ?? 0,
      hermanos: m?.quienes.size ?? 0,
    };
  });
}
