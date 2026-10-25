"use client";

// Descargar la planilla de publicadores y cargarla rellena.
//
// Nada se guarda al subir el archivo: primero se enseña qué se va a crear, qué
// filas tienen errores y cuáles ya existen. Solo al confirmar se crean, por
// tandas, para poder mostrar el avance real.

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  readPublishersSheetAction,
  createPublishersAction,
  type ReadResult,
} from "@/server/publisher-import-actions";
import { Alert, Button } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { DownloadButton } from "@/components/DownloadButton";

const INICIAL: ReadResult = {
  ok: false,
  nuevos: [],
  errores: [],
  repetidos: [],
  gruposDisponibles: [],
};

/** Cuántos se crean por tanda: suficiente para que el avance se vea moverse. */
const TANDA = 10;

export function PublishersImport() {
  const router = useRouter();
  const [lectura, leer] = useActionState(readPublishersSheetAction, INICIAL);
  const [creando, crear] = useTransition();
  const [progreso, setProgreso] = useState<{
    hechos: number;
    total: number;
    fase: "creando" | "sincronizando";
  } | null>(null);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(
    null,
  );
  // Tras confirmar se oculta la vista previa, sin perder el resultado.
  const [aplicado, setAplicado] = useState(false);

  const confirmar = () => {
    const todos = lectura.nuevos;
    if (todos.length === 0) return;
    setResultado(null);

    crear(async () => {
      let hechos = 0;
      setProgreso({ hechos: 0, total: todos.length, fase: "creando" });

      for (let i = 0; i < todos.length; i += TANDA) {
        const tanda = todos.slice(i, i + TANDA);
        const esUltima = i + TANDA >= todos.length;
        const r = await createPublishersAction(tanda, {
          anotar: esUltima,
          total: todos.length,
        });
        if (!r.ok) {
          setResultado({
            ok: false,
            texto: `${r.message ?? "No se pudo continuar."} Se crearon ${hechos} antes de parar.`,
          });
          setProgreso(null);
          return;
        }
        hechos += r.creados;
        setProgreso({ hechos, total: todos.length, fase: "creando" });
      }

      // Refrescar la lista y los contadores de la aplicación.
      setProgreso({ hechos, total: todos.length, fase: "sincronizando" });
      router.refresh();
      setProgreso(null);
      setAplicado(true);
      setResultado({
        ok: true,
        texto: `Importación completada: ${hechos} publicador(es) creados.`,
      });
    });
  };

  const hayVistaPrevia = lectura.ok && !aplicado;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <DownloadButton
          href="/api/plantilla-publicadores"
          pendingText="Preparando…"
        >
          📄 Descargar Planilla Excel
        </DownloadButton>
      </div>

      <form
        action={(fd) => {
          setAplicado(false);
          setResultado(null);
          leer(fd);
        }}
        className="space-y-2"
      >
        <label
          htmlFor="pub-file"
          className="block text-sm font-medium text-foreground"
        >
          Cargar Publicadores desde Planilla Excel
        </label>
        <input
          id="pub-file"
          type="file"
          name="file"
          accept=".xlsx"
          required
          className="block w-full rounded-[10px] border border-border bg-white text-sm text-foreground file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-slate-200"
        />
        <SubmitButton pendingText="Revisando la planilla…" variant="secondary">
          Revisar planilla
        </SubmitButton>
        <p className="text-xs text-muted">
          Al subirla no se crea nada todavía: primero verás qué se va a dar de
          alta y qué filas tienen algún problema.
        </p>
      </form>

      {lectura.error ? <Alert tone="error">{lectura.error}</Alert> : null}
      {resultado ? (
        <Alert tone={resultado.ok ? "success" : "error"}>{resultado.texto}</Alert>
      ) : null}

      {progreso ? (
        <Alert tone="warning">
          <strong>
            {progreso.fase === "creando"
              ? `Creados ${progreso.hechos} de ${progreso.total}…`
              : "Sincronizando información…"}
          </strong>
          <br />
          No cierres ni recargues la página.
        </Alert>
      ) : null}

      {hayVistaPrevia ? (
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Vista previa
            </h3>
            <p className="mt-0.5 text-sm text-muted">
              {lectura.nuevos.length} para dar de alta
              {lectura.repetidos.length > 0
                ? ` · ${lectura.repetidos.length} ya existen`
                : ""}
              {lectura.errores.length > 0
                ? ` · ${lectura.errores.length} con problemas`
                : ""}
            </p>
          </div>

          {lectura.errores.length > 0 ? (
            <Alert tone="error">
              <strong>Filas con problemas (no se darán de alta):</strong>
              <ul className="mt-1.5 list-disc space-y-1 pl-5">
                {lectura.errores.slice(0, 20).map((e, i) => (
                  <li key={i}>
                    <strong>Fila {e.row}</strong>
                    {e.column ? ` · ${e.column}` : ""}: {e.message}
                  </li>
                ))}
              </ul>
              {lectura.errores.length > 20 ? (
                <p className="mt-1">…y {lectura.errores.length - 20} más.</p>
              ) : null}
            </Alert>
          ) : null}

          {lectura.repetidos.length > 0 ? (
            <Alert tone="warning">
              <strong>Ya existen y se conservan como están:</strong>{" "}
              {lectura.repetidos
                .slice(0, 12)
                .map((r) => `${r.fullName} (fila ${r.row})`)
                .join(" · ")}
              {lectura.repetidos.length > 12
                ? ` …y ${lectura.repetidos.length - 12} más`
                : ""}
            </Alert>
          ) : null}

          {lectura.nuevos.length > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">
                Ver los {lectura.nuevos.length} que se darán de alta
              </summary>
              <ul className="mt-2 space-y-1">
                {lectura.nuevos.map((n) => (
                  <li key={n.row} className="flex flex-wrap gap-x-2">
                    <span className="font-medium text-foreground">
                      {n.fullName}
                    </span>
                    <span className="text-muted">{n.groupName}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={confirmar}
              disabled={creando || lectura.nuevos.length === 0}
            >
              {creando
                ? "Creando…"
                : `Crear ${lectura.nuevos.length} publicador(es)`}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAplicado(true)}
              disabled={creando}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
