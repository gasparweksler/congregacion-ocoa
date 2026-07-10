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
}: {
  year: number;
  month: number;
  rows: ReportRow[];
}) {
  const [state, action] = useActionState(saveReportsAction, EMPTY_FORM_STATE);
  const ids = rows.map((r) => r.id).join(",");

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

      {/* Región con scroll: en móvil el encabezado queda fijo (sticky). */}
      <div className="max-h-[68vh] overflow-auto rounded-xl border border-border md:max-h-none md:overflow-x-auto md:rounded-none md:border-0">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-20 bg-surface shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className="whitespace-nowrap border-b border-border bg-surface px-3 py-2.5 text-left font-semibold text-muted">
                Publicador
              </th>
              <th className="whitespace-nowrap border-b border-border bg-surface px-3 py-2.5 text-center font-semibold text-muted">
                Participó
              </th>
              <th className="whitespace-nowrap border-b border-border bg-surface px-3 py-2.5 text-center font-semibold text-muted">
                Precursor Auxiliar
              </th>
              <th className="whitespace-nowrap border-b border-border bg-surface px-3 py-2.5 text-center font-semibold text-muted">
                Cursos bíblicos
              </th>
              <th className="whitespace-nowrap border-b border-border bg-surface px-3 py-2.5 text-center font-semibold text-muted">
                Horas
              </th>
              <th className="whitespace-nowrap border-b border-border bg-surface px-3 py-2.5 text-center font-semibold text-muted">
                Comentario
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const hoursEnabled = r.isPioneer || aux[r.id];
              const hasComment = (comments[r.id] ?? "").trim().length > 0;
              return (
                <tr key={r.id} className="align-middle">
                  {/* 1. Publicador */}
                  <td className="border-b border-border px-3 py-2">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">
                        {r.fullName}
                      </span>
                      <span>
                        <Badge tone={statusTone(r.status)}>
                          {statusLabel(r.status)}
                        </Badge>
                      </span>
                    </div>
                  </td>

                  {/* 2. Participó */}
                  <td className="border-b border-border px-3 py-2 text-center">
                    <ParticipatedToggle id={r.id} initial={r.participated} />
                  </td>

                  {/* 3. Precursor Auxiliar */}
                  <td className="border-b border-border px-3 py-2 text-center">
                    {r.isPioneer ? (
                      <span className="text-xs text-muted">
                        Precursor
                        <br />
                        (siempre)
                      </span>
                    ) : (
                      <Toggle
                        name={`aux_${r.id}`}
                        checked={aux[r.id] ?? false}
                        onChange={(v) =>
                          setAux((prev) => ({ ...prev, [r.id]: v }))
                        }
                      />
                    )}
                  </td>

                  {/* 4. Cursos bíblicos */}
                  <td className="border-b border-border px-3 py-2 text-center">
                    <input
                      type="number"
                      name={`b_${r.id}`}
                      defaultValue={r.bibleStudies}
                      min={0}
                      max={999}
                      className="w-20 rounded-lg border border-border px-2 py-1 text-center text-sm"
                    />
                  </td>

                  {/* 5. Horas (según Precursor Auxiliar / precursor permanente) */}
                  <td className="border-b border-border px-3 py-2 text-center">
                    <input
                      type="number"
                      name={`h_${r.id}`}
                      defaultValue={r.hours ?? 0}
                      min={0}
                      max={9999}
                      disabled={!hoursEnabled}
                      title={
                        hoursEnabled
                          ? undefined
                          : "Activa 'Precursor Auxiliar' para registrar horas"
                      }
                      className="w-24 rounded-lg border border-border px-2 py-1 text-center text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </td>

                  {/* 6. Comentario */}
                  <td className="border-b border-border px-3 py-2 text-center">
                    <input
                      type="hidden"
                      name={`c_${r.id}`}
                      value={comments[r.id] ?? ""}
                    />
                    <button
                      type="button"
                      onClick={() => setOpenComment(r.id)}
                      className={
                        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors " +
                        (hasComment
                          ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                          : "border-border text-muted hover:bg-slate-50")
                      }
                    >
                      💬 {hasComment ? "Ver comentario" : "Añadir comentario"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        <SubmitButton pendingText="Guardando…">Guardar informes</SubmitButton>
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
