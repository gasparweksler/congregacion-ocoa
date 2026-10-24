"use client";

// Botón que ejecuta una Server Action pidiendo confirmación antes. Útil para
// acciones destructivas (eliminar).
//
// La confirmación usa la ventana propia de la aplicación (ConfirmDialog), no el
// confirm() del navegador: así todas las acciones que no se pueden deshacer se
// preguntan igual en toda la app.

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/cn";
import { ConfirmDialog } from "@/components/ConfirmDialog";

/** Separa el título ("¿Eliminar X?") del detalle, si el texto trae ambos. */
function partir(texto: string): { title: string; description: string } {
  const t = texto.trim();
  const corte = t.indexOf("? ");
  if (corte > 0) {
    return {
      title: t.slice(0, corte + 1),
      description: t.slice(corte + 2).trim(),
    };
  }
  return { title: t, description: "Esta acción no se puede deshacer." };
}

function Dialogo({
  open,
  texto,
  onCancel,
}: {
  open: boolean;
  texto: string;
  onCancel: () => void;
}) {
  // Dentro del <form>, así sabe cuándo se está enviando.
  const { pending } = useFormStatus();
  const { title, description } = partir(texto);
  return (
    <ConfirmDialog
      open={open}
      title={title}
      description={description}
      confirmLabel="Sí, continuar"
      pendingLabel="Un momento…"
      pending={pending}
      onCancel={onCancel}
    />
  );
}

export function ConfirmButton({
  action,
  hidden,
  confirmText,
  children,
  className,
  variant = "danger",
}: {
  action: (formData: FormData) => void | Promise<void>;
  hidden?: Record<string, string>;
  confirmText: string;
  children: React.ReactNode;
  className?: string;
  variant?: "danger" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const styles =
    variant === "danger"
      ? "text-red-600 hover:bg-red-50"
      : "text-slate-600 hover:bg-slate-100";

  return (
    <form action={action} className="inline">
      {hidden
        ? Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))
        : null}

      {/* Abre la confirmación; quien envía de verdad es el botón del diálogo. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
          styles,
          className,
        )}
      >
        {children}
      </button>

      <Dialogo open={open} texto={confirmText} onCancel={() => setOpen(false)} />
    </form>
  );
}
