"use client";

// ============================================================================
//  Mantiene la pantalla al día sola, sin tocar nada.
//
//  Cada pocos segundos vuelve a pedir los datos al servidor y, si cambiaron,
//  React repinta solo lo que cambió: el Administrador ve llegar las respuestas
//  sin recargar la página ni perder lo que estuviera escribiendo.
//
//  Solo trabaja mientras la pestaña está a la vista: si está en segundo plano
//  se detiene, y al volver se pone al día en el acto.
// ============================================================================

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresco({ segundos = 15 }: { segundos?: number }) {
  const router = useRouter();

  useEffect(() => {
    const cada = Math.max(5, segundos) * 1000;
    let temporizador: ReturnType<typeof setInterval> | null = null;

    const parar = () => {
      if (temporizador !== null) {
        clearInterval(temporizador);
        temporizador = null;
      }
    };
    const arrancar = () => {
      parar();
      temporizador = setInterval(() => router.refresh(), cada);
    };

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
        arrancar();
      } else {
        parar();
      }
    };

    if (document.visibilityState === "visible") arrancar();
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    return () => {
      parar();
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
    };
  }, [router, segundos]);

  return null;
}
