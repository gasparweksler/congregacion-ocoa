"use client";

// Botón para descargar un archivo que el servidor tiene que generar (PDF,
// Excel, ZIP…).
//
// Antes eran enlaces normales: el navegador no muestra nada mientras el
// servidor trabaja, así que parecía que la aplicación se había quedado
// colgada, y se podía pulsar una y otra vez lanzando varias generaciones a la
// vez. Aquí se pide el archivo con fetch, se enseña el avance, el botón queda
// deshabilitado, y si falla se puede reintentar sabiendo qué pasó.

import { useRef, useState } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-white shadow-sm hover:bg-[var(--primary-hover)]",
  secondary:
    "border border-border bg-surface text-foreground hover:bg-slate-50",
};

/**
 * La descarga en sí, para los sitios que no quieren el botón de abajo sino su
 * propio diseño (p. ej. las tarjetas de Exportar).
 */
export function useFileDownload() {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const enCurso = useRef(false);

  const descargar = async (href: string) => {
    if (enCurso.current) return;
    enCurso.current = true;
    setPending(href);
    setError(null);
    try {
      const res = await fetch(href);
      if (!res.ok) {
        let detalle = "";
        try {
          const j = (await res.json()) as { error?: string };
          detalle = j.error ?? "";
        } catch {
          /* no era JSON */
        }
        throw new Error(detalle || `El servidor respondió ${res.status}.`);
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
      const nombre = m ? decodeURIComponent(m[1]) : "descarga";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "No se pudo generar el archivo.",
      );
    } finally {
      enCurso.current = false;
      setPending(null);
    }
  };

  return { descargar, pending, error };
}

export function DownloadButton({
  href,
  children,
  variant = "secondary",
  className,
  /** Texto mientras se genera; por defecto "Generando…". */
  pendingText = "Generando…",
  /** Aviso bajo el botón cuando la espera puede ser larga. */
  hint,
  disabled,
}: {
  href: string;
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
  pendingText?: string;
  hint?: string;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Evita una segunda descarga aunque el navegador dispare el clic dos veces.
  const enCurso = useRef(false);

  const descargar = async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(href);
      if (!res.ok) {
        // El servidor responde JSON cuando rechaza la petición.
        let detalle = "";
        try {
          const j = (await res.json()) as { error?: string };
          detalle = j.error ?? "";
        } catch {
          /* no era JSON: se queda el mensaje genérico */
        }
        throw new Error(detalle || `El servidor respondió ${res.status}.`);
      }

      const blob = await res.blob();
      // Nombre del archivo: el que indica el servidor.
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
      const nombre = m ? decodeURIComponent(m[1]) : "descarga";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Se libera después, para que al navegador le dé tiempo a empezar.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "No se pudo generar el archivo.",
      );
    } finally {
      enCurso.current = false;
      setPending(false);
    }
  };

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={descargar}
        disabled={pending || disabled}
        aria-busy={pending}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-[10px] px-5 py-2.5 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-70",
          variants[variant],
          className,
        )}
      >
        {pending ? (
          <>
            <span
              aria-hidden
              className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
            {pendingText}
          </>
        ) : (
          children
        )}
      </button>

      {pending && hint ? (
        <p className="mt-1.5 text-xs text-muted">{hint}</p>
      ) : null}

      {error ? (
        <p className="mt-1.5 text-xs text-red-600">
          {error} <button type="button" onClick={descargar} className="underline">
            Reintentar
          </button>
        </p>
      ) : null}
    </div>
  );
}
