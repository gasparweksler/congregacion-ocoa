"use client";

// Ventana de confirmación propia de la aplicación, para las acciones que no se
// pueden deshacer.
//
// Sustituye al confirm() del navegador: aquel sale con el estilo del sistema,
// no admite explicar nada y se acaba ignorando por costumbre. Aquí el título y
// el detalle se leen, y el botón que confirma dice lo que va a pasar.

import { useEffect, useRef } from "react";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pendingLabel,
  pending,
  onCancel,
  onConfirm,
  extra,
}: {
  open: boolean;
  title: string;
  description: string;
  /** Texto del botón que confirma; dice la acción, no "Aceptar". */
  confirmLabel: string;
  pendingLabel?: string;
  pending?: boolean;
  onCancel: () => void;
  /**
   * Qué hacer al confirmar. Si no se indica, el botón envía el formulario que
   * contiene al diálogo (así lo usa ConfirmButton).
   */
  onConfirm?: () => void;
  /** Controles propios de la acción (una casilla, un aviso extra…). */
  extra?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  // <dialog> modal: bloquea el resto de la página y cierra con Escape.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      onCancel={onCancel}
      // m-auto: el reset de Tailwind quita el margen que centra un <dialog>.
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/40"
    >
      <div className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>

        {extra}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type={onConfirm ? "button" : "submit"}
            onClick={onConfirm}
            disabled={pending}
            className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-wait disabled:opacity-70"
          >
            {pending ? (pendingLabel ?? "Un momento…") : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
