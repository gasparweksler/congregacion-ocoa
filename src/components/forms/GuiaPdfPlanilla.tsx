"use client";

// ============================================================================
//  Subir el PDF de la Guía de actividades y descargar la planilla ya rellena.
//
//  Los dos botones van juntos a propósito: el PDF se lee, se revisa en la
//  vista previa (donde se puede corregir a mano cualquier dato) y de ahí sale
//  la planilla. Mientras no haya PDF cargado, "Descargar Planilla Excel" sigue
//  entregando la planilla en blanco de siempre.
//
//  Lo leído se guarda en ESTE navegador (localStorage), no en la base de
//  datos: son datos de paso —el programa impreso, no asignaciones de nadie— y
//  así no ocupan espacio ni se mezclan entre congregaciones. Al subir otro PDF
//  se reemplaza por completo.
// ============================================================================

import { useActionState, useEffect, useState } from "react";
import {
  leerGuiaPdfAction,
  type GuiaPdfState,
} from "@/server/guia-pdf-actions";
import type { GuiaLeida, GuiaParte, GuiaSemana, Seccion } from "@/lib/vymc-pdf";
import { DownloadButton } from "@/components/DownloadButton";
import { Alert, Button, Input } from "@/components/ui";

const CLAVE = "guia-vymc-leida";

const SECCIONES: { id: Seccion; nombre: string }[] = [
  { id: "TESOROS", nombre: "Tesoros de la Biblia" },
  { id: "SMM", nombre: "Seamos mejores maestros" },
  { id: "VC", nombre: "Nuestra vida cristiana" },
];

// Sin ancho propio: lo pone cada campo. Si aquí hubiera `w-full`, ganaría
// siempre (Tailwind resuelve por orden de la hoja, no del atributo class) y
// todos los campos saldrían de ancho completo, uno por línea.
const campo = "block rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm";

/** "1 semana" / "3 semanas", sin el "(s)" que afea los textos. */
function plural(n: number, singular: string, pluralForma = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForma}`;
}

export function GuiaPdfPlanilla() {
  const [guia, setGuia] = useState<GuiaLeida | null>(null);
  // Hasta leer el navegador no se guarda nada, para no borrar lo que ya había.
  const [leido, setLeido] = useState(false);
  const [abierta, setAbierta] = useState(false);
  const [state, action, pendiente] = useActionState<GuiaPdfState, FormData>(
    leerGuiaPdfAction,
    {},
  );

  useEffect(() => {
    try {
      const txt = window.localStorage.getItem(CLAVE);
      if (txt) setGuia(JSON.parse(txt) as GuiaLeida);
    } catch {
      /* navegador sin almacenamiento o dato corrupto: se empieza de cero */
    }
    setLeido(true);
  }, []);

  useEffect(() => {
    if (!leido) return;
    try {
      if (guia) window.localStorage.setItem(CLAVE, JSON.stringify(guia));
      else window.localStorage.removeItem(CLAVE);
    } catch {
      /* si no se puede guardar, la descarga sigue funcionando en esta visita */
    }
  }, [guia, leido]);

  // Un PDF nuevo reemplaza lo anterior por completo.
  useEffect(() => {
    if (state.guia && state.guia.semanas.length > 0) {
      setGuia(state.guia);
      setAbierta(true);
    }
  }, [state]);

  const cambiarSemana = (i: number, cambio: Partial<GuiaSemana>) =>
    setGuia((g) =>
      g
        ? {
            ...g,
            semanas: g.semanas.map((s, k) => (k === i ? { ...s, ...cambio } : s)),
          }
        : g,
    );

  const cambiarParte = (i: number, j: number, cambio: Partial<GuiaParte>) =>
    setGuia((g) =>
      g
        ? {
            ...g,
            semanas: g.semanas.map((s, k) =>
              k === i
                ? {
                    ...s,
                    partes: s.partes.map((p, m) =>
                      m === j ? { ...p, ...cambio } : p,
                    ),
                  }
                : s,
            ),
          }
        : g,
    );

  const quitarParte = (i: number, j: number) =>
    setGuia((g) =>
      g
        ? {
            ...g,
            semanas: g.semanas.map((s, k) =>
              k === i ? { ...s, partes: s.partes.filter((_, m) => m !== j) } : s,
            ),
          }
        : g,
    );

  const añadirParte = (i: number, seccion: Seccion) =>
    setGuia((g) => {
      if (!g) return g;
      const s = g.semanas[i];
      const numero = Math.max(0, ...s.partes.map((p) => p.numero)) + 1;
      const nueva: GuiaParte = {
        numero,
        titulo: "",
        duracion: "",
        tipo: "",
        aCargoDe: "",
        seccion,
      };
      return {
        ...g,
        semanas: g.semanas.map((w, k) =>
          k === i ? { ...w, partes: [...w.partes, nueva] } : w,
        ),
      };
    });

  const partes = guia?.semanas.reduce((n, s) => n + s.partes.length, 0) ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-2">
        <DownloadButton
          href="/api/plantilla-vymc"
          pendingText="Preparando…"
          // Con PDF cargado, el programa viaja con la petición y la planilla
          // baja ya rellena; sin PDF, la de siempre en blanco.
          body={guia ?? undefined}
        >
          📄 Descargar Planilla Excel
        </DownloadButton>

        {/* La etiqueta hace de botón: el campo de archivo va oculto y el PDF
            se envía al elegirlo, para no pedir dos clics. */}
        <form action={action} className="min-w-0">
          <label
            htmlFor="guia-pdf"
            aria-busy={pendiente}
            className={`inline-flex items-center justify-center gap-2 rounded-[10px] border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-foreground transition-colors ${
              pendiente
                ? "pointer-events-none opacity-70"
                : "cursor-pointer hover:bg-slate-50"
            }`}
          >
            {pendiente ? (
              <>
                <span
                  aria-hidden
                  className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
                Leyendo el PDF…
              </>
            ) : (
              "📘 Subir PDF de Guía de actividades"
            )}
          </label>
          <input
            id="guia-pdf"
            type="file"
            name="file"
            accept=".pdf,application/pdf"
            required
            disabled={pendiente}
            className="sr-only"
            onChange={(e) => {
              if (e.target.files?.length) e.target.form?.requestSubmit();
            }}
          />
        </form>
      </div>

      <p className="text-xs text-muted">
        {guia ? (
          <>
            La planilla se descargará <strong>con el programa de {guia.titulo}</strong>:{" "}
            {plural(guia.semanas.length, "semana")} y {plural(partes, "parte")}.
            Solo hay que poner los nombres y subirla aquí abajo.
          </>
        ) : (
          <>
            Sube el PDF de la Guía (cualquier mes o año) y la planilla se
            descargará con el programa ya escrito. Si no subes ninguno, baja en
            blanco para completarla a mano.
          </>
        )}
      </p>

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      {guia ? (
        <div className="rounded-xl border border-border bg-slate-50/60">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <button
              type="button"
              onClick={() => setAbierta((v) => !v)}
              className="text-sm font-semibold text-foreground"
              aria-expanded={abierta}
            >
              {abierta ? "▾" : "▸"} Revisar y corregir · {guia.titulo}
            </button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setGuia(null);
                setAbierta(false);
              }}
            >
              Quitar el PDF cargado
            </Button>
          </div>

          {abierta ? (
            <div className="space-y-3 border-t border-border px-3 py-3">
              {guia.avisos.length > 0 ? (
                <Alert tone="warning">
                  <p className="font-semibold">
                    Revisa estos puntos (lo demás se leyó bien):
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {guia.avisos.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </Alert>
              ) : null}

              {guia.semanas.map((s, i) => (
                <details
                  key={`${s.inicioISO}-${i}`}
                  className="rounded-lg border border-border bg-white"
                >
                  <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-foreground">
                    {s.etiqueta}
                    <span className="ml-2 font-normal text-muted">
                      {s.lectura || "sin lectura"} · canciones{" "}
                      {s.cancionInicio || "—"}/{s.cancionIntermedia || "—"}/
                      {s.cancionFinal || "—"} · {plural(s.partes.length, "parte")}
                    </span>
                  </summary>

                  <div className="space-y-3 border-t border-border px-3 py-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-xs font-medium text-muted">
                        Semana
                        <Input
                          value={s.etiqueta}
                          onChange={(e) =>
                            cambiarSemana(i, { etiqueta: e.target.value })
                          }
                        />
                      </label>
                      <label className="text-xs font-medium text-muted">
                        Lectura semanal de la Biblia
                        <Input
                          value={s.lectura}
                          onChange={(e) =>
                            cambiarSemana(i, { lectura: e.target.value })
                          }
                        />
                      </label>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3">
                      {(
                        [
                          ["cancionInicio", "Canción de inicio"],
                          ["cancionIntermedia", "Canción intermedia"],
                          ["cancionFinal", "Canción final"],
                        ] as const
                      ).map(([clave, nombre]) => (
                        <label
                          key={clave}
                          className="text-xs font-medium text-muted"
                        >
                          {nombre}
                          <Input
                            value={s[clave]}
                            inputMode="numeric"
                            onChange={(e) =>
                              cambiarSemana(i, {
                                [clave]: e.target.value.replace(/\D/g, "").slice(0, 3),
                              } as Partial<GuiaSemana>)
                            }
                          />
                        </label>
                      ))}
                    </div>

                    {SECCIONES.map((sec) => {
                      const dentro = s.partes
                        .map((p, j) => ({ p, j }))
                        .filter(({ p }) => p.seccion === sec.id);
                      return (
                        <div key={sec.id} className="space-y-1.5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                            {sec.nombre} ({dentro.length})
                          </p>
                          {/* Cada parte, en dos líneas: arriba el número y el
                              título; abajo el tipo, la sección y Quitar. En
                              una sola línea no caben: esta tarjeta vive en la
                              columna estrecha de Reuniones. */}
                          {dentro.map(({ p, j }) => (
                            <div
                              key={j}
                              className="space-y-1.5 rounded-lg border border-border/70 bg-slate-50/60 p-1.5"
                            >
                              <div className="flex items-center gap-1.5">
                                <input
                                  value={p.numero}
                                  inputMode="numeric"
                                  aria-label="Número de la parte"
                                  onChange={(e) =>
                                    cambiarParte(i, j, {
                                      numero:
                                        Number(e.target.value.replace(/\D/g, "")) || 0,
                                    })
                                  }
                                  className={`${campo} w-12 shrink-0 text-center`}
                                />
                                <input
                                  value={p.titulo}
                                  aria-label="Título de la parte"
                                  placeholder="Título con su duración, p. ej. Hagamos revisitas (3 mins.)"
                                  onChange={(e) =>
                                    cambiarParte(i, j, { titulo: e.target.value })
                                  }
                                  className={`${campo} min-w-0 flex-1`}
                                />
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <input
                                  value={p.tipo}
                                  aria-label="Tipo de parte"
                                  placeholder="Tipo (discurso, de casa en casa…)"
                                  onChange={(e) =>
                                    cambiarParte(i, j, { tipo: e.target.value })
                                  }
                                  className={`${campo} min-w-[9rem] flex-1`}
                                />
                                <select
                                  value={p.seccion}
                                  aria-label="Sección de la parte"
                                  onChange={(e) =>
                                    cambiarParte(i, j, {
                                      seccion: e.target.value as Seccion,
                                    })
                                  }
                                  className={`${campo} min-w-[9rem] flex-1`}
                                >
                                  {SECCIONES.map((o) => (
                                    <option key={o.id} value={o.id}>
                                      {o.nombre}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => quitarParte(i, j)}
                                  className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                                >
                                  Quitar
                                </button>
                              </div>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => añadirParte(i, sec.id)}
                            className="rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-slate-100"
                          >
                            + Añadir parte a {sec.nombre}
                          </button>
                        </div>
                      );
                    })}

                    <label className="block text-xs font-medium text-muted">
                      Nota de la semana (va en la planilla, en la columna de
                      notas)
                      <Input
                        value={s.nota}
                        placeholder="P. ej. Asamblea de circuito: no hay reunión"
                        onChange={(e) => cambiarSemana(i, { nota: e.target.value })}
                      />
                    </label>
                  </div>
                </details>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
