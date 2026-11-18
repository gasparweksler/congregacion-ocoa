"use client";

// ============================================================================
//  Elegir la hoja del S-88-S y descargarla.
//
//  La hoja del formulario tiene sitio para DOS años de servicio seguidos, uno
//  en cada columna, igual que el impreso: "2027 y 2028", "2028 y 2029"… Por
//  eso el selector ofrece parejas, no años sueltos. El valor que viaja en la
//  dirección (?hoja=) es el PRIMERO de la pareja.
// ============================================================================

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui";
import { DownloadButton } from "@/components/DownloadButton";
import { etiquetaHoja, etiquetaRangoHoja } from "@/lib/asistencia";

export function S88Descarga({
  hoja,
  hojas,
}: {
  /** El primer año de servicio de la hoja elegida. */
  hoja: number;
  /** Las hojas que se ofrecen, cada una por su primer año. */
  hojas: number[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // La que se está mirando entra siempre en la lista, aunque sea antigua.
  const opciones = [...new Set([...hojas, hoja])].sort((a, b) => a - b);

  const cambiar = (valor: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("hoja", valor);
    router.push(`${pathname}?${params.toString()}`);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="block">
        <span className="mb-0.5 block text-xs text-muted">
          Años de servicio
        </span>
        <Select
          className="w-full sm:w-36"
          value={hoja}
          onChange={(e) => cambiar(e.target.value)}
          aria-label="Años de servicio de la hoja"
        >
          {opciones.map((a) => (
            <option key={a} value={a}>
              {etiquetaHoja(a)}
            </option>
          ))}
        </Select>
      </label>
      <DownloadButton
        href={`/api/asistencia-s88-pdf?hoja=${hoja}`}
        variant="primary"
        pendingText="Generando PDF…"
      >
        📄 Descargar Registro de asistencia S-88-S
      </DownloadButton>
      <span className="text-xs text-muted sm:self-center">
        {etiquetaRangoHoja(hoja)}
      </span>
    </div>
  );
}
