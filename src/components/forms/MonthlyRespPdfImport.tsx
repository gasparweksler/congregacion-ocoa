"use client";

// ============================================================================
//  "Cargar desde PDF" — Todas las Responsabilidades del mes.
//  Flujo: elegir PDF -> "Procesando PDF…" -> vista previa editable con avisos
//  -> "Confirmar y cargar" / "Cancelar". Nada se guarda hasta confirmar.
// ============================================================================

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MONTHLY_RESPONSIBILITIES } from "@/lib/constants";
import {
  previewResponsibilitiesPdfAction,
  applyResponsibilitiesPdfAction,
  type PdfPreviewResult,
} from "@/server/monthly-resp-pdf-actions";

const DAY_LABEL: Record<string, string> = { JUEVES: "Jueves", SABADO: "Sábado" };
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function formatDateISO(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]}`;
}

const RESP_LABEL = new Map(MONTHLY_RESPONSIBILITIES.map((r) => [r.key, r.label]));
const RESP_KIND = new Map(MONTHLY_RESPONSIBILITIES.map((r) => [r.key, r.kind]));

export function MonthlyRespPdfImport({
  year,
  month,
}: {
  year: number;
  month: number;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, startReading] = useTransition();
  const [saving, startSaving] = useTransition();

  const [preview, setPreview] = useState<PdfPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [overwrite, setOverwrite] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const cellKey = (dateISO: string, slotKey: string) => `${dateISO}_${slotKey}`;

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setDone(null);
    setPreview(null);

    const fd = new FormData();
    fd.set("file", file);
    fd.set("anio", String(year));
    fd.set("mes", String(month));

    startReading(async () => {
      const res = await previewResponsibilitiesPdfAction(fd);
      if (fileRef.current) fileRef.current.value = "";
      if (!res.ok) {
        setError(res.error ?? "No se pudo interpretar el PDF.");
        return;
      }
      const initial: Record<string, string> = {};
      for (const row of res.rows)
        for (const c of row.cells)
          initial[cellKey(row.dateISO, c.slotKey)] = c.value;
      setValues(initial);
      setOverwrite(false);
      setPreview(res);
    });
  };

  const cancel = () => {
    setPreview(null);
    setValues({});
    setError(null);
  };

  const confirm = () => {
    if (!preview) return;
    const entries = preview.rows.map((row) => {
      const vals: Record<string, string> = {};
      for (const c of row.cells) {
        const v = (values[cellKey(row.dateISO, c.slotKey)] ?? "").trim();
        if (!v) continue;
        // Si el administrador no autorizó reemplazar, los datos que ya existían
        // en la aplicación se conservan tal cual.
        if (c.conflict && !overwrite) continue;
        vals[c.slotKey] = v;
      }
      return { dateISO: row.dateISO, day: row.day, values: vals };
    });

    startSaving(async () => {
      const res = await applyResponsibilitiesPdfAction(entries);
      setPreview(null);
      setValues({});
      setDone(
        `Se cargaron ${res.saved} responsabilidad(es) desde el PDF.` +
          (preview.conflictCount && !overwrite
            ? ` Se conservaron ${preview.conflictCount} dato(s) que ya existían.`
            : ""),
      );
      router.refresh();
    });
  };

  const inputClass =
    "w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25";

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={onFile}
      />
      <button
        type="button"
        disabled={reading || saving}
        onClick={() => fileRef.current?.click()}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-60"
      >
        {reading ? "⏳ Procesando PDF…" : "📥 Cargar desde PDF"}
      </button>

      {error ? (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          ✅ {done}
        </p>
      ) : null}

      {preview ? (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <h3 className="text-base font-semibold text-foreground">
            Vista previa del PDF
          </h3>
          <p className="mt-0.5 text-sm text-muted">
            Revisa y corrige lo que haga falta. Nada se guarda hasta que
            presiones «Confirmar y cargar».
          </p>

          {preview.warnings.map((w) => (
            <p
              key={w}
              className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
            >
              ⚠️ {w}
            </p>
          ))}
          {preview.unknownCount > 0 ? (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              ⚠️ {preview.unknownCount} dato(s) no coinciden con ningún
              publicador o grupo registrado (marcados «No identificado»).
              Corrígelos antes de confirmar.
            </p>
          ) : null}
          {preview.conflictCount > 0 ? (
            <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <p>
                ⚠️ {preview.conflictCount} responsabilidad(es) ya tienen a otra
                persona asignada (se muestra «Actual: …»).
              </p>
              <label className="mt-1.5 flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                />
                Reemplazar los datos existentes con los del PDF
              </label>
            </div>
          ) : null}

          <datalist id="pdf-import-hermanos">
            {preview.publishers.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {preview.rows.map((row) => (
              <div
                key={row.dateISO}
                className="overflow-hidden rounded-xl border border-border"
              >
                <div className="border-b border-border bg-slate-50 px-3 py-2 font-semibold text-foreground">
                  {DAY_LABEL[row.day]} {formatDateISO(row.dateISO)}
                </div>
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {row.cells.map((c) => {
                      const ck = cellKey(row.dateISO, c.slotKey);
                      const v = values[ck] ?? "";
                      const isGroup = RESP_KIND.get(c.slotKey) === "group";
                      const stillUnknown =
                        c.unknown && v.trim() === c.value.trim();
                      return (
                        <tr key={c.slotKey} className="border-b border-border/60">
                          <td className="w-1/2 px-3 py-2 align-middle">
                            <span
                              className={
                                "font-medium " +
                                (isGroup ? "text-emerald-700" : "text-foreground")
                              }
                            >
                              {RESP_LABEL.get(c.slotKey)}
                            </span>
                            {c.conflict ? (
                              <span className="block text-[0.7rem] text-amber-700">
                                Actual: {c.current}
                              </span>
                            ) : null}
                            {stillUnknown ? (
                              <span className="block text-[0.7rem] text-amber-700">
                                No identificado
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            {isGroup ? (
                              <select
                                value={v}
                                aria-label={`${RESP_LABEL.get(c.slotKey)} — ${row.dateISO}`}
                                onChange={(e) =>
                                  setValues((p) => ({ ...p, [ck]: e.target.value }))
                                }
                                className={
                                  inputClass +
                                  (stillUnknown ? " border-amber-400" : "")
                                }
                              >
                                <option value="">— Sin asignar —</option>
                                {v && !preview.groups.includes(v) ? (
                                  <option value={v}>{v}</option>
                                ) : null}
                                {preview.groups.map((g) => (
                                  <option key={g} value={g}>
                                    {g}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                list="pdf-import-hermanos"
                                value={v}
                                autoComplete="off"
                                aria-label={`${RESP_LABEL.get(c.slotKey)} — ${row.dateISO}`}
                                onChange={(e) =>
                                  setValues((p) => ({ ...p, [ck]: e.target.value }))
                                }
                                className={
                                  inputClass +
                                  (stillUnknown ? " border-amber-400" : "")
                                }
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--primary-hover)] disabled:opacity-60"
            >
              {saving ? "⏳ Guardando…" : "✅ Confirmar y cargar"}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-slate-50 disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
