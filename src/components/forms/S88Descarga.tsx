"use client";

// ============================================================================
//  Año de servicio + descarga del registro S-88-S.
//
//  El año de servicio va de septiembre a agosto y se nombra por el año en que
//  termina. El selector cambia la dirección (?servicio=), así que el historial
//  de abajo y el PDF siempre hablan del mismo período.
// ============================================================================

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui";
import { DownloadButton } from "@/components/DownloadButton";
import {
  aniosDeServicioOpciones,
  etiquetaAnioDeServicio,
} from "@/lib/asistencia";

export function S88Descarga({ anio }: { anio: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // El que se está mirando entra siempre en la lista, aunque sea antiguo.
  const opciones = [...new Set([anio, ...aniosDeServicioOpciones()])].sort(
    (a, b) => b - a,
  );

  const cambiar = (valor: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("servicio", valor);
    router.push(`${pathname}?${params.toString()}`);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="block">
        <span className="mb-0.5 block text-xs text-muted">Año de servicio</span>
        <Select
          className="w-full sm:w-44"
          value={anio}
          onChange={(e) => cambiar(e.target.value)}
          aria-label="Año de servicio"
        >
          {opciones.map((a) => (
            <option key={a} value={a}>
              {a} (sep. {a - 1} – ago. {a})
            </option>
          ))}
        </Select>
      </label>
      <DownloadButton
        href={`/api/asistencia-s88-pdf?servicio=${anio}`}
        variant="primary"
        pendingText="Generando PDF…"
      >
        📄 Descargar Registro de asistencia S-88-S
      </DownloadButton>
      <span className="text-xs text-muted sm:self-center">
        {etiquetaAnioDeServicio(anio)}
      </span>
    </div>
  );
}
