// ============================================================================
//  De la Guía de actividades (PDF) a las semanas de la carga masiva.
//
//  El PDF de la Guía y el Excel de Vida y Ministerio dicen lo mismo con otra
//  forma. Aquí lo leído del PDF se traduce a la MISMA estructura que produce
//  el lector del Excel (vymc-parser), para que crear las reuniones desde el
//  PDF y crearlas desde la planilla acaben en el mismo sitio, con los mismos
//  títulos, las mismas fechas y las mismas comprobaciones. Si se cambia una
//  regla, cambia para los dos caminos a la vez.
//
//  Lo que el PDF NO trae son los nombres de los hermanos: la Guía es el
//  programa, no el reparto. Esas casillas nacen vacías y se rellenan después
//  en la reunión, igual que cuando se sube una planilla sin nombres.
//
//  Módulo puro: sin base de datos, para poder probarlo aparte.
// ============================================================================

import type { GuiaLeida, GuiaParte, Seccion } from "@/lib/vymc-pdf";
import { parseWeek, type Week } from "@/lib/vymc-parser";
import { tituloConNumero } from "@/lib/vymc-xlsx";

/** Una semana que no se pudo convertir, con el motivo en claro. */
export type SemanaDescartada = { etiqueta: string; motivo: string };

export type Convertido = {
  semanas: Week[];
  descartadas: SemanaDescartada[];
};

/** Mediodía local, como guarda las fechas todo el sistema. */
function fechaDe(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const fecha = new Date(y, mo - 1, d, 12, 0, 0);
  // Un "2027-02-31" se iría a marzo sin avisar.
  if (fecha.getMonth() !== mo - 1 || fecha.getDate() !== d) return null;
  return fecha;
}

/**
 * Año con el que empezar a contar cuando una semana no trae fecha: el de la
 * primera que sí la trae; si no hay ninguna, el de la portada.
 */
function anioInicial(guia: GuiaLeida): number {
  const iso = guia.semanas.find((s) => fechaDe(s.inicioISO))?.inicioISO;
  return iso ? Number(iso.slice(0, 4)) : guia.anio;
}

/** Las partes de una sección, con el título tal como lo escribe la planilla. */
function partesDe(partes: GuiaParte[], seccion: Seccion) {
  return partes
    .filter((p) => p.seccion === seccion)
    .map((p) => ({
      // El mismo título que llevaría el Excel: "3. Hagamos revisitas (3 mins.)".
      label: tituloConNumero(p),
      // La Guía no dice quién hace cada parte: eso se pone después.
      name: "",
      name2: "",
      c5: "",
    }));
}

/**
 * Convierte lo leído (y corregido a mano) de la Guía en semanas de carga
 * masiva.
 *
 * La fecha sale de `inicioISO`; si esa semana no la trae —o si alguien
 * reescribió la etiqueta—, se lee de la etiqueta con el MISMO código que usa
 * el Excel ("4-10 de Enero", "29 de Diciembre a 4 de Enero"). Cuando el mes
 * retrocede, el año avanza: un programa de diciembre a enero no se queda
 * colgado en el año viejo.
 */
export function semanasDeLaGuia(guia: GuiaLeida): Convertido {
  const semanas: Week[] = [];
  const descartadas: SemanaDescartada[] = [];

  let anio = anioInicial(guia);
  let mesAnterior = 0;

  for (const s of guia.semanas) {
    // La fecha propia manda; si no la hay, se lee de la etiqueta y el año
    // avanza cuando el mes retrocede (diciembre → enero), igual que al leer
    // el Excel.
    const deEtiqueta = (a: number) =>
      parseWeek(`SEMANA ${s.etiqueta.toUpperCase()}`, a)?.date ?? null;
    let fecha = fechaDe(s.inicioISO);
    if (!fecha) {
      const leida = deEtiqueta(anio);
      if (leida) {
        const mes = leida.getMonth() + 1;
        fecha = mesAnterior && mes < mesAnterior ? deEtiqueta(anio + 1) : leida;
      }
    }

    if (!fecha) {
      descartadas.push({
        etiqueta: s.etiqueta || "(semana sin nombre)",
        motivo:
          "no se entendió la fecha; escríbela como “4-10 de Enero” o “29 de Diciembre a 4 de Enero”",
      });
      continue;
    }

    mesAnterior = fecha.getMonth() + 1;
    anio = fecha.getFullYear();

    if (s.partes.length === 0) {
      descartadas.push({
        etiqueta: s.etiqueta || "(semana sin nombre)",
        motivo: s.nota
          ? `no tiene partes (${s.nota})`
          : "no tiene ninguna parte que asignar",
      });
      continue;
    }

    semanas.push({
      date: fecha,
      label: s.etiqueta,
      // La Guía no trae nombres: presidente y oraciones quedan sin asignar.
      pres: "",
      orac: "",
      clos: "",
      reading: s.lectura,
      songStart: s.cancionInicio,
      songMiddle: s.cancionIntermedia,
      songEnd: s.cancionFinal,
      tesoros: partesDe(s.partes, "TESOROS"),
      smm: partesDe(s.partes, "SMM"),
      vc: partesDe(s.partes, "VC"),
    });
  }

  return { semanas, descartadas };
}
