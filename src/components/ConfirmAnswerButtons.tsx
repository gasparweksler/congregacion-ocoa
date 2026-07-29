"use client";

import { useState } from "react";

// Botones de respuesta del enlace público. Al pulsar, muestra de inmediato
// "Registrando respuesta…" y navega, evitando pulsar dos veces.
export function ConfirmAnswerButtons({ token }: { token: string }) {
  const [submitting, setSubmitting] = useState<null | "si" | "no">(null);

  if (submitting) {
    return (
      <div className="mt-5 flex flex-col items-center gap-3 rounded-xl border border-border bg-slate-50 px-4 py-6 text-center">
        <span
          aria-hidden
          className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
        />
        <p className="text-sm font-medium text-foreground">
          Registrando respuesta…
        </p>
      </div>
    );
  }

  const go = (r: "si" | "no") => {
    setSubmitting(r);
    window.location.href = `/confirmar/${token}?r=${r}`;
  };

  return (
    <div className="mt-5 flex flex-col gap-2">
      <button
        type="button"
        onClick={() => go("si")}
        className="flex items-center justify-center rounded-xl border border-emerald-600 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
      >
        ✅ Sí, confirmo
      </button>
      <button
        type="button"
        onClick={() => go("no")}
        className="flex items-center justify-center rounded-xl border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50"
      >
        ❌ No podré, necesito reemplazo
      </button>
    </div>
  );
}
