"use client";

import { useState } from "react";
import { useActionState } from "react";
import { moveReportsPeriodAction } from "@/server/report-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Label, Select, Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { MONTH_NAMES } from "@/lib/constants";

export function MoveReportsForm({
  years,
  groups,
}: {
  years: number[];
  groups: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(
    moveReportsPeriodAction,
    EMPTY_FORM_STATE,
  );
  const [open, setOpen] = useState(false);

  const monthOptions = (
    <>
      <option value="">— Mes —</option>
      {MONTH_NAMES.map((m, i) => (
        <option key={i} value={i + 1}>
          {m}
        </option>
      ))}
    </>
  );
  const yearOpts = (
    <>
      <option value="">— Año —</option>
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </>
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-slate-50"
      >
        🔧 Corregir mes/año de informes <span>{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <div className="mt-3 rounded-2xl border border-border bg-surface p-4">
          <p className="mb-3 text-sm text-muted">
            Mueve todos los informes de un período a otro (ej. lo cargado en
            Julio hacia Junio). Puedes limitarlo a un grupo.
          </p>

          <form
            action={action}
            onSubmit={(e) => {
              if (
                !window.confirm(
                  "¿Mover los informes al nuevo período? Si ya hay informes en el destino, se reemplazarán.",
                )
              )
                e.preventDefault();
            }}
            className="space-y-3"
          >
            {state.error ? <Alert tone="error">{state.error}</Alert> : null}
            {state.success ? (
              <Alert tone="success">{state.success}</Alert>
            ) : null}

            <div>
              <Label htmlFor="grupo">Grupo</Label>
              <Select id="grupo" name="grupo" defaultValue="">
                <option value="">Todos los grupos</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </div>

            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Desde (período con error)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Select name="fromMonth" defaultValue="" required>
                {monthOptions}
              </Select>
              <Select name="fromYear" defaultValue="" required>
                {yearOpts}
              </Select>
            </div>

            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Hacia (período correcto)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Select name="toMonth" defaultValue="" required>
                {monthOptions}
              </Select>
              <Select name="toYear" defaultValue="" required>
                {yearOpts}
              </Select>
            </div>

            <SubmitButton pendingText="Moviendo…">Mover informes</SubmitButton>
          </form>
        </div>
      ) : null}
    </div>
  );
}
