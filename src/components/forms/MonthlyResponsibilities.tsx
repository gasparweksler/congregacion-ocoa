"use client";

import { useState, useTransition } from "react";
import { setMonthlyResponsibility } from "@/server/monthly-resp-actions";
import { MONTHLY_RESPONSIBILITIES } from "@/lib/constants";
import type { MonthlyMeetingRow } from "@/server/monthly-resp-actions";

const DAY_LABEL: Record<string, string> = {
  JUEVES: "Jueves",
  SABADO: "Sábado",
};

function formatDateISO(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  return `${d} de ${meses[m - 1]}`;
}

export function MonthlyResponsibilities({
  rows,
  publishers,
  groups,
}: {
  rows: MonthlyMeetingRow[];
  publishers: string[];
  groups: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [savedKey, setSavedKey] = useState<string | null>(null);
  // Estado local por celda para reflejar el cambio al instante.
  const [local, setLocal] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const r of rows)
      for (const resp of MONTHLY_RESPONSIBILITIES)
        o[`${r.dateISO}_${resp.key}`] = r.values[resp.key]?.name ?? "";
    return o;
  });

  const onChange = (
    row: MonthlyMeetingRow,
    key: string,
    value: string,
  ) => {
    const cellKey = `${row.dateISO}_${key}`;
    setLocal((prev) => ({ ...prev, [cellKey]: value }));
    setSavedKey(null);
    startTransition(async () => {
      await setMonthlyResponsibility(row.dateISO, row.day, key, value);
      setSavedKey(cellKey);
      setTimeout(() => setSavedKey((k) => (k === cellKey ? null : k)), 2000);
    });
  };

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">
        No hay jueves ni sábados en el mes seleccionado.
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {rows.map((row) => (
        <div
          key={row.dateISO}
          className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border bg-slate-50 px-4 py-2.5">
            <span className="font-semibold text-foreground">
              {DAY_LABEL[row.day]} {formatDateISO(row.dateISO)}
            </span>
            {!row.meetingId ? (
              <span className="text-[0.7rem] text-muted">Sin asignar aún</span>
            ) : null}
          </div>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {MONTHLY_RESPONSIBILITIES.map((resp) => {
                const cellKey = `${row.dateISO}_${resp.key}`;
                const options = resp.kind === "group" ? groups : publishers;
                const value = local[cellKey] ?? "";
                const missing = value && !options.includes(value);
                return (
                  <tr key={resp.key} className="border-b border-border/60">
                    <td className="w-1/2 px-3 py-2 align-middle">
                      <span
                        className={
                          "font-medium " +
                          (resp.kind === "group"
                            ? "text-emerald-700"
                            : "text-foreground")
                        }
                      >
                        {resp.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <select
                          value={value}
                          disabled={pending}
                          onChange={(e) =>
                            onChange(row, resp.key, e.target.value)
                          }
                          aria-label={`${resp.label} — ${row.dateISO}`}
                          className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-60"
                        >
                          <option value="">
                            {resp.kind === "group"
                              ? "— Elegir grupo —"
                              : "— Elegir hermano —"}
                          </option>
                          {missing ? (
                            <option value={value}>{value}</option>
                          ) : null}
                          {options.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                        {savedKey === cellKey ? (
                          <span
                            aria-hidden
                            className="shrink-0 text-emerald-600"
                            title="Guardado"
                          >
                            ✓
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
