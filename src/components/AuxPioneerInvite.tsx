"use client";

import { useState, useTransition } from "react";
import { setAllow15hAction } from "@/server/aux-pioneer-actions";

export type InvitePeriod = {
  year: number;
  month: number;
  label: string; // "Septiembre 2026"
  monthLower: string; // "septiembre"
  allow15: boolean; // ¿se permite inscripción de 15 horas ese mes?
};

// Genera el mensaje de invitación para el mes elegido (curso o siguiente) y
// ofrece "Enviar por WhatsApp" (mismo patrón que Confirmar asignaciones) y
// "Copiar mensaje" (portapapeles).
export function AuxPioneerInvite({
  curso,
  siguiente,
}: {
  curso: InvitePeriod;
  siguiente: InvitePeriod;
}) {
  const [which, setWhich] = useState<"curso" | "siguiente">("curso");
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();
  // Estado local del switch de 15 horas por mes (curso/siguiente).
  const [allow15, setAllow15] = useState<{ curso: boolean; siguiente: boolean }>(
    { curso: curso.allow15, siguiente: siguiente.allow15 },
  );
  const period = which === "curso" ? curso : siguiente;
  const fifteenOn = allow15[which];

  const toggleFifteen = () => {
    const next = !fifteenOn;
    setAllow15((prev) => ({ ...prev, [which]: next }));
    startTransition(() => {
      void setAllow15hAction(period.year, period.month, next);
    });
  };

  const buildMessage = () => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const cp = String.fromCodePoint;
    const E = {
      smile: cp(0x1f60a), wave: cp(0x1f44b), pray: cp(0x1f64f),
      point: cp(0x1f449), heart: cp(0x1f49a),
    };
    const link = `${origin}/precursor-auxiliar?anio=${period.year}&mes=${period.month}`;
    return (
      `Hola querido Hermano ${E.smile}${E.wave}\n\n` +
      `Queremos invitarte a considerar servir como *Precursor Auxiliar* durante ` +
      `*${period.label}*. ${E.pray}\n\n` +
      `Si deseas inscribirte, toca el siguiente enlace:\n` +
      `${E.point} Sí, deseo ser Precursor Auxiliar durante ${period.monthLower}:\n` +
      `${link}\n\n` +
      `¡Muchísimas gracias por tu disposición! ${E.heart}`
    );
  };

  const message = buildMessage();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
    } catch {
      /* ignore */
    }
  };

  const tabBtn = (active: boolean) =>
    "flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors " +
    (active
      ? "bg-primary text-white shadow-sm"
      : "border border-border bg-white text-foreground hover:bg-slate-50");

  return (
    <div className="space-y-4">
      {/* Selector de mes: solo mes en curso o mes siguiente */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setWhich("curso")}
          className={tabBtn(which === "curso")}
        >
          Mes en curso
          <span className="ml-1 opacity-80">({curso.label})</span>
        </button>
        <button
          type="button"
          onClick={() => setWhich("siguiente")}
          className={tabBtn(which === "siguiente")}
        >
          Mes siguiente
          <span className="ml-1 opacity-80">({siguiente.label})</span>
        </button>
      </div>

      <p className="text-sm text-foreground">
        Gestionando inscripciones para:{" "}
        <strong className="text-primary">{period.label}</strong>
      </p>

      {/* Switch: activar/desactivar la opción de 15 horas para este mes */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-slate-50 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            Permitir inscripción de 15 horas
          </p>
          <p className="text-xs text-muted">
            {fifteenOn
              ? "Los hermanos pueden elegir 15 o 30 horas."
              : "Este mes solo se podrán inscribir a 30 horas."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={fifteenOn}
          aria-label="Permitir inscripción de 15 horas"
          onClick={toggleFifteen}
          className={
            "relative h-6 w-11 shrink-0 rounded-full transition-colors " +
            (fifteenOn ? "bg-primary" : "bg-slate-300")
          }
        >
          <span
            aria-hidden
            className={
              "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform " +
              (fifteenOn ? "translate-x-5" : "")
            }
          />
        </button>
      </div>

      {/* Vista previa del mensaje */}
      <textarea
        readOnly
        value={message}
        rows={7}
        className="w-full resize-none rounded-xl border border-border bg-slate-50 px-3.5 py-2.5 text-sm text-foreground"
      />

      <div className="flex flex-wrap gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
        >
          📱 Enviar por WhatsApp
        </a>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-slate-50"
        >
          {copied ? "✓ Mensaje copiado correctamente" : "📋 Copiar mensaje"}
        </button>
      </div>
    </div>
  );
}
