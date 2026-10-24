"use client";

// Botón de eliminar reuniones con una alerta de confirmación propia (no la del
// navegador), porque hay que preguntar algo más que "sí o no": si se conserva
// el historial de asignaciones para las Estadísticas.
//
// La casilla viene marcada: lo normal es conservarlo. Desmarcarla sirve para el
// caso contrario —una importación mal hecha— que no debe ensuciar las
// estadísticas.

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert } from "@/components/ui";

export function DeleteMeetingButton({
  action,
  hidden,
  title,
  description,
  children,
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  hidden?: Record<string, string>;
  /** Encabezado de la alerta. */
  title: string;
  /** Qué se va a eliminar exactamente. */
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [keep, setKeep] = useState(true);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // <dialog> modal: bloquea el resto de la página y cierra con Escape.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setKeep(true);
          setOpen(true);
        }}
        className={cn(
          "rounded-md px-2.5 py-1 text-sm font-medium text-red-600 transition-colors hover:bg-red-50",
          className,
        )}
      >
        {children}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onCancel={() => setOpen(false)}
        // m-auto: el reset de Tailwind quita el margen que centra un <dialog>.
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <form action={action} className="space-y-4 p-5">
          {hidden
            ? Object.entries(hidden).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))
            : null}
          {/* Lo que decide la casilla viaja en el formulario. */}
          <input type="hidden" name="keepHistory" value={keep ? "si" : "no"} />

          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <p className="mt-1 text-sm text-muted">{description}</p>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-surface p-3">
            <input
              type="checkbox"
              checked={keep}
              onChange={(e) => setKeep(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span className="min-w-0 text-sm">
              <span className="font-semibold text-foreground">
                Guardar el historial en las Estadísticas
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                Se conserva quién tuvo cada parte, en qué fecha, si confirmó y si
                se marcó como realizada. Las Estadísticas de Asignaciones lo
                seguirán contando.
              </span>
            </span>
          </label>

          {!keep ? (
            <Alert tone="error">
              Sin guardar el historial, estas asignaciones desaparecen de las
              Estadísticas y no se pueden recuperar. Úsalo solo si lo que vas a
              borrar es una carga equivocada.
            </Alert>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-slate-50"
            >
              Cancelar
            </button>
            <SubmitButton pendingText="Eliminando…" variant="danger">
              {keep ? "Eliminar y guardar historial" : "Eliminar sin historial"}
            </SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
