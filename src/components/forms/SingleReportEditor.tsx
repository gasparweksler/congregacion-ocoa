"use client";

import { useState } from "react";
import { useActionState } from "react";
import { updateSingleReportAction } from "@/server/report-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Label, Input, Select, Alert, Button, Badge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { statusLabel, monthName, MONTH_NAMES } from "@/lib/constants";
import { yearOptions } from "@/lib/period";
import { statusTone } from "@/lib/ui-helpers";

export type SingleReportData = {
  id: string;
  status: string;
  isPioneer: boolean;
  participated: boolean;
  bibleStudies: number;
  hours: number | null;
  auxiliaryPioneer: boolean;
  comment: string;
  year: number;
  month: number;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-foreground">{children}</span>
    </div>
  );
}

export function SingleReportEditor({ report }: { report: SingleReportData }) {
  const [state, action] = useActionState(
    updateSingleReportAction,
    EMPTY_FORM_STATE,
  );
  const [editing, setEditing] = useState(false);
  const [aux, setAux] = useState(report.auxiliaryPioneer);

  const hoursEnabled = report.isPioneer || aux;

  if (!editing) {
    return (
      <div className="space-y-4">
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}
        <div className="rounded-xl border border-border p-4">
          <Field label="Período">
            {monthName(report.month)} {report.year}
          </Field>
          <Field label="Estado">
            <Badge tone={statusTone(report.status)}>
              {statusLabel(report.status)}
            </Badge>
          </Field>
          <Field label="¿Participó?">
            {report.participated ? "Sí" : "No"}
          </Field>
          <Field label="Precursor auxiliar (este mes)">
            {report.auxiliaryPioneer ? "Sí" : "No"}
          </Field>
          <Field label="Cursos bíblicos">{report.bibleStudies}</Field>
          <Field label="Horas">
            {report.isPioneer || report.auxiliaryPioneer
              ? (report.hours ?? 0)
              : "—"}
          </Field>
          <Field label="Comentario">{report.comment || "—"}</Field>
        </div>
        <Button onClick={() => setEditing(true)}>✏️ Editar</Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={report.id} />
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="month">Mes</Label>
          <Select id="month" name="month" defaultValue={String(report.month)}>
            {MONTH_NAMES.map((m, i) => (
              <option key={i} value={i + 1}>
                {m}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="year">Año</Label>
          <Select id="year" name="year" defaultValue={String(report.year)}>
            {yearOptions().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          name="participated"
          defaultChecked={report.participated}
          className="h-4 w-4 rounded border-border"
        />
        ¿Participó en la predicación?
      </label>

      {!report.isPioneer ? (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="auxiliaryPioneer"
            checked={aux}
            onChange={(e) => setAux(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Precursor Auxiliar este mes (habilita horas)
        </label>
      ) : null}

      <div>
        <Label htmlFor="bibleStudies">Cursos bíblicos</Label>
        <Input
          id="bibleStudies"
          name="bibleStudies"
          type="number"
          min={0}
          max={999}
          defaultValue={report.bibleStudies}
          className="w-32"
        />
      </div>

      <div>
        <Label htmlFor="hours">Horas</Label>
        <Input
          id="hours"
          name="hours"
          type="number"
          min={0}
          max={9999}
          defaultValue={report.hours ?? 0}
          disabled={!hoursEnabled}
          className="w-32 disabled:bg-slate-100 disabled:text-slate-400"
        />
        {!hoursEnabled ? (
          <p className="mt-1 text-xs text-muted">
            Activa “Precursor Auxiliar” para registrar horas.
          </p>
        ) : null}
      </div>

      <div>
        <Label htmlFor="comment">Comentario (opcional)</Label>
        <textarea
          id="comment"
          name="comment"
          rows={3}
          defaultValue={report.comment}
          className="w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
        />
      </div>

      <div className="flex gap-2">
        <SubmitButton pendingText="Guardando…">Guardar cambios</SubmitButton>
        <Button variant="secondary" onClick={() => setEditing(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
