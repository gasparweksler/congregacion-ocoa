"use client";

// Panel de mantenimiento de datos (acciones destructivas con confirmación).
//
// Borrar informes de un año recorre toda la congregación y tarda: el botón
// queda deshabilitado y la ventana de confirmación enseña el avance, para que
// no se vuelva a pulsar pensando que no pasó nada.
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Select, Label, Alert } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  deleteReportsByYearAction,
  deleteAllReportsAction,
  deleteAuditLogsAction,
} from "@/server/maintenance-actions";
import { yearOptions } from "@/lib/period";
import { cn } from "@/lib/cn";

/**
 * Botón que pide confirmación y, mientras el borrado corre, lo dice. Va dentro
 * del <form> para que useFormStatus vea el envío.
 */
function BorrarBoton({
  children,
  pendingText,
  title,
  description,
  className,
}: {
  children: React.ReactNode;
  pendingText: string;
  title: string;
  description: string;
  className: string;
}) {
  const { pending } = useFormStatus();
  const [open, setOpen] = useState(false);
  // Al acabar el borrado se cierra la confirmación sola.
  const enviado = useRef(false);
  if (pending) enviado.current = true;
  useEffect(() => {
    if (!pending && enviado.current) {
      enviado.current = false;
      setOpen(false);
    }
  }, [pending]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        aria-busy={pending}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-wait disabled:opacity-70",
          className,
        )}
      >
        {pending ? (
          <>
            <span
              aria-hidden
              className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
            {pendingText}
          </>
        ) : (
          children
        )}
      </button>

      <ConfirmDialog
        open={open}
        title={title}
        description={description}
        confirmLabel="Sí, eliminar"
        pendingLabel={pendingText}
        pending={pending}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

export function MaintenancePanel({
  /** Cuántas líneas de auditoría hay ahora, para decirlo en el botón. */
  lineasAuditoria,
}: {
  lineasAuditoria: number;
}) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [meses, setMeses] = useState(24);

  return (
    <div className="space-y-5">
      <Alert tone="warning">
        Estas acciones eliminan informes de forma permanente y no se pueden
        deshacer. Los publicadores, grupos y usuarios NO se eliminan.
      </Alert>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div>
          <Label>Eliminar informes de un año</Label>
          <Select
            className="w-32"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {yearOptions(2020).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
        <form action={deleteReportsByYearAction}>
          <input type="hidden" name="year" value={year} />
          <BorrarBoton
            pendingText="Eliminando…"
            title={`¿Eliminar todos los informes de ${year}?`}
            description="Se borran los informes de ese año de toda la congregación. Esta acción no se puede deshacer."
            className="bg-red-600 text-white hover:bg-red-700"
          >
            Eliminar año {year}
          </BorrarBoton>
        </form>
      </div>

      <div className="border-t border-border pt-4">
        <form action={deleteAllReportsAction}>
          <BorrarBoton
            pendingText="Eliminando el historial…"
            title="¿Eliminar todos los informes históricos?"
            description="Se borran los informes de todos los años. Esta acción no se puede deshacer."
            className="border border-red-300 text-red-700 hover:bg-red-50"
          >
            Eliminar todos los informes históricos
          </BorrarBoton>
        </form>
      </div>

      {/* --- Registro de auditoría --- */}
      <div className="border-t border-border pt-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div>
            <Label>Eliminar auditoría anterior a</Label>
            <Select
              className="w-44"
              value={meses}
              onChange={(e) => setMeses(Number(e.target.value))}
            >
              <option value={24}>2 años</option>
              <option value={12}>1 año</option>
              <option value={6}>6 meses</option>
              <option value={0}>Todo el registro</option>
            </Select>
          </div>
          <form action={deleteAuditLogsAction}>
            <input type="hidden" name="meses" value={meses} />
            <BorrarBoton
              pendingText="Eliminando…"
              title={
                meses > 0
                  ? `¿Eliminar la auditoría anterior a ${meses} meses?`
                  : "¿Eliminar el registro de auditoría entero?"
              }
              description="Se borra solo el registro de quién cambió qué. Los publicadores, informes, reuniones y asignaciones NO se tocan."
              className="border border-red-300 text-red-700 hover:bg-red-50"
            >
              Eliminar Auditorías
            </BorrarBoton>
          </form>
        </div>
        <p className="mt-2 text-xs text-muted">
          Ahora mismo hay <strong>{lineasAuditoria}</strong> línea(s). Es lo
          único que crece sin freno: una por cada cambio, y nunca se borra sola.
          Sirve para que esta pantalla siga siendo manejable —{" "}
          <strong>no para recuperar espacio</strong>: al borrar filas, la base
          reutiliza el hueco pero su tamaño no baja.
        </p>
      </div>
    </div>
  );
}
