"use client";

import { useActionState } from "react";
import { saveReportsAction } from "@/server/report-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Alert, Badge, Table, Th, Td } from "@/components/ui";
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
};

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

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="ids" value={ids} />

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <Table>
        <thead>
          <tr>
            <Th>Publicador</Th>
            <Th className="text-center">¿Participó?</Th>
            <Th className="text-center">Cursos bíblicos</Th>
            <Th className="text-center">Horas</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td>
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
              </Td>
              <Td className="text-center">
                <input
                  type="checkbox"
                  name={`p_${r.id}`}
                  defaultChecked={r.participated}
                  className="h-5 w-5 rounded border-border accent-[var(--primary)]"
                />
              </Td>
              <Td className="text-center">
                <input
                  type="number"
                  name={`b_${r.id}`}
                  defaultValue={r.bibleStudies}
                  min={0}
                  max={999}
                  className="w-20 rounded-lg border border-border px-2 py-1 text-center text-sm"
                />
              </Td>
              <Td className="text-center">
                {r.isPioneer ? (
                  <input
                    type="number"
                    name={`h_${r.id}`}
                    defaultValue={r.hours ?? 0}
                    min={0}
                    max={9999}
                    className="w-24 rounded-lg border border-border px-2 py-1 text-center text-sm"
                  />
                ) : (
                  <span className="text-muted">—</span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        <SubmitButton pendingText="Guardando…">Guardar informes</SubmitButton>
      </div>
    </form>
  );
}
