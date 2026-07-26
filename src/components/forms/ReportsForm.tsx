"use client";

import { useState } from "react";
import { useActionState } from "react";
import { saveReportsAction } from "@/server/report-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
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
  const [state, action] = useActionState(saveReportsAction, EMPTY_FORM_STATE);
  const ids = rows.map((r) => r.id).join(",");
  // Si el período ya tiene informes, el formulario inicia BLOQUEADO.
  const [locked, setLocked] = useState(!!submitted);

  // Estado por fila: "Precursor Auxiliar" (controla habilitar Horas) y comentario.
  const [aux, setAux] = useState<Record<string, boolean>>(
    () => Object.fromEntries(rows.map((r) => [r.id, r.auxiliaryPioneer])),
  );
  const [comments, setComments] = useState<Record<string, string>>(
    () => Object.fromEntries(rows.map((r) => [r.id, r.comment ?? ""])),
  );
  // Fila cuya modal de comentario está abierta (o null).
  const [openComment, setOpenComment] = useState<string | null>(null);

  const openRow = rows.find((r) => r.id === openComment) ?? null;

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
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      {submitted ? (
        <Alert tone="info">
          📌 Informe subido por <strong>{submitted.by}</strong> el{" "}
          {submitted.at}.
          {locked
            ? " Está bloqueado para evitar cambios; pulsa “Editar informe” para modificarlo."
            : " Modo edición activado."}
        </Alert>
      ) : null}

      {/* Mobile-first: cada publicador es una tarjeta con campos verticales.
          Nunca hay scroll horizontal; se completa haciendo scroll vertical.
          Un <fieldset disabled> bloquea todos los campos cuando está bloqueado. */}
      <fieldset disabled={locked} className="min-w-0 border-0 p-0">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => {
            const hoursEnabled = r.isPioneer || aux[r.id];
            const hasComment = (comments[r.id] ?? "").trim().length > 0;
            const fieldInput =
              "w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";
            return (
              <div
                key={r.id}
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

                  {/* Comentarios */}
                  <div>
                    <input
                      type="hidden"
                      name={`c_${r.id}`}
                      value={comments[r.id] ?? ""}
                    />
                    <button
                      type="button"
                      onClick={() => setOpenComment(r.id)}
                      className={
                        "flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors " +
                        (hasComment
                          ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                          : "border-border text-muted hover:bg-slate-50")
                      }
                    >
                      💬 {hasComment ? "Ver / editar comentario" : "Añadir comentario"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </fieldset>

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
            <div className="mt-4 flex justify-end gap-2">
              {comments[openRow.id] ? (
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
                Listo
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
