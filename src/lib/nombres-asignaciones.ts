// ============================================================================
//  Arreglar un nombre suelto de las asignaciones: decidir qué queda escrito.
//
//  Módulo puro (sin base de datos) para poder probarlo aislado. Aquí vive la
//  parte delicada: qué fila se toca y con qué nombre se queda. Quien lo use
//  (las Server Actions) solo lee filas, llama a estas funciones y escribe lo
//  que digan.
//
//  Dos reglas que no se negocian:
//   1. Solo cuenta el nombre EXACTO (sin los espacios de sobra). Nunca "el que
//      se parece": una fusión que se equivoca atribuye a un hermano lo que
//      hizo otro.
//   2. Al fusionar, el mismo hermano no puede quedar dos veces en la misma
//      asignación: contaría la participación dos veces.
// ============================================================================

import { normalizeName } from "@/lib/assignment-stats";

/** Los dos huecos de nombre de una asignación (o de una fila del historial). */
export type FilaDeNombres = {
  primaryName: string | null;
  secondaryName: string | null;
};

/** ¿Este hueco lleva exactamente ese nombre? Los espacios de sobra no cuentan. */
export function esEseNombre(
  valor: string | null | undefined,
  nombre: string,
): boolean {
  return (valor ?? "").trim() === nombre.trim();
}

/** ¿Esta fila lleva ese nombre en alguno de sus dos huecos? */
export function filaLlevaElNombre(f: FilaDeNombres, nombre: string): boolean {
  return (
    esEseNombre(f.primaryName, nombre) || esEseNombre(f.secondaryName, nombre)
  );
}

/**
 * Cómo queda la fila al QUITAR ese nombre.
 * `vacia` avisa de que ya no queda ningún nombre: una fila así, en el
 * historial de reuniones borradas, ya no cuenta nada y se puede eliminar.
 */
export function quitarNombre(
  f: FilaDeNombres,
  nombre: string,
): { primaryName: string | null; secondaryName: string | null; vacia: boolean } {
  const primaryName = esEseNombre(f.primaryName, nombre) ? null : f.primaryName;
  const secondaryName = esEseNombre(f.secondaryName, nombre)
    ? null
    : f.secondaryName;
  return {
    primaryName,
    secondaryName,
    vacia: !primaryName?.trim() && !secondaryName?.trim(),
  };
}

/**
 * Cómo queda la fila al FUSIONAR ese nombre con el oficial del hermano.
 * `duplicado` avisa de que el hermano habría quedado dos veces en la misma
 * asignación; en ese caso el segundo hueco se deja vacío.
 */
export function fusionarNombre(
  f: FilaDeNombres,
  nombre: string,
  oficial: string,
): {
  primaryName: string | null;
  secondaryName: string | null;
  duplicado: boolean;
} {
  const limpio = oficial.trim();
  const primaryName = esEseNombre(f.primaryName, nombre)
    ? limpio
    : f.primaryName;
  let secondaryName = esEseNombre(f.secondaryName, nombre)
    ? limpio
    : f.secondaryName;
  let duplicado = false;
  if (
    primaryName?.trim() &&
    secondaryName?.trim() &&
    normalizeName(primaryName) === normalizeName(secondaryName)
  ) {
    secondaryName = null;
    duplicado = true;
  }
  return { primaryName, secondaryName, duplicado };
}
