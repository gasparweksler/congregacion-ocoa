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
    <div className="mb-8 border-b border-border pb-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-1 h-8 w-1.5 shrink-0 rounded-full bg-primary"
          />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-1.5 max-w-2xl text-sm text-muted">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
