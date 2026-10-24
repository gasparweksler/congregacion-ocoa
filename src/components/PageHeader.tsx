import * as React from "react";

// Encabezado estándar de página: título, descripción opcional y acciones.
// Estilo editorial: una barra de acento vertical, título grande y una línea
// divisoria inferior que separa con claridad el encabezado del contenido.
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {/* Título grande y apretado, sin barra de acento ni línea inferior:
              en canva.com la jerarquía la marca el tamaño, no los adornos. */}
          <h1 className="text-[1.75rem] font-extrabold leading-tight text-foreground sm:text-[2.125rem]">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm text-muted sm:text-[0.9375rem]">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
