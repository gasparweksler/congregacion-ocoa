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

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  leerGuiaPdfAction,
  crearReunionesDesdeGuiaAction,
  type GuiaPdfState,
  type GenerarReunionesState,
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
  const router = useRouter();
  const [guia, setGuia] = useState<GuiaLeida | null>(null);
  // Hasta leer el navegador no se guarda nada, para no borrar lo que ya había.
  const [leido, setLeido] = useState(false);
  const [abierta, setAbierta] = useState(false);
  // "Revisar y corregir" se abre en una ventana grande: dentro de la columna
  // estrecha de Reuniones los títulos salían apretados y cortados.
  const ventana = useRef<HTMLDialogElement>(null);
  const [generando, setGenerando] = useState(false);
  const [generado, setGenerado] = useState<GenerarReunionesState | null>(null);
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

  // <dialog> modal: oscurece el resto de la página y se cierra con Escape.
  useEffect(() => {
    const d = ventana.current;
    if (!d) return;
    if (abierta && !d.open) d.showModal();
    if (!abierta && d.open) d.close();
  }, [abierta]);

  // <dialog> modal: oscurece el resto de la página y se cierra con Escape.
  useEffect(() => {
    const d = ventana.current;
    if (!d) return;
    if (abierta && !d.open) d.showModal();
    if (!abierta && d.open) d.close();
  }, [abierta]);

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

  // Crear las reuniones con lo que hay en pantalla, sin pasar por el Excel.
  const generar = async () => {
    if (!guia || generando) return;
    setGenerando(true);
    setGenerado(null);
    try {
      const r = await crearReunionesDesdeGuiaAction(guia);
      setGenerado(r);
      // La lista de reuniones está en la misma página: se vuelve a pedir para
      // que las recién creadas aparezcan sin recargar a mano.
      if (r.success) router.refresh();
    } catch {
      setGenerado({
        error:
          "No se pudieron crear las reuniones. Comprueba la conexión y vuelve a intentarlo; las que ya se hubieran creado no se repiten.",
      });
    } finally {
      setGenerando(false);
    }
  };

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
            <Button type="button" variant="secondary" onClick={() => setAbierta(true)}>
              🔍 Revisar y corregir
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setGuia(null);
                setAbierta(false);
                setGenerado(null);
              }}
            >
              Quitar el PDF cargado
            </Button>
          </div>

          <p className="px-3 pb-2 text-xs text-muted">
            {guia.titulo} · {plural(guia.semanas.length, "semana")} ·{" "}
            {plural(partes, "parte")}. Ábrelo para corregir el programa y
            generar las reuniones.
          </p>

          {/* El resultado de generar se ve también con la ventana cerrada. */}
          {generado?.success ? (
            <div className="px-3 pb-3">
              <Alert tone="success">{generado.success}</Alert>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ---------------------------------------------------------------
          "Revisar y corregir", en una ventana grande.

          Antes vivía dentro de la tarjeta, en la columna estrecha de
          Reuniones: los títulos de las partes salían apretados y cortados y
          había que escribir a ciegas. Aquí cabe el programa entero, y en una
          pantalla ancha cada parte ocupa una sola línea.
          --------------------------------------------------------------- */}
      <dialog
        ref={ventana}
        onClose={() => setAbierta(false)}
        onCancel={() => setAbierta(false)}
        // m-auto: el reset de Tailwind quita el margen que centra un <dialog>.
        className="m-auto h-[min(92vh,60rem)] w-[min(80rem,calc(100vw-1.5rem))] max-w-none rounded-2xl border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        {guia ? (
          <div className="flex h-full flex-col">
            {/* Cabecera fija: siempre se sabe qué programa se está tocando y
                cómo cerrar. */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground">
                  Revisar y corregir · {guia.titulo}
                </h2>
                <p className="text-xs text-muted">
                  {plural(guia.semanas.length, "semana")} y{" "}
                  {plural(partes, "parte")}. Lo que corrijas aquí es lo que se
                  usará para la planilla y para las reuniones.
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={() => setAbierta(false)}>
                Cerrar
              </Button>
            </div>

            {/* Cuerpo con el programa, que es lo único que se desplaza. */}
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
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
                  open
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
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                      <label className="text-xs font-medium text-muted">
                        Semana
                        <Input
                          value={s.etiqueta}
                          onChange={(e) =>
                            cambiarSemana(i, { etiqueta: e.target.value })
                          }
                        />
                      </label>
                      <label className="text-xs font-medium text-muted lg:col-span-2">
                        Lectura semanal de la Biblia
                        <Input
                          value={s.lectura}
                          onChange={(e) =>
                            cambiarSemana(i, { lectura: e.target.value })
                          }
                        />
                      </label>
                      <label className="text-xs font-medium text-muted lg:col-span-2">
                        Nota de la semana (va en la planilla, en la columna de
                        notas)
                        <Input
                          value={s.nota}
                          placeholder="P. ej. Asamblea de circuito: no hay reunión"
                          onChange={(e) => cambiarSemana(i, { nota: e.target.value })}
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
                          {/* En pantalla ancha, cada parte en una sola línea:
                              número, título, tipo, sección y Quitar. En una
                              estrecha se parte en dos renglones (xl:contents
                              deshace las dos cajas y deja los campos sueltos
                              en la rejilla). */}
                          {dentro.map(({ p, j }) => (
                            <div
                              key={j}
                              className="space-y-1.5 rounded-lg border border-border/70 bg-slate-50/60 p-1.5 xl:grid xl:grid-cols-[3.5rem_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-center xl:gap-1.5 xl:space-y-0"
                            >
                              <div className="flex items-center gap-1.5 xl:contents">
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
                                  className={`${campo} w-12 shrink-0 text-center xl:w-full`}
                                />
                                <input
                                  value={p.titulo}
                                  aria-label="Título de la parte"
                                  placeholder="Título con su duración, p. ej. Hagamos revisitas (3 mins.)"
                                  onChange={(e) =>
                                    cambiarParte(i, j, { titulo: e.target.value })
                                  }
                                  className={`${campo} min-w-0 flex-1 xl:w-full`}
                                />
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 xl:contents">
                                <input
                                  value={p.tipo}
                                  aria-label="Tipo de parte"
                                  placeholder="Tipo (discurso, de casa en casa…)"
                                  onChange={(e) =>
                                    cambiarParte(i, j, { tipo: e.target.value })
                                  }
                                  className={`${campo} min-w-[9rem] flex-1 xl:w-full xl:min-w-0`}
                                />
                                <select
                                  value={p.seccion}
                                  aria-label="Sección de la parte"
                                  onChange={(e) =>
                                    cambiarParte(i, j, {
                                      seccion: e.target.value as Seccion,
                                    })
                                  }
                                  className={`${campo} min-w-[9rem] flex-1 xl:w-full xl:min-w-0`}
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
                  </div>
                </details>
              ))}

              {/* Debajo de la última semana: crear las reuniones con esto
                  mismo, sin pasar por el Excel. */}
              <div className="space-y-2 rounded-xl border border-border bg-slate-50/60 p-3">
                {generado?.error ? (
                  <Alert tone="error">{generado.error}</Alert>
                ) : null}
                {generado?.success ? (
                  <Alert tone="success">{generado.success}</Alert>
                ) : null}
                {generado?.avisos && generado.avisos.length > 0 ? (
                  <Alert tone="warning">
                    <p className="font-semibold">
                      Estas semanas no se crearon:
                    </p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">
                      {generado.avisos.map((a, k) => (
                        <li key={k}>{a}</li>
                      ))}
                    </ul>
                  </Alert>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" onClick={generar} disabled={generando}>
                    {generando
                      ? "Creando las reuniones…"
                      : "📅 Generar reuniones ahora"}
                  </Button>
                  <DownloadButton
                    href="/api/plantilla-vymc"
                    pendingText="Preparando…"
                    body={guia}
                  >
                    📄 Descargar Planilla Excel
                  </DownloadButton>
                </div>
                <p className="text-xs text-muted">
                  Se crean las reuniones de entre semana de{" "}
                  {plural(guia.semanas.length, "semana")} con los títulos del
                  programa y sus canciones; los hermanos se ponen después,
                  dentro de cada reunión. Las semanas que ya estén cargadas no
                  se tocan ni se duplican. Si prefieres repartir los nombres en
                  el Excel, la planilla sigue funcionando igual que siempre.
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
