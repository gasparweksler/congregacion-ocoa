"use client";

// ============================================================================
//  La franja de fotos de arriba del programa de predicación.
//
//  Se suben una a una (JPG o PNG), el navegador las reduce antes de mandarlas
//  y se quedan puestas mes a mes. Salen en el PDF en el mismo orden en el que
//  están aquí, de izquierda a derecha.
// ============================================================================

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";
import { imagenReducida } from "@/lib/pdf-a-imagenes";
import { MAX_FOTOS_ENCABEZADO, tamanoLegible } from "@/lib/territorios";

const BOTON_ARCHIVO =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-border bg-white px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-slate-50";

export type FotoDelPrograma = { id: string; bytes: number; version: number };

export function FotosDelPrograma({ fotos }: { fotos: FotoDelPrograma[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [paso, setPaso] = useState("");
  const [error, setError] = useState("");

  const lleno = fotos.length >= MAX_FOTOS_ENCABEZADO;

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const elegidas = [...(e.target.files ?? [])];
    if (elegidas.length === 0) return;
    setError("");
    setTrabajando(true);
    try {
      let puestas = fotos.length;
      for (const file of elegidas) {
        if (puestas >= MAX_FOTOS_ENCABEZADO) {
          setError(
            `Caben ${MAX_FOTOS_ENCABEZADO} fotos: las demás no se subieron.`,
          );
          break;
        }
        if (!file.type.startsWith("image/")) {
          setError(`"${file.name}" no es una imagen (JPG o PNG).`);
          continue;
        }
        setPaso(`Preparando ${file.name}…`);
        const { blob } = await imagenReducida(file, { ladoMaximo: 1200 });

        setPaso(`Subiendo ${file.name}…`);
        const cuerpo = new FormData();
        cuerpo.append("imagen", new File([blob], "foto.jpg", { type: "image/jpeg" }));
        const r = await fetch("/api/territorios/fotos", {
          method: "POST",
          body: cuerpo,
        });
        if (!r.ok) {
          const detalle = await r
            .json()
            .then((d: { error?: string }) => d.error)
            .catch(() => "");
          setError(detalle || `No se pudo guardar (error ${r.status}).`);
          break;
        }
        puestas += 1;
      }
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? `No se pudo preparar la foto: ${err.message}`
          : "No se pudo preparar la foto.",
      );
    } finally {
      setTrabajando(false);
      setPaso("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function quitar(id: string) {
    setError("");
    setTrabajando(true);
    try {
      const r = await fetch(`/api/territorios/fotos/${id}`, { method: "DELETE" });
      if (!r.ok) {
        setError(`No se pudo quitar la foto (error ${r.status}).`);
        return;
      }
      router.refresh();
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div className="space-y-3">
      {fotos.length === 0 ? (
        <p className="text-sm text-muted">
          Todavía no hay fotos. El programa se imprime sin la franja de arriba.
          Puedes subir hasta {MAX_FOTOS_ENCABEZADO}: salen en fila, en el orden
          en el que las subas.
        </p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {fotos.map((f, i) => (
            <div key={f.id} className="w-40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/territorios/fotos/${f.id}?v=${f.version}`}
                alt={`Foto ${i + 1} del encabezado`}
                className="h-24 w-40 rounded-lg border border-border object-cover"
              />
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-xs text-muted">{tamanoLegible(f.bytes)}</span>
                <button
                  type="button"
                  onClick={() => quitar(f.id)}
                  disabled={trabajando}
                  className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
                >
                  Quitar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error ? <Alert tone="error">{error}</Alert> : null}
      {paso ? <p className="text-xs text-muted">{paso}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <label className={lleno || trabajando ? `${BOTON_ARCHIVO} pointer-events-none opacity-50` : BOTON_ARCHIVO}>
          📷 Añadir fotos
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={lleno || trabajando}
            onChange={alElegir}
          />
        </label>
        {lleno ? (
          <span className="text-xs text-muted">
            Ya están las {MAX_FOTOS_ENCABEZADO} que caben.
          </span>
        ) : null}
      </div>
    </div>
  );
}
