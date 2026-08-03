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

  const initialValues = () => {
    const o: Record<string, string> = {};
    for (const r of rows)
      for (const resp of MONTHLY_RESPONSIBILITIES)
        o[`${r.dateISO}_${resp.key}`] = r.values[resp.key]?.name ?? "";
    return o;
  };
  // Valor mostrado (mientras se escribe) y último valor guardado (para no
  // repetir guardados innecesarios).
  const [local, setLocal] = useState<Record<string, string>>(initialValues);
  const [saved, setSaved] = useState<Record<string, string>>(initialValues);

  // Guarda el valor de una celda si cambió respecto al último guardado.
  const commit = (row: MonthlyMeetingRow, key: string, explicit?: string) => {
    const cellKey = `${row.dateISO}_${key}`;
    const value = (explicit ?? local[cellKey] ?? "").trim();
    if (value === (saved[cellKey] ?? "")) return;
    setSaved((prev) => ({ ...prev, [cellKey]: value }));
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

  const inputClass =
    "w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-60";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Lista de hermanos para autocompletar (igual que en Asignaciones). */}
      <datalist id="resp-hermanos">
        {publishers.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

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
                const value = local[cellKey] ?? "";
                const setVal = (v: string) =>
                  setLocal((prev) => ({ ...prev, [cellKey]: v }));
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
                        {resp.kind === "group" ? (
                          // Limpieza: desplegable con los grupos registrados.
                          <select
                            value={value}
                            disabled={pending}
                            onChange={(e) => {
                              // Elegir grupo: refleja y guarda de inmediato.
                              setVal(e.target.value);
                              commit(row, resp.key, e.target.value);
                            }}
                            aria-label={`${resp.label} — ${row.dateISO}`}
                            className={inputClass}
                          >
                            <option value="">— Elegir grupo —</option>
                            {value && !groups.includes(value) ? (
                              <option value={value}>{value}</option>
                            ) : null}
                            {groups.map((g) => (
                              <option key={g} value={g}>
                                {g}
                              </option>
                            ))}
                          </select>
                        ) : (
                          // Hermano: campo de escritura con autocompletado.
                          <input
                            type="text"
                            list="resp-hermanos"
                            value={value}
                            onChange={(e) => setVal(e.target.value)}
                            onBlur={() => commit(row, resp.key)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            placeholder="Escribe el nombre…"
                            autoComplete="off"
                            aria-label={`${resp.label} — ${row.dateISO}`}
                            className={inputClass}
                          />
                        )}
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
