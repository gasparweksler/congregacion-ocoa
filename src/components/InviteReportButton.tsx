"use client";

export function InviteReportButton({ periodLabel }: { periodLabel: string }) {
  const openWhatsApp = () => {
    const cp = String.fromCodePoint;
    const smile = cp(0x1f60a);
    const pray = cp(0x1f64f);
    const heart = cp(0x1f49a);
    const point = cp(0x1f449);

    const msg =
      `Hola querido Hermano/a ${smile}\n\n` +
      `Un recordatorio cariñoso: ya puedes subir tu informe de predicación` +
      (periodLabel ? ` de *${periodLabel}*` : "") +
      `. Es muy rápido y sencillo ${pray}\n\n` +
      `Ingresa aquí e inicia sesión:\n` +
      `${point} https://congregacion-ocoa.vercel.app/login\n\n` +
      `¡Muchas gracias por tu esfuerzo! ${heart}`;

    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <button
      type="button"
      onClick={openWhatsApp}
      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
    >
      📲 Invitar a subir informe
    </button>
  );
}
