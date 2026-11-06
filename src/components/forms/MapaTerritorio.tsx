"use client";

// ============================================================================
//  El mapa de UN territorio: se ve, se amplía y se cambia.
//
//  Para cambiarlo vale una imagen (JPG, PNG) o un PDF de una página: el
//  navegador lo dibuja y sube solo la imagen, igual que con el PDF completo
//  de todos los mapas.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { deleteMapaAction } from "@/server/territorio-actions";
import { imagenReducida, paginasComoImagenes } from "@/lib/pdf-a-imagenes";
import { tamanoLegible } from "@/lib/territorios";

const BOTON_ARCHIVO =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-border bg-white px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-slate-50";

export function MapaTerritorio({
  territoryId,
  titulo,
  /** Momento del último cambio: así el navegador no enseña el mapa viejo. */
  version,
  bytes,
}: {
  territoryId: string;
  titulo: string;
  version: number | null;
  bytes: number | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [ampliado, setAmpliado] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [paso, setPaso] = useState("");
  const [error, setError] = useState("");

  const src = version
    ? `/api/territorios/${territoryId}/mapa?v=${version}`
    : null;

  // Cerrar la vista ampliada con la tecla Escape, como cualquier ventana.
  useEffect(() => {
    if (!ampliado) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAmpliado(false);
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [ampliado]);

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setSubiendo(true);
    try {
      let blob: Blob;
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        setPaso("Dibujando el mapa…");
        const hojas = await paginasComoImagenes(await file.arrayBuffer());
        if (hojas.length === 0) {
          setError("No se pudo dibujar ninguna página de ese PDF.");
          return;
        }
        if (hojas.length > 1) {
          setPaso(`El PDF trae ${hojas.length} páginas: se usa la primera.`);
        }
        blob = hojas[0].blob;
      } else if (file.type.startsWith("image/")) {
        setPaso("Preparando la imagen…");
        blob = (await imagenReducida(file)).blob;
      } else {
        setError("Elige una imagen (JPG o PNG) o un PDF.");
        return;
      }

      setPaso("Guardando…");
      const cuerpo = new FormData();
      cuerpo.append("imagen", new File([blob], "mapa.jpg", { type: "image/jpeg" }));
      const r = await fetch(`/api/territorios/${territoryId}/mapa`, {
        method: "POST",
        body: cuerpo,
      });
      if (!r.ok) {
        const detalle = await r
          .json()
          .then((d: { error?: string }) => d.error)
          .catch(() => "");
        setError(detalle || `No se pudo guardar (error ${r.status}).`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? `No se pudo preparar el mapa: ${err.message}`
          : "No se pudo preparar el mapa.",
      );
    } finally {
      setSubiendo(false);
      setPaso("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      {src ? (
        <button
          type="button"
          onClick={() => setAmpliado(true)}
          title="Ampliar el mapa"
          className="block w-full overflow-hidden rounded-2xl border border-border bg-white transition-colors hover:border-primary"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={`Mapa del territorio ${titulo}`}
            className="max-h-[28rem] w-full object-contain"
          />
        </button>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-slate-50 px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">
            Este territorio todavía no tiene mapa.
          </p>
          <p className="mt-1 text-sm text-muted">
            Súbelo aquí, o sube de una vez el PDF con los mapas de todos.
          </p>
        </div>
      )}

      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex flex-wrap items-center gap-3">
        <label className={BOTON_ARCHIVO}>
          <span aria-hidden>🗺️</span>
          {subiendo ? (paso || "Guardando…") : src ? "Cambiar el mapa" : "Subir el mapa"}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf,.pdf"
            className="hidden"
            disabled={subiendo}
            onChange={alElegir}
          />
        </label>

        {src ? (
          <>
            <Button variant="secondary" onClick={() => setAmpliado(true)}>
              🔍 Ampliar
            </Button>
            <ConfirmButton
              action={deleteMapaAction}
              hidden={{ id: territoryId }}
              confirmText={`¿Quitar el mapa de "${titulo}"? El territorio no se borra, solo su mapa.`}
            >
              Quitar el mapa
            </ConfirmButton>
          </>
        ) : null}

        {bytes !== null ? (
          <span className="text-xs text-muted">Ocupa {tamanoLegible(bytes)}</span>
        ) : null}
      </div>

      {ampliado && src ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Mapa del territorio ${titulo}`}
          onClick={() => setAmpliado(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <div className="max-h-full max-w-full overflow-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`Mapa del territorio ${titulo}`}
              onClick={(e) => e.stopPropagation()}
              className="mx-auto max-w-none cursor-zoom-out rounded-lg bg-white"
            />
          </div>
          <button
            type="button"
            onClick={() => setAmpliado(false)}
            className="absolute right-4 top-4 rounded-[10px] bg-white px-4 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-slate-100"
          >
            Cerrar ✕
          </button>
          <p className="absolute bottom-4 left-0 right-0 text-center text-xs text-white/70">
            Pulsa fuera de la imagen, o la tecla Esc, para cerrar.
          </p>
        </div>
      ) : null}
    </div>
  );
}
