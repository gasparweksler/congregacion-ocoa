"use client";

import { useEffect } from "react";
import { LATIDO_SEGUNDOS } from "@/lib/presencia";

/** Aviso entre pestañas del mismo navegador cuando una se cierra. */
const AVISO_CIERRE = "ocoa-presencia-cierre";

/**
 * Mientras esta pestaña esté abierta y a la vista, avisa al servidor de que la
 * persona está conectada. No pinta nada.
 *
 * - Avisa al entrar, cada LATIDO_SEGUNDOS y al volver a la pestaña.
 * - Si la pestaña está en segundo plano no avisa: tener la aplicación abierta
 *   y olvidada en otra pestaña no es estar usándola.
 * - Al cerrar la pestaña manda una despedida (con sendBeacon, que sí sale
 *   aunque la página ya esté cerrándose) para aparecer desconectado al
 *   instante en vez de esperar a que caduque el último aviso.
 * - Si había otra pestaña abierta, esa se entera de la despedida y vuelve a
 *   avisar en el momento, para que no parezca que la persona se fue.
 */
export function Presencia() {
  useEffect(() => {
    const latir = () => {
      if (document.visibilityState !== "visible") return;
      // keepalive: el aviso sale incluso si la página se está yendo.
      fetch("/api/presencia", {
        method: "POST",
        cache: "no-store",
        keepalive: true,
      }).catch(() => {
        // Sin internet no hay nada que hacer: el siguiente latido lo arregla.
      });
    };

    latir();
    const reloj = setInterval(latir, LATIDO_SEGUNDOS * 1000);

    const alVolver = () => latir();
    const alCerrar = () => {
      try {
        // Las demás pestañas de este navegador reciben el aviso.
        localStorage.setItem(AVISO_CIERRE, String(Date.now()));
      } catch {
        // Modo privado o almacenamiento bloqueado: se sigue igual.
      }
      navigator.sendBeacon?.("/api/presencia?adios=1");
    };
    const alCerrarseOtra = (e: StorageEvent) => {
      if (e.key === AVISO_CIERRE) latir();
    };

    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("pageshow", alVolver);
    window.addEventListener("pagehide", alCerrar);
    window.addEventListener("storage", alCerrarseOtra);

    return () => {
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("pageshow", alVolver);
      window.removeEventListener("pagehide", alCerrar);
      window.removeEventListener("storage", alCerrarseOtra);
    };
  }, []);

  return null;
}
