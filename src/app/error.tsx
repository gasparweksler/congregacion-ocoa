"use client";

// Límite de error a nivel raíz (páginas públicas: login, confirmar). Muestra un
// mensaje amable con reintentar si el servidor/BD falla la primera conexión.
import { useEffect, useState } from "react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <span aria-hidden className="text-4xl">
        ⏳
      </span>
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          No pudimos cargar la página
        </h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          El servidor puede estar despertando. Por favor reintente en unos
          segundos.
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          setRetrying(true);
          reset();
        }}
        disabled={retrying}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--primary-hover)] disabled:opacity-60"
      >
        {retrying ? "Reintentando…" : "🔄 Por favor reintente"}
      </button>
    </div>
  );
}
