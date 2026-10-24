"use client";

// Ventana para gestionar quién está disponible para cada responsabilidad.
// Los nombres se eligen de los publicadores de la congregación (no se escriben
// a mano), y un mismo hermano puede estar en varias categorías.

import { useActionState, useState } from "react";
import {
  addVolunteerAction,
  removeVolunteerAction,
  setVideoSameAsAudioAction,
} from "@/server/resp-volunteers-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Alert, Input, Button } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { WATCHTOWER_CATEGORY, type RespCategory } from "@/lib/constants";
import type { VolunteerEntry } from "@/lib/resp-volunteers";

function Categoria({
  cat,
  entries,
  publishers,
  ayuda,
  espejo,
  extra,
}: {
  cat: RespCategory;
  entries: VolunteerEntry[];
  publishers: { id: string; name: string }[];
  /** Explicación corta bajo el título. */
  ayuda?: string;
  /** La lista la manda otra categoría (Video repitiendo Audio). */
  espejo?: boolean;
  /** Controles propios de la categoría (el interruptor de Video). */
  extra?: React.ReactNode;
}) {
  const [state, action] = useActionState(addVolunteerAction, EMPTY_FORM_STATE);
  const yaEstan = new Set(entries.map((e) => e.publisherId));
  const libres = publishers.filter((p) => !yaEstan.has(p.id));

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="min-w-0 text-sm font-semibold text-foreground">
          {cat.label}
        </h3>
        <span className="shrink-0 text-xs text-muted">
          {entries.length} hermano(s)
        </span>
      </div>
      {ayuda ? <p className="mt-0.5 text-xs text-muted">{ayuda}</p> : null}

      {/* Video con "Repetir los de Sonido": la lista la manda Audio. */}
      {espejo ? (
        <p className="mt-2 rounded-lg border border-border bg-slate-50 px-2.5 py-2 text-xs text-muted">
          Se usan los mismos hermanos que en <strong>Audio</strong>. Quita el
          interruptor para llevar una lista propia.
        </p>
      ) : null}

      {extra ? <div className="mt-2">{extra}</div> : null}

      {state.error ? (
        <div className="mt-2">
          <Alert tone="error">{state.error}</Alert>
        </div>
      ) : null}

      {espejo ? null : entries.length > 0 ? (
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

      <form
        action={action}
        className={`mt-2 flex flex-wrap items-end gap-2 ${espejo ? "hidden" : ""}`}
      >
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

/** Interruptor "Repetir los de Sonido" de la categoría Video. */
function EspejoSonido({ activo }: { activo: boolean }) {
  return (
    <form action={setVideoSameAsAudioAction}>
      {/* Se envía el valor contrario: el botón alterna. */}
      <input type="hidden" name="value" value={activo ? "no" : "si"} />
      <button
        type="submit"
        role="switch"
        aria-checked={activo}
        className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2 text-left text-sm transition-colors hover:bg-slate-50"
      >
        <span
          aria-hidden
          className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
            activo ? "bg-primary" : "bg-slate-300"
          }`}
        >
          <span
            className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
              activo ? "translate-x-4" : ""
            }`}
          />
        </span>
        <span className="min-w-0 font-medium text-foreground">
          Repetir los de Sonido
        </span>
      </button>
    </form>
  );
}

export function RespVolunteers({
  categories,
  byCategory,
  publishers,
  videoSameAsAudio,
}: {
  categories: RespCategory[];
  byCategory: Record<string, VolunteerEntry[]>;
  publishers: { id: string; name: string }[];
  /** Video repite la lista de Audio. */
  videoSameAsAudio: boolean;
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
          {categories.map((c) => {
            const esVideo = c.key === "VIDEO";
            const espejo = esVideo && videoSameAsAudio;
            return (
              <Categoria
                key={c.key}
                cat={c}
                // Con el interruptor puesto, Video enseña la lista de Audio.
                entries={espejo ? (byCategory.AUDIO ?? []) : (byCategory[c.key] ?? [])}
                publishers={publishers}
                espejo={espejo}
                extra={esVideo ? <EspejoSonido activo={videoSameAsAudio} /> : undefined}
                ayuda={
                  c.key === WATCHTOWER_CATEGORY.key
                    ? "No recibirá ninguna responsabilidad en la reunión de fin de semana."
                    : undefined
                }
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
