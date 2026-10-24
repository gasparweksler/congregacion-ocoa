"use client";

import { useState, useTransition } from "react";
import { setMonthlyResponsibility } from "@/server/monthly-resp-actions";
import { MONTHLY_RESPONSIBILITIES } from "@/lib/constants";
import { weekdayNameOfISO } from "@/lib/dates";
import type { MonthlyMeetingRow } from "@/server/monthly-resp-actions";

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
  // Fechas plegadas. Arrancan plegadas las que ya están completas.
  const [plegadas, setPlegadas] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const todas = MONTHLY_RESPONSIBILITIES.every((x) =>
        (r.values[x.key]?.name ?? "").trim(),
      );
      if (todas) s.add(r.dateISO);
    }
    return s;
  });

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

  // Si los datos del servidor cambian (p. ej. tras la asignación automática),
  // hay que volver a cargarlos: antes el estado se fijaba una sola vez y las
  // casillas seguían viéndose vacías aunque ya estuvieran guardadas.
  // Se ajusta en render, no en un efecto, para que no haya un parpadeo.
  const firma = rows
    .map(
      (r) =>
        `${r.dateISO}:${MONTHLY_RESPONSIBILITIES.map((x) => r.values[x.key]?.name ?? "").join("|")}`,
    )
    .join("//");
  const [firmaPrevia, setFirmaPrevia] = useState(firma);
  if (firma !== firmaPrevia) {
    setFirmaPrevia(firma);
    const v = initialValues();
    setLocal(v);
    setSaved(v);
  }

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

      {rows.map((row) => {
        const puestas = MONTHLY_RESPONSIBILITIES.filter((r) =>
          (local[`${row.dateISO}_${r.key}`] ?? "").trim(),
        ).length;
        const completa = puestas === MONTHLY_RESPONSIBILITIES.length;
        return (
        <details
          key={row.dateISO}
          // Las fechas ya completas se pliegan: con 8 casillas por fecha, un
          // mes entero son ~80 campos de scroll en el móvil.
          open={!plegadas.has(row.dateISO)}
          onToggle={(e) => {
            const abierto = (e.currentTarget as HTMLDetailsElement).open;
            setPlegadas((prev) => {
              const next = new Set(prev);
              if (abierto) next.delete(row.dateISO);
              else next.add(row.dateISO);
              return next;
            });
          }}
          className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 border-b border-border bg-slate-50 px-4 py-2.5">
            <span className="min-w-0 font-semibold text-foreground">
              {weekdayNameOfISO(row.dateISO)} {formatDateISO(row.dateISO)}
            </span>
            <span className="flex shrink-0 items-center gap-2 text-[0.7rem]">
              {!row.meetingId ? (
                <span className="text-muted">Sin asignar aún</span>
              ) : null}
              <span
                className={
                  completa ? "font-semibold text-emerald-700" : "text-muted"
                }
              >
                {puestas} de {MONTHLY_RESPONSIBILITIES.length}
              </span>
              <span aria-hidden className="text-muted">
                {plegadas.has(row.dateISO) ? "▸" : "▾"}
              </span>
            </span>
          </summary>
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
                            // Corto a propósito: en el móvil el campo es
                            // estrecho y el texto largo salía cortado.
                            placeholder="Nombre…"
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
        </details>
        );
      })}
    </div>
  );
}
