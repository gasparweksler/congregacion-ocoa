"use client";

// Límite de error de la sección autenticada. Captura fallos del servidor
// (p. ej. la base de datos de Supabase "fría" que tarda o rechaza la primera
// conexión) y muestra un mensaje amable con botón de reintentar, en vez del
// error crudo del servidor.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    // Deja constancia en la consola para diagnóstico, sin mostrarlo al usuario.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span aria-hidden className="text-4xl">
        ⏳
      </span>
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          No pudimos cargar la información
        </h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          El servidor puede estar despertando. Por favor reintente en unos
          segundos.
        </p>
      </div>
      <Button
        onClick={() => {
          setRetrying(true);
          reset();
        }}
        disabled={retrying}
      >
        {retrying ? "Reintentando…" : "🔄 Por favor reintente"}
      </Button>
    </div>
  );
}
