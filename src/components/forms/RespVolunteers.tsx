"use client";

// Ventana para gestionar quién está disponible para cada responsabilidad.
// Los nombres se eligen de los publicadores de la congregación (no se escriben
// a mano), y un mismo hermano puede estar en varias categorías.

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  addVolunteerAction,
  removeVolunteerAction,
  setVideoSameAsAudioAction,
  setMicCountAction,
  setAudioAlsoVideoAction,
  setUshersMergedAction,
} from "@/server/resp-volunteers-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Alert, Input, Button } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { WATCHTOWER_CATEGORY, type RespCategory } from "@/lib/constants";
import type { VolunteerEntry } from "@/lib/resp-volunteers";
import type { RespSettings } from "@/lib/resp-settings";

function Categoria({
  cat,
  entries,
  publishers,
  ayuda,
  espejo,
  apagada,
  extra,
}: {
  cat: RespCategory;
  entries: VolunteerEntry[];
  publishers: { id: string; name: string }[];
  /** Explicación corta bajo el título. */
  ayuda?: string;
  /** La lista la manda otra categoría (Video repitiendo Audio). */
  espejo?: boolean;
  /**
   * La congregación no usa esta responsabilidad (Video cuando lo hace el
   * hermano de Audio): se ve en gris y no se puede editar. La lista guardada
   * no se borra.
   */
  apagada?: string;
  /** Controles propios de la categoría (el interruptor de Video). */
  extra?: React.ReactNode;
}) {
  const [state, action] = useActionState(addVolunteerAction, EMPTY_FORM_STATE);
  const yaEstan = new Set(entries.map((e) => e.publisherId));
  const libres = publishers.filter((p) => !yaEstan.has(p.id));

  return (
    <div
      className={
        "rounded-xl border border-border bg-surface p-3 " +
        (apagada ? "opacity-60" : "")
      }
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="min-w-0 text-sm font-semibold text-foreground">
          {cat.label}
        </h3>
        <span className="shrink-0 text-xs text-muted">
          {entries.length} hermano(s)
        </span>
      </div>
      {ayuda ? <p className="mt-0.5 text-xs text-muted">{ayuda}</p> : null}

      {/* La congregación no usa esta responsabilidad. */}
      {apagada ? (
        <p className="mt-2 rounded-lg border border-border bg-slate-50 px-2.5 py-2 text-xs text-muted">
          {apagada} Quita el interruptor de <strong>Audio</strong> para volver a
          llevar una lista propia. Lo registrado no se borra.
        </p>
      ) : null}

      {/* Video con "Repetir los de Audio": la lista la manda Audio. */}
      {espejo && !apagada ? (
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
              {apagada ? (
                <span className="inline-flex items-center rounded-lg border border-border bg-slate-50 px-2 py-1 text-sm text-muted">
                  {e.name}
                </span>
              ) : (
                <form action={removeVolunteerAction} className="inline">
                  <input type="hidden" name="category" value={cat.key} />
                  <input type="hidden" name="publisherId" value={e.publisherId} />
                  <QuitarBoton name={e.name} catLabel={cat.label} />
                </form>
              )}
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
        className={`mt-2 flex flex-wrap items-end gap-2 ${espejo || apagada ? "hidden" : ""}`}
      >
        <input type="hidden" name="category" value={cat.key} />
        <div className="min-w-0 flex-1">
          <Input
            type="text"
            name="name"
            list={`resp-vol-${cat.key}`}
            placeholder="Nombre del hermano…"
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

/**
 * Un interruptor de los ajustes de la categoría (la palanca de toda la vida).
 *
 * Mientras se guarda, la palanca ya se mueve al estado nuevo y aparece
 * "Guardando…": antes no había ningún aviso y parecía que no respondía.
 */
function SwitchResp({ activo, children }: { activo: boolean; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  // Al pulsar, se muestra el estado al que va, no el que tenía.
  const visual = pending ? !activo : activo;

  return (
    <button
      type="submit"
      role="switch"
      aria-checked={activo}
      disabled={pending}
      className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2 text-left text-sm transition-colors hover:bg-slate-50 disabled:cursor-wait"
    >
      <span
        aria-hidden
        className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          visual ? "bg-primary" : "bg-slate-300"
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
            visual ? "translate-x-4" : ""
          }`}
        />
      </span>
      <span className="min-w-0 flex-1 font-medium text-foreground">
        {children}
      </span>
      {pending ? (
        <span className="shrink-0 text-xs text-muted">Guardando…</span>
      ) : null}
    </button>
  );
}

/** "Repetir los de Audio": la LISTA de Video es la de Audio. */
function EspejoAudio({ activo }: { activo: boolean }) {
  return (
    <form action={setVideoSameAsAudioAction}>
      {/* Se envía el valor contrario: el botón alterna. */}
      <input type="hidden" name="value" value={activo ? "no" : "si"} />
      <SwitchResp activo={activo}>Repetir los de Audio</SwitchResp>
    </form>
  );
}

/**
 * "El mismo hermano hace Audio y Video": no se reparte una casilla de Video
 * aparte, ni se imprime. Es otra cosa que "Repetir los de Audio", que solo
 * comparte la lista de disponibles.
 */
function AudioHaceVideo({ activo }: { activo: boolean }) {
  return (
    <form action={setAudioAlsoVideoAction}>
      <input type="hidden" name="value" value={activo ? "no" : "si"} />
      <SwitchResp activo={activo}>
        El mismo hermano hace Audio y Video
      </SwitchResp>
    </form>
  );
}

/**
 * "Un solo hermano como acomodador de entrada y de auditorio": no se reparte
 * una casilla de Auditorio aparte, ni se imprime. La de Entrada pasa a
 * llamarse "Acomodador de Auditorio y de Entrada".
 */
function AcomodadorUnico({ activo }: { activo: boolean }) {
  return (
    <form action={setUshersMergedAction}>
      <input type="hidden" name="value" value={activo ? "no" : "si"} />
      <SwitchResp activo={activo}>
        Un solo hermano como acomodador de entrada y de auditorio
      </SwitchResp>
    </form>
  );
}

/**
 * "Usamos 1 / 2 Pasa Micrófono": cuántos hermanos pasan el micrófono en cada
 * reunión. Con uno, la casilla "Pasa Micrófono 2" deja de repartirse y de
 * imprimirse; lo que ya estuviera escrito en ella no se borra.
 */
function SelectorMicros({ valor }: { valor: number }) {
  const { pending } = useFormStatus();
  return (
    <div
      role="group"
      aria-label="Cuántos Pasa Micrófono usa la congregación"
      className="grid gap-1.5 sm:grid-cols-2"
    >
      {[1, 2].map((n) => {
        const elegido = valor === n;
        return (
          <button
            key={n}
            type="submit"
            name="value"
            value={String(n)}
            aria-pressed={elegido}
            disabled={pending || elegido}
            className={
              "rounded-lg border px-2.5 py-2 text-sm font-medium transition-colors disabled:cursor-default " +
              (elegido
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-surface text-foreground hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60")
            }
          >
            {elegido ? "✓ " : ""}Usamos {n} Pasa Micrófono
          </button>
        );
      })}
      {pending ? (
        <span className="text-xs text-muted sm:col-span-2">Guardando…</span>
      ) : null}
    </div>
  );
}

function Micros({ valor }: { valor: number }) {
  return (
    <form action={setMicCountAction}>
      <SelectorMicros valor={valor} />
    </form>
  );
}

/** Quitar a un hermano, con aviso mientras se guarda. */
function QuitarBoton({ name, catLabel }: { name: string; catLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={`Quitar a ${name} de ${catLabel}`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-foreground transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-wait disabled:opacity-50"
    >
      {name}
      <span aria-hidden className="text-xs text-muted">
        {pending ? "…" : "✕"}
      </span>
    </button>
  );
}

export function RespVolunteers({
  categories,
  byCategory,
  publishers,
  videoSameAsAudio,
  ajustes,
}: {
  categories: RespCategory[];
  byCategory: Record<string, VolunteerEntry[]>;
  publishers: { id: string; name: string }[];
  /** Video repite la lista de Audio. */
  videoSameAsAudio: boolean;
  /** Cuántos micrófonos usa la congregación y si Audio hace también Video. */
  ajustes: RespSettings;
}) {
  // Con "el mismo hermano hace Audio y Video" no hay casilla de Video que
  // repartir: su lista queda en gris, sin borrarse.
  const videoApagado = ajustes.audioAlsoVideo;
  // Qué categorías de reparto están todavía sin nadie. La Atalaya no cuenta:
  // es opcional, no un puesto que haya que cubrir.
  const sinNadie = categories
    .filter((c) => c.key !== WATCHTOWER_CATEGORY.key)
    .filter((c) => {
      const propios = byCategory[c.key]?.length ?? 0;
      // Video, cuando lo hace el hermano de Audio, no es un puesto que cubrir.
      if (c.key === "VIDEO" && videoApagado) return false;
      // Video con el interruptor puesto se nutre de Audio.
      if (c.key === "VIDEO" && videoSameAsAudio) {
        return (byCategory.AUDIO?.length ?? 0) === 0;
      }
      return propios === 0;
    })
    .map((c) => c.label);

  // Mientras falte alguna categoría por cubrir, la ventana arranca abierta: si
  // está cerrada no se ve que falta gente ni dónde se añade.
  const [open, setOpen] = useState(sinNadie.length > 0);
  const total = categories.reduce(
    (n, c) => n + (byCategory[c.key]?.length ?? 0),
    0,
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm text-muted">
          {total === 0 ? (
            "Todavía no hay hermanos registrados. Hace falta para poder asignar automáticamente."
          ) : sinNadie.length > 0 ? (
            <>
              {total} registro(s).{" "}
              <strong className="text-amber-600">
                Faltan: {sinNadie.join(", ")}
              </strong>
              .
            </>
          ) : (
            `${total} registro(s) en ${categories.length} tipos de responsabilidad.`
          )}
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
                apagada={
                  esVideo && videoApagado
                    ? "Esta responsabilidad no se reparte: la hace el hermano de Audio."
                    : undefined
                }
                extra={
                  esVideo && !videoApagado ? (
                    <EspejoAudio activo={videoSameAsAudio} />
                  ) : c.key === "AUDIO" ? (
                    <AudioHaceVideo activo={ajustes.audioAlsoVideo} />
                  ) : c.key === "MICROFONO" ? (
                    <Micros valor={ajustes.micCount} />
                  ) : c.key === "ACOMODADORES" ? (
                    <AcomodadorUnico activo={ajustes.ushersMerged} />
                  ) : undefined
                }
                ayuda={
                  c.key === WATCHTOWER_CATEGORY.key
                    ? "No recibirá ninguna responsabilidad en la reunión de fin de semana."
                    : c.key === "MICROFONO" && ajustes.micCount === 1
                      ? "Se reparte una sola casilla por reunión."
                      : c.key === "ACOMODADORES" && ajustes.ushersMerged
                        ? "Se reparte una sola casilla por reunión: el mismo hermano cubre la entrada y el auditorio."
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
