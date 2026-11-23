"use client";

// Crear la encuesta de un mes y repartirla: copiar el enlace o mandarlo por
// WhatsApp, igual que la invitación de precursor auxiliar.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { appOrigin } from "@/lib/app-url";
import { etiquetaDelMes } from "@/lib/capitanes";
import {
  cambiarEstadoEncuesta,
  crearEncuesta,
  type Encuesta,
} from "@/server/capitanes-actions";
import { Alert, Badge, Button } from "@/components/ui";
import type { FormState } from "@/server/actions-shared";

export function InvitacionCapitanes({
  year,
  month,
  encuesta,
}: {
  year: number;
  month: number;
  /** La encuesta de ese mes, si ya está creada. */
  encuesta: Encuesta | null;
}) {
  const router = useRouter();
  const [aviso, setAviso] = useState<FormState>({});
  const [copiado, setCopiado] = useState<"enlace" | "mensaje" | null>(null);
  const [trabajando, startTransition] = useTransition();

  const mes = etiquetaDelMes(year, month);
  const enlace = encuesta ? `${appOrigin()}/capitanes/${encuesta.token}` : "";

  const mensaje =
    `Hola querido hermano 😊\n\n` +
    `Estamos organizando los *capitanes de predicación* de *${mes}*.\n\n` +
    `👉 Toca el enlace y marca en el calendario los días en que puedes:\n` +
    `${enlace}\n\n` +
    `¡Muchas gracias por tu disposición! 💚`;

  const copiar = async (texto: string, cual: "enlace" | "mensaje") => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(cual);
      setTimeout(() => setCopiado(null), 4000);
    } catch {
      /* si el navegador no deja copiar, el texto está a la vista igual */
    }
  };

  const hacer = (quien: () => Promise<FormState>) => {
    setAviso({});
    startTransition(async () => {
      const r = await quien();
      setAviso(r);
      if (r.success) router.refresh();
    });
  };

  if (!encuesta) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-foreground">
          Todavía no hay encuesta para <strong>{mes}</strong>. Al crearla se
          genera un enlace propio de ese mes para repartir entre los hermanos.
        </p>
        {aviso.error ? <Alert tone="error">{aviso.error}</Alert> : null}
        <Button
          onClick={() => hacer(() => crearEncuesta(year, month))}
          disabled={trabajando}
        >
          {trabajando ? "Creando…" : `✉️ Crear la encuesta de ${mes}`}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={encuesta.open ? "green" : "slate"}>
          {encuesta.open ? "Abierta" : "Cerrada"}
        </Badge>
        <span className="text-sm text-muted">
          {encuesta.respuestas === 1
            ? "1 respuesta recibida"
            : `${encuesta.respuestas} respuestas recibidas`}
        </span>
      </div>

      {/* El enlace, a la vista y listo para copiar */}
      <div>
        <p className="mb-1 text-sm font-medium text-foreground">
          Enlace de la encuesta de {mes}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={enlace}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-xl border border-border bg-slate-50 px-3.5 py-2.5 font-mono text-sm text-foreground sm:flex-1"
          />
          <button
            type="button"
            onClick={() => copiar(enlace, "enlace")}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-slate-50"
          >
            {copiado === "enlace" ? "✓ Enlace copiado" : "🔗 Copiar enlace"}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">
          Quien lo abra solo puede dejar su propia disponibilidad: no ve lo que
          han contestado los demás ni entra a ninguna pantalla de
          administración.
        </p>
      </div>

      {/* El mensaje para WhatsApp */}
      <div>
        <p className="mb-1 text-sm font-medium text-foreground">
          Mensaje para enviar
        </p>
        <textarea
          readOnly
          value={mensaje}
          rows={7}
          className="w-full resize-none rounded-xl border border-border bg-slate-50 px-3.5 py-2.5 text-sm text-foreground"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            📱 Enviar por WhatsApp
          </a>
          <button
            type="button"
            onClick={() => copiar(mensaje, "mensaje")}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-slate-50"
          >
            {copiado === "mensaje" ? "✓ Mensaje copiado" : "📋 Copiar mensaje"}
          </button>
        </div>
      </div>

      {aviso.error ? <Alert tone="error">{aviso.error}</Alert> : null}
      {aviso.success ? <Alert tone="success">{aviso.success}</Alert> : null}

      <div className="border-t border-border pt-3">
        <Button
          variant="secondary"
          onClick={() =>
            hacer(() => cambiarEstadoEncuesta(encuesta.id, !encuesta.open))
          }
          disabled={trabajando}
        >
          {encuesta.open
            ? "🔒 Cerrar la encuesta"
            : "🔓 Volver a abrir la encuesta"}
        </Button>
        <p className="mt-1 text-xs text-muted">
          {encuesta.open
            ? "Mientras está abierta, los hermanos pueden responder y corregir lo suyo."
            : "Cerrada, el enlace avisa de que ya no se admiten respuestas. Tú sí puedes seguir corrigiendo."}
        </p>
      </div>
    </div>
  );
}
