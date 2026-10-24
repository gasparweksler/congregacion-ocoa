"use client";

// Ventana para gestionar quién está disponible para cada responsabilidad.
// Los nombres se eligen de los publicadores de la congregación (no se escriben
// a mano), y un mismo hermano puede estar en varias categorías.

import { useActionState, useState } from "react";
import {
  addVolunteerAction,
  removeVolunteerAction,
} from "@/server/resp-volunteers-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Alert, Input, Button } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import type { RespCategory } from "@/lib/constants";
import type { VolunteerEntry } from "@/lib/resp-volunteers";

function Categoria({
  cat,
  entries,
  publishers,
}: {
  cat: RespCategory;
  entries: VolunteerEntry[];
  publishers: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(addVolunteerAction, EMPTY_FORM_STATE);
  const yaEstan = new Set(entries.map((e) => e.publisherId));
  const libres = publishers.filter((p) => !yaEstan.has(p.id));

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{cat.label}</h3>
        <span className="shrink-0 text-xs text-muted">
          {entries.length} hermano(s)
        </span>
      </div>

      {state.error ? (
        <div className="mt-2">
          <Alert tone="error">{state.error}</Alert>
        </div>
      ) : null}

      {entries.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {entries.map((e) => (
            <li key={e.publisherId}>
              {/* Cada nombre es su propio formulario: quitarlo no afecta al resto. */}
              <form action={removeVolunteerAction} className="inline">
                <input type="hidden" name="category" value={cat.key} />
                <input type="hidden" name="publisherId" value={e.publisherId} />
                <button
                  type="submit"
                  title={`Quitar a ${e.name} de ${cat.label}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-foreground transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                >
                  {e.name}
                  <span aria-hidden className="text-xs text-muted">
                    ✕
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted">
          Nadie registrado todavía para esta responsabilidad.
        </p>
      )}

      {/* Solo se sugieren los que todavía no están en esta categoría. */}
      <datalist id={`resp-vol-${cat.key}`}>
        {libres.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>

      <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="category" value={cat.key} />
        <div className="min-w-0 flex-1">
          <Input
            type="text"
            name="name"
            list={`resp-vol-${cat.key}`}
            placeholder="Escribe el nombre del hermano…"
            aria-label={`Añadir a ${cat.label}`}
            autoComplete="off"
          />
        </div>
        <SubmitButton pendingText="Añadiendo…" variant="secondary">
          Añadir
        </SubmitButton>
      </form>
    </div>
  );
}

export function RespVolunteers({
  categories,
  byCategory,
  publishers,
}: {
  categories: RespCategory[];
  byCategory: Record<string, VolunteerEntry[]>;
  publishers: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const total = categories.reduce(
    (n, c) => n + (byCategory[c.key]?.length ?? 0),
    0,
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm text-muted">
          {total === 0
            ? "Todavía no hay hermanos registrados. Hace falta para poder asignar automáticamente."
            : `${total} registro(s) en ${categories.length} tipos de responsabilidad.`}
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {open ? "Ocultar" : "Gestionar hermanos disponibles"}
        </Button>
      </div>

      {open ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {categories.map((c) => (
            <Categoria
              key={c.key}
              cat={c}
              entries={byCategory[c.key] ?? []}
              publishers={publishers}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
