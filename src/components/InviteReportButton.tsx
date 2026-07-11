"use client";

export function InviteReportButton({ periodLabel }: { periodLabel: string }) {
  const openWhatsApp = () => {
    const cp = String.fromCodePoint;
    const smile = cp(0x1f60a);
    const wave = cp(0x1f44b);
    const pray = cp(0x1f64f);
    const sparkles = cp(0x2728);
    const point = cp(0x1f449);
    const heart = cp(0x1f49a);
    const party = cp(0x1f389);

    const msg =
      `Hola querido Hermano ${smile}${wave}\n\n` +
      `Un recordatorio cariñoso: ya puedes subir tu informe de predicación` +
      (periodLabel ? ` de *${periodLabel}*` : "") +
      `. Es muy rápido y sencillo ${pray}${sparkles}\n\n` +
      `Ingresa aquí e inicia sesión:\n` +
      `${point} https://congregacion-ocoa.vercel.app/login\n\n` +
      `¡Muchísimas gracias por tu trabajo! ${heart}${party}`;

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
