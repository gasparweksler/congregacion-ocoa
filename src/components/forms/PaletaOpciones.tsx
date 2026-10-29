"use client";

// ============================================================================
//  Las cinco paletas, con un ejemplo de cada una.
//
//  El ejemplo usa los MISMOS colores que va a usar el PDF (salen del mismo
//  módulo), así que lo que se ve es lo que se imprime. Lo usan el editor de
//  Programas y la descarga de Responsabilidades.
// ============================================================================

import { PALETAS, css, type PaletaId } from "@/lib/programa-paletas";

export function PaletaOpciones({
  value,
  onChange,
  /** Para que dos selectores en la misma página no compartan los radios. */
  name = "paleta",
  /** Filas de ejemplo; por defecto dos días de reunión. */
  ejemplo = ["Jueves 1", "Sábado 3"],
}: {
  value: PaletaId;
  onChange: (id: PaletaId) => void;
  name?: string;
  ejemplo?: string[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {PALETAS.map((pal) => {
        const puesta = pal.id === value;
        return (
          <label
            key={pal.id}
            className={
              puesta
                ? "cursor-pointer rounded-2xl border-2 border-primary bg-surface p-3"
                : "cursor-pointer rounded-2xl border border-border bg-surface p-3 hover:border-primary/40"
            }
          >
            <span className="mb-2 flex items-center gap-2">
              <input
                type="radio"
                name={name}
                value={pal.id}
                checked={puesta}
                onChange={() => onChange(pal.id)}
                className="h-4 w-4"
              />
              <span className="text-sm font-semibold text-foreground">
                {pal.nombre}
              </span>
            </span>

            <span
              aria-hidden
              className="block overflow-hidden rounded-lg border"
              style={{ borderColor: css(pal.linea) }}
            >
              <span
                className="flex text-[0.6rem] font-bold uppercase"
                style={{
                  background: css(pal.cabecera),
                  color: css(pal.cabeceraTexto),
                }}
              >
                <span className="w-14 shrink-0 px-1.5 py-1">Día</span>
                <span className="flex-1 px-1.5 py-1">Columna</span>
              </span>
              {ejemplo.map((d) => (
                <span
                  key={d}
                  className="flex border-t text-[0.6rem] text-slate-700"
                  style={{ borderColor: css(pal.linea) }}
                >
                  <span
                    className="w-14 shrink-0 px-1.5 py-1 font-semibold"
                    style={{ background: css(pal.columnaDia) }}
                  >
                    {d}
                  </span>
                  <span className="flex-1 bg-white px-1.5 py-1">Hermano</span>
                </span>
              ))}
            </span>
          </label>
        );
      })}
    </div>
  );
}
