"use client";

// Las encuestas de meses anteriores: cuántas respuestas tuvo cada una, cómo
// volver a abrirla para consultarla y cómo borrarla entera.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { etiquetaDelMes } from "@/lib/capitanes";
import { borrarEncuesta, type Encuesta } from "@/server/capitanes-actions";
import { Alert, Badge } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { FormState } from "@/server/actions-shared";

export function HistorialCapitanes({
  historial,
  actual,
}: {
  historial: Encuesta[];
  /** La que se está mirando ahora, para marcarla. */
  actual: string | null;
}) {
  const router = useRouter();
  const [borrando, setBorrando] = useState<Encuesta | null>(null);
  const [aviso, setAviso] = useState<FormState>({});
  const [trabajando, startTransition] = useTransition();

  if (historial.length === 0) {
    return (
      <p className="text-sm text-muted">
        Todavía no hay ninguna encuesta. La primera que crees aparecerá aquí.
      </p>
    );
  }

  const eliminar = () => {
    const id = borrando?.id;
    if (!id) return;
    setAviso({});
    startTransition(async () => {
      const r = await borrarEncuesta(id);
      setAviso(r);
      setBorrando(null);
      if (r.success) router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {aviso.error ? <Alert tone="error">{aviso.error}</Alert> : null}
      {aviso.success ? <Alert tone="success">{aviso.success}</Alert> : null}

      <ul className="space-y-2">
        {historial.map((e) => (
          <li
            key={e.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-white px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="font-medium capitalize text-foreground">
                {etiquetaDelMes(e.year, e.month)}
                {e.id === actual ? (
                  <span className="ml-2 align-middle">
                    <Badge tone="blue">Mirando ahora</Badge>
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-muted">
                {e.respuestas === 1
                  ? "1 respuesta"
                  : `${e.respuestas} respuestas`}{" "}
                · {e.open ? "abierta" : "cerrada"}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  router.push(
                    `/territorios/capitanes?anio=${e.year}&mes=${e.month}`,
                  );
                  router.refresh();
                }}
                className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium text-foreground hover:bg-slate-50"
              >
                👁️ Ver
              </button>
              <button
                type="button"
                onClick={() => setBorrando(e)}
                className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                🗑️ Borrar
              </button>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={borrando !== null}
        title={`¿Borrar la encuesta de ${
          borrando ? etiquetaDelMes(borrando.year, borrando.month) : ""
        }?`}
        description={`Se borra la encuesta y las ${borrando?.respuestas ?? 0} respuesta(s) de ese mes, y su enlace deja de funcionar. No se toca nada más de Ocoa: ni los horarios, ni los usuarios, ni los otros meses.`}
        confirmLabel="Borrar la encuesta"
        pendingLabel="Borrando…"
        pending={trabajando}
        onCancel={() => setBorrando(null)}
        onConfirm={eliminar}
      />
    </div>
  );
}
