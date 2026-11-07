"use client";

// ============================================================================
//  La paleta de colores elegida, recordada en este navegador.
//
//  Quien eligió los verdes para los PDF de su congregación no quiere volver a
//  elegirlos cada mes. Lo usan la descarga de Responsabilidades y el Programa
//  de predicación, cada uno con su clave, para que no se pisen.
//
//  Va con useSyncExternalStore y no con un efecto: localStorage no existe en
//  el servidor, así que el primer render pinta la de siempre y React cambia a
//  la recordada al hidratar, sin avisos de "el servidor pintó otra cosa".
// ============================================================================

import { useCallback, useSyncExternalStore } from "react";
import { paletaDe, type PaletaId } from "@/lib/programa-paletas";

const POR_DEFECTO: PaletaId = "azules";

/**
 * Lo elegido, también en memoria: si el navegador no deja guardar (ventana
 * privada, almacenamiento lleno), la pantalla hace caso igual mientras dure
 * la visita.
 */
const enMemoria = new Map<string, PaletaId>();

/** A quién avisar cuando cambia: nadie más la cambia, la cambiamos aquí. */
const avisos = new Set<() => void>();

function suscribir(avisar: () => void): () => void {
  avisos.add(avisar);
  return () => {
    avisos.delete(avisar);
  };
}

function leer(clave: string): PaletaId {
  const puesta = enMemoria.get(clave);
  if (puesta) return puesta;
  let guardada: string | null = null;
  try {
    guardada = localStorage.getItem(clave);
  } catch {
    /* navegador sin almacenamiento: la de siempre */
  }
  const id = paletaDe(guardada).id;
  enMemoria.set(clave, id);
  return id;
}

export function usePaletaRecordada(
  clave: string,
): [PaletaId, (id: PaletaId) => void] {
  const paleta = useSyncExternalStore(
    suscribir,
    useCallback(() => leer(clave), [clave]),
    () => POR_DEFECTO,
  );

  const elegir = useCallback(
    (id: PaletaId) => {
      enMemoria.set(clave, id);
      try {
        localStorage.setItem(clave, id);
      } catch {
        /* da igual: la descarga funciona lo mismo */
      }
      for (const avisar of avisos) avisar();
    },
    [clave],
  );

  return [paleta, elegir];
}
