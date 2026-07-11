"use client";

import { useState } from "react";

export function InviteReportButton({ periodLabel }: { periodLabel: string }) {
  const [copied, setCopied] = useState(false);

  const buildMessage = () => {
    const cp = String.fromCodePoint;
    const smile = cp(0x1f60a);
    const wave = cp(0x1f44b);
    const pray = cp(0x1f64f);
    const sparkles = cp(0x2728);
    const point = cp(0x1f449);
    const heart = cp(0x1f49a);
    const party = cp(0x1f389);

    return (
      `Hola querido Hermano ${smile}${wave}\n\n` +
      `Un recordatorio cariñoso: ya puedes subir el informe de predicación de tu grupo` +
      (periodLabel ? ` de ${periodLabel}` : "") +
      `. Es muy rápido y sencillo ${pray}${sparkles}\n\n` +
      `Ingresa aquí e inicia sesión:\n` +
      `${point} https://congregacion-ocoa.vercel.app/login\n\n` +
      `¡Muchísimas gracias por tu trabajo! ${heart}${party}`
    );
  };

  const openWhatsApp = () => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(buildMessage())}`,
      "_blank",
    );
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(buildMessage());
      setCopied(true);
      setTimeout(() => setCopied(false), 6000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={openWhatsApp}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
        >
          📲 Invitar a subir informe
        </button>
        <button
          type="button"
          onClick={copyText}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-slate-50"
        >
          {copied ? "✓ Copiado" : "📋 Copiar texto de invitación"}
        </button>
      </div>
      {copied ? (
        <span className="text-xs text-emerald-700">
          Pégalo en WhatsApp con Ctrl+V (los emojis se verán perfectos).
        </span>
      ) : null}
    </div>
  );
}
