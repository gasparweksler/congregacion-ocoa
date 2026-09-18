"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  saveReportsAction,
  type ReportsFormState,
} from "@/server/report-actions";
import { Alert, Badge, Button } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { statusLabel } from "@/lib/constants";
import { statusTone } from "@/lib/ui-helpers";

export type ReportRow = {
  id: string;
  fullName: string;
  status: string;
  isPioneer: boolean;
  participated: boolean;
  bibleStudies: number;
  hours: number | null;
  auxiliaryPioneer: boolean;
  comment: string;
};

// Interruptor Sí/No reutilizable.
function Toggle({
  name,
  checked,
  onChange,
}: {
  name: string;
  checked: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative h-6 w-11 rounded-full bg-slate-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-5"
      />
      <span className="inline w-6 text-left text-sm font-semibold text-muted peer-checked:hidden">
        No
      </span>
      <span className="hidden w-6 text-left text-sm font-semibold text-primary peer-checked:inline">
        Sí
      </span>
    </label>
  );
}

export function ReportsForm({
  year,
  month,
  rows,
  submitted,
}: {
  year: number;
  month: number;
  rows: ReportRow[];
  submitted: { by: string; at: string } | null;
}) {
  const router = useRouter();
  const [state, action] = useActionState<ReportsFormState, FormData>(
    saveReportsAction,
    {},
  );
  const ids = rows.map((r) => r.id).join(",");
  // Si el período ya tiene informes, el formulario inicia BLOQUEADO.
  const [locked, setLocked] = useState(!!submitted);
  // Quién subió el informe (se actualiza al guardar, sin recargar la página).
  const [info, setInfo] = useState(submitted);

  // Datos mostrados. Arrancan con los del servidor y, tras guardar, se
  // reemplazan por los que la acción vuelve a LEER de la base de datos.
  const [data, setData] = useState<ReportRow[]>(rows);
  // Cambiar esta versión remonta las tarjetas: así los campos no controlados
  // (cursos, horas, "¿Participó?") toman los valores recién guardados.
  const [version, setVersion] = useState(0);

  // Estado por fila: "Precursor Auxiliar" (controla habilitar Horas) y comentario.
  const [aux, setAux] = useState<Record<string, boolean>>(
    () => Object.fromEntries(rows.map((r) => [r.id, r.auxiliaryPioneer])),
  );
  const [comments, setComments] = useState<Record<string, string>>(
    () => Object.fromEntries(rows.map((r) => [r.id, r.comment ?? ""])),
  );
  // Fila cuya modal de comentario está abierta (o null).
  const [openComment, setOpenComment] = useState<string | null>(null);

  const openRow = data.find((r) => r.id === openComment) ?? null;

  // Guardado confirmado: se adopta, durante el render, lo que la acción volvió
  // a LEER de la base de datos. Así el mensaje de éxito y los datos nuevos
  // aparecen en la misma pintada: nunca se ve información antigua.
  const [applied, setApplied] = useState<ReportsFormState | null>(null);
  if (state.success && state !== applied) {
    setApplied(state);
    if (state.rows?.length) {
      const saved = new Map(state.rows.map((r) => [r.id, r] as const));
      setData((prev) =>
        prev.map((r) => {
          const s = saved.get(r.id);
          return s ? { ...r, ...s } : r;
        }),
      );
      setAux((prev) => {
        const next = { ...prev };
        for (const s of saved.values()) next[s.id] = s.auxiliaryPioneer;
        return next;
      });
      setComments((prev) => {
        const next = { ...prev };
        for (const s of saved.values()) next[s.id] = s.comment;
        return next;
      });
      // Remonta las tarjetas para que los campos no controlados tomen los
      // valores guardados.
      setVersion((v) => v + 1);
    }
    if (state.submittedBy && state.submittedAt) {
      setInfo({ by: state.submittedBy, at: state.submittedAt });
    }
    // Vuelve a quedar bloqueado, como un informe ya subido.
    setLocked(true);
  }

  // Refresca el resto de la página (seguimiento de entrega) sin recargar la
  // aplicación: solo se vuelven a pedir los datos al servidor.
  useEffect(() => {
    if (!state.success) return;
    router.refresh();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [state, router]);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("¿Guardar los informes de este período?")) {
          e.preventDefault();
        }
      }}
      className="space-y-4"
    >
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="ids" value={ids} />

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? (
        <div className="flex items-center gap-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3.5 text-emerald-800 shadow-sm">
          <span aria-hidden className="text-2xl">
            ✅
          </span>
          <div>
            <p className="text-sm font-semibold">{state.success}</p>
            {state.detail ? (
              <p className="text-xs text-emerald-700">{state.detail}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {info ? (
        <Alert tone="info">
          📌 Informe subido por <strong>{info.by}</strong> el {info.at}.
          {locked
            ? " Está bloqueado para evitar cambios; pulsa “Editar informe” para modificarlo."
            : " Modo edición activado."}
        </Alert>
      ) : null}

      {/* Mobile-first: cada publicador es una tarjeta con campos verticales.
          Nunca hay scroll horizontal; se completa haciendo scroll vertical.
          En cada tarjeta un <fieldset disabled> bloquea los campos cuando el
          informe está guardado; el botón de comentario queda FUERA de ese
          bloqueo para poder leer el comentario sin editarlo. */}
      <div className="min-w-0">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.map((r) => {
            const hoursEnabled = r.isPioneer || aux[r.id];
            const hasComment = (comments[r.id] ?? "").trim().length > 0;
            const fieldInput =
              "w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";
            return (
              <div
                // La versión fuerza el remontaje tras guardar, para que los
                // campos no controlados muestren los valores guardados.
                key={`${r.id}-${version}`}
                className="rounded-2xl border-2 border-border bg-surface p-4 shadow-sm"
              >
                {/* Nombre del publicador */}
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                  <span className="font-semibold text-foreground">
                    {r.fullName}
                  </span>
                  <Badge tone={statusTone(r.status)}>
                    {statusLabel(r.status)}
                  </Badge>
                </div>

                <div className="space-y-3">
                  <fieldset
                    disabled={locked}
                    className="min-w-0 space-y-3 border-0 p-0"
                  >
                  {/* Participó (switch Sí/No) */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">
                      ¿Participó?
                    </span>
                    <ParticipatedToggle id={r.id} initial={r.participated} />
                  </div>

                  {/* Precursor Auxiliar (solo para no precursores) */}
                  {r.isPioneer ? (
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-muted">
                      Precursor (siempre informa horas)
                    </p>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-foreground">
                        Precursor Auxiliar
                      </span>
                      <Toggle
                        name={`aux_${r.id}`}
                        checked={aux[r.id] ?? false}
                        onChange={(v) =>
                          setAux((prev) => ({ ...prev, [r.id]: v }))
                        }
                      />
                    </div>
                  )}

                  {/* Cursos bíblicos */}
                  <div>
                    <label
                      htmlFor={`b_${r.id}`}
                      className="mb-1 block text-sm font-medium text-foreground"
                    >
                      Cursos bíblicos
                    </label>
                    <input
                      id={`b_${r.id}`}
                      type="number"
                      inputMode="numeric"
                      name={`b_${r.id}`}
                      defaultValue={r.bibleStudies}
                      min={0}
                      max={999}
                      className={fieldInput}
                    />
                  </div>

                  {/* Horas (solo habilitado para precursores / auxiliar del mes) */}
                  <div>
                    <label
                      htmlFor={`h_${r.id}`}
                      className="mb-1 block text-sm font-medium text-foreground"
                    >
                      Horas de predicación
                    </label>
                    <input
                      id={`h_${r.id}`}
                      type="number"
                      inputMode="numeric"
                      name={`h_${r.id}`}
                      defaultValue={r.hours ?? 0}
                      min={0}
                      max={9999}
                      disabled={!hoursEnabled}
                      className={fieldInput}
                    />
                    {!hoursEnabled ? (
                      <p className="mt-1 text-xs text-muted">
                        Solo para precursores (activa “Precursor Auxiliar”).
                      </p>
                    ) : null}
                  </div>
                  </fieldset>

                  {/* Comentarios (fuera del bloqueo: siempre se puede leer) */}
                  <div>
                    <input
                      type="hidden"
                      name={`c_${r.id}`}
                      value={comments[r.id] ?? ""}
                    />
                    <button
                      type="button"
                      onClick={() => setOpenComment(r.id)}
                      // Guardado y sin comentario: no hay nada que mostrar.
                      disabled={locked && !hasComment}
                      className={
                        "flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 " +
                        (hasComment
                          ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                          : "border-border text-muted hover:bg-slate-50")
                      }
                    >
                      💬{" "}
                      {locked
                        ? hasComment
                          ? "Ver comentario"
                          : "Sin comentario"
                        : hasComment
                          ? "Ver / editar comentario"
                          : "Añadir comentario"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        {locked ? (
          <Button onClick={() => setLocked(false)}>✏️ Editar informe</Button>
        ) : (
          <SubmitButton pendingText="Guardando…">Guardar informes</SubmitButton>
        )}
      </div>

      {/* --- Modal de comentario --- */}
      {openRow ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpenComment(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              Comentario
            </h3>
            <p className="mt-0.5 text-sm text-muted">{openRow.fullName}</p>
            {locked ? (
              // Informe guardado: el comentario solo se lee, no se edita.
              <>
                <p className="mt-3 whitespace-pre-wrap break-words rounded-xl border border-border bg-slate-50 px-3.5 py-2.5 text-sm text-foreground">
                  {comments[openRow.id]}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Solo lectura. Para modificarlo pulsa “Editar informe”.
                </p>
              </>
            ) : (
              <>
                <textarea
                  autoFocus
                  value={comments[openRow.id] ?? ""}
                  onChange={(e) =>
                    setComments((prev) => ({
                      ...prev,
                      [openRow.id]: e.target.value,
                    }))
                  }
                  rows={4}
                  placeholder="Escribe un comentario opcional…"
                  className="mt-3 w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-foreground placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
                />
                <p className="mt-1 text-xs text-muted">
                  El comentario es opcional. Se guardará al pulsar “Guardar
                  informes”.
                </p>
              </>
            )}
            <div className="mt-4 flex justify-end gap-2">
              {!locked && comments[openRow.id] ? (
                <Button
                  variant="ghost"
                  onClick={() =>
                    setComments((prev) => ({ ...prev, [openRow.id]: "" }))
                  }
                >
                  Borrar
                </Button>
              ) : null}
              <Button variant="primary" onClick={() => setOpenComment(null)}>
                {locked ? "Cerrar" : "Listo"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}

// "Participó" como interruptor no controlado (no depende de otros campos).
function ParticipatedToggle({
  id,
  initial,
}: {
  id: string;
  initial: boolean;
}) {
  const [checked, setChecked] = useState(initial);
  return (
    <Toggle name={`p_${id}`} checked={checked} onChange={setChecked} />
  );
}
