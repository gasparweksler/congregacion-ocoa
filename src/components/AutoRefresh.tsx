"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Refresca los datos del servidor (soft refresh de React Server Components) cada
 * `seconds` segundos, solo cuando la pestaña está visible. Sirve para ver las
 * confirmaciones que van llegando sin recargar la página manualmente.
 *
 * No provoca recarga completa ni pierde el foco de los campos: solo vuelve a
 * pedir los datos y React concilia los cambios.
 */
export function AutoRefresh({ seconds = 8 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, seconds * 1000);
    // Al volver a la pestaña, refresca de inmediato.
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, seconds]);

  return null;
}
