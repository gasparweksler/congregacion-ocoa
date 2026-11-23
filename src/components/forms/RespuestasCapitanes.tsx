"use client";

// ============================================================================
//  Lo que llega a la encuesta, visto por el Administrador.
//
//  Dos formas de mirarlo: la lista (quién puede y cuándo) y el calendario del
//  mes (qué día tengo a quién). Encima, los filtros por día, horario y
//  modalidad, que valen para las dos.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CABECERA_SEMANA,
  MODALIDADES,
  etiquetaDeDia,
  etiquetaDelMes,
  etiquetaModalidad,
  filtrarRespuestas,
  faltanPorResponder,
  porDia,
  resumenDeDias,
  semanasDelMes,
  type DiaDisponible,
  type FiltroRespuestas,
  type RespuestaResumen,
} from "@/lib/capitanes";
import {
  borrarRespuesta,
  guardarRespuestaAdmin,
} from "@/server/capitanes-actions";
import { Alert, Badge, Button, EmptyState, Select } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DisponibilidadCapitan } from "@/components/forms/DisponibilidadCapitan";
import type { FormState } from "@/server/actions-shared";

export function RespuestasCapitanes({
  surveyId,
  year,
  month,
  horarios,
  respuestas,
  capitanes,
}: {
  surveyId: string;
  year: number;
  month: number;
  horarios: string[];
  respuestas: RespuestaResumen[];
  /** Los hermanos con la casilla Capitán, para saber quién falta. */
  capitanes: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [vista, setVista] = useState<"lista" | "calendario">("lista");
  const [filtro, setFiltro] = useState<FiltroRespuestas>({});
  const [editando, setEditando] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<RespuestaResumen | null>(null);
  const [aviso, setAviso] = useState<FormState>({});
  const [trabajando, startTransition] = useTransition();

  const semanas = useMemo(() => semanasDelMes(year, month), [year, month]);
  const vistos = useMemo(
    () => filtrarRespuestas(respuestas, filtro),
    [respuestas, filtro],
  );
  const agenda = useMemo(() => porDia(vistos), [vistos]);
  const faltan = useMemo(
    () => faltanPorResponder(capitanes, respuestas),
    [capitanes, respuestas],
  );

  /** Los días del mes que alguien marcó, para el desplegable de filtro. */
  const diasConGente = useMemo(() => {
    const s = new Set<string>();
    for (const r of respuestas) for (const d of r.dias) s.add(d.dateISO);
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [respuestas]);

  const hayFiltro = Boolean(filtro.dateISO || filtro.slot || filtro.modalidad);

  const guardarEdicion = (nombre: string, dias: DiaDisponible[]) =>
    guardarRespuestaAdmin(surveyId, nombre, dias);

  const eliminar = () => {
    const id = borrando?.id;
    if (!id) return;
    setAviso({});
    startTransition(async () => {
      const r = await borrarRespuesta(id);
      setAviso(r);
      setBorrando(null);
      if (r.success) router.refresh();
    });
  };

  const pestaña = (activa: boolean) =>
    "rounded-xl px-4 py-2 text-sm font-semibold transition-colors " +
    (activa
      ? "bg-primary text-white shadow-sm"
      : "border border-border bg-white text-foreground hover:bg-slate-50");

  return (
    <div className="space-y-4">
      {/* Vistas */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setVista("lista")}
          className={pestaña(vista === "lista")}
        >
          📋 Lista (
          {hayFiltro
            ? `${vistos.length} de ${respuestas.length}`
            : respuestas.length}
          )
        </button>
        <button
          type="button"
          onClick={() => setVista("calendario")}
          className={pestaña(vista === "calendario")}
        >
          🗓️ Calendario del mes
        </button>
      </div>

      {/* Filtros */}
      <div className="grid gap-2 rounded-2xl border border-border bg-slate-50 p-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-0.5 block text-xs text-muted">Día</span>
          <Select
            value={filtro.dateISO ?? ""}
            onChange={(e) =>
              setFiltro((f) => ({ ...f, dateISO: e.target.value || undefined }))
            }
            aria-label="Filtrar por día"
          >
            <option value="">Todos los días</option>
            {diasConGente.map((d) => (
              <option key={d} value={d}>
                {etiquetaDeDia(d)}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-xs text-muted">Horario</span>
          <Select
            value={filtro.slot ?? ""}
            onChange={(e) =>
              setFiltro((f) => ({ ...f, slot: e.target.value || undefined }))
            }
            aria-label="Filtrar por horario"
          >
            <option value="">Todos los horarios</option>
            {horarios.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-xs text-muted">Modalidad</span>
          <Select
            value={filtro.modalidad ?? ""}
            onChange={(e) =>
              setFiltro((f) => ({
                ...f,
                modalidad: e.target.value || undefined,
              }))
            }
            aria-label="Filtrar por modalidad"
          >
            <option value="">Las dos</option>
            <option value={MODALIDADES.CASA}>Casa en casa</option>
            <option value={MODALIDADES.ZOOM}>Por Zoom</option>
          </Select>
        </label>
        {hayFiltro ? (
          <div className="sm:col-span-3">
            <button
              type="button"
              onClick={() => setFiltro({})}
              className="text-sm font-semibold text-primary underline"
            >
              Quitar los filtros
            </button>
          </div>
        ) : null}
      </div>

      {aviso.error ? <Alert tone="error">{aviso.error}</Alert> : null}
      {aviso.success ? <Alert tone="success">{aviso.success}</Alert> : null}

      {/* --- Lista --- */}
      {vista === "lista" ? (
        vistos.length === 0 ? (
          <EmptyState
            title={
              respuestas.length === 0
                ? "Todavía no ha respondido nadie"
                : "Ningún hermano cumple ese filtro"
            }
            description={
              respuestas.length === 0
                ? "Reparte el enlace de arriba por WhatsApp; las respuestas aparecen aquí solas, sin recargar la página."
                : "Prueba a quitar algún filtro."
            }
          />
        ) : (
          <ul className="space-y-3">
            {vistos.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-border bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{r.name}</p>
                    <p className="text-sm text-muted">
                      <strong>Disponibilidad:</strong>{" "}
                      {resumenDeDias(
                        r.dias.map((d) => d.dateISO),
                        year,
                        month,
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {r.userId ? (
                      <Badge tone="blue">Desde su cuenta</Badge>
                    ) : (
                      <Badge tone="slate">Por el enlace</Badge>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setEditando(editando === r.id ? null : r.id)
                      }
                      className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium text-foreground hover:bg-slate-50"
                    >
                      {editando === r.id ? "Cerrar" : "✏️ Editar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBorrando(r)}
                      className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      🗑️ Borrar
                    </button>
                  </div>
                </div>

                {/* Día por día, con su horario y su modalidad */}
                <ul className="mt-3 space-y-1">
                  {r.dias.map((d) => (
                    <li
                      key={d.dateISO}
                      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-slate-50 px-3 py-1.5 text-sm"
                    >
                      <span className="font-medium capitalize text-foreground">
                        {etiquetaDeDia(d.dateISO)}
                      </span>
                      <span className="text-muted">
                        {d.slots.length > 0
                          ? d.slots.join(" · ")
                          : "Sin horario concreto"}
                      </span>
                      <Badge tone={d.zoom && !d.houseToHouse ? "violet" : "green"}>
                        {etiquetaModalidad(d)}
                      </Badge>
                    </li>
                  ))}
                </ul>

                {editando === r.id ? (
                  <div className="mt-4 border-t border-border pt-4">
                    <DisponibilidadCapitan
                      year={year}
                      month={month}
                      horarios={horarios}
                      inicial={r.dias}
                      nombreInicial={r.name}
                      nombreFijo
                      textoBoton="Guardar cambios"
                      onGuardar={guardarEdicion}
                      onListo={() => {
                        setEditando(null);
                        router.refresh();
                      }}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}

      {/* --- Calendario --- */}
      {vista === "calendario" ? (
        <div className="rounded-2xl border border-border bg-white p-3">
          <p className="mb-2 text-sm text-muted">
            Quién puede cada día de {etiquetaDelMes(year, month)}.
          </p>
          <div className="mb-1 grid grid-cols-7 gap-1">
            {CABECERA_SEMANA.map((d, i) => (
              <div
                key={i}
                className="py-1 text-center text-xs font-semibold text-muted"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {semanas.flat().map((c, i) => {
              if (c.dateISO === null) return <div key={`v${i}`} aria-hidden />;
              const gente = agenda.get(c.dateISO) ?? [];
              return (
                <div
                  key={c.dateISO}
                  className={
                    "min-h-20 rounded-xl border p-1.5 text-left align-top " +
                    (gente.length > 0
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-white")
                  }
                >
                  <p className="mb-1 text-xs font-semibold text-foreground">
                    {c.dia}
                    {gente.length > 0 ? (
                      <span className="ml-1 font-normal text-muted">
                        ({gente.length})
                      </span>
                    ) : null}
                  </p>
                  {/* En el móvil no caben los nombres: van en la lista de
                      abajo, que solo se ve en pantallas pequeñas. */}
                  <ul className="hidden space-y-0.5 sm:block">
                    {gente.map((g, j) => (
                      <li
                        key={j}
                        title={`${g.name} · ${
                          g.dia.slots.join(" · ") || "sin horario"
                        } · ${etiquetaModalidad(g.dia)}`}
                        className="truncate rounded bg-white px-1 py-0.5 text-[11px] leading-tight text-foreground"
                      >
                        {g.name}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* El mismo calendario, día a día, para leerlo en el móvil. */}
          <ul className="mt-3 space-y-2 sm:hidden">
            {[...agenda.keys()]
              .sort((a, b) => a.localeCompare(b))
              .map((dia) => (
                <li
                  key={dia}
                  className="rounded-xl border border-border bg-white p-2"
                >
                  <p className="text-sm font-semibold capitalize text-foreground">
                    {etiquetaDeDia(dia)}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {(agenda.get(dia) ?? []).map((g, j) => (
                      <li key={j} className="text-xs text-muted">
                        <span className="font-medium text-foreground">
                          {g.name}
                        </span>{" "}
                        · {g.dia.slots.join(" · ") || "sin horario"} ·{" "}
                        {etiquetaModalidad(g.dia)}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      {/* Quién falta */}
      <div className="rounded-2xl border border-border bg-white p-4">
        <p className="text-sm font-semibold text-foreground">
          Todavía no han respondido ({faltan.length})
        </p>
        <p className="mb-2 text-xs text-muted">
          De los hermanos con la casilla Capitán en su usuario.
        </p>
        {capitanes.length === 0 ? (
          <p className="text-sm text-muted">
            Ningún usuario tiene activada la casilla Capitán. Se activa en
            Administración → Usuarios.
          </p>
        ) : faltan.length === 0 ? (
          <Alert tone="success">Han respondido todos. 🎉</Alert>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {faltan.map((c) => (
              <li key={c.id}>
                <Badge tone="amber">{c.name}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={borrando !== null}
        title={`¿Borrar la disponibilidad de ${borrando?.name ?? ""}?`}
        description={`Se borra lo que contestó para ${etiquetaDelMes(year, month)}. No se toca nada más: ni su usuario, ni las respuestas de los demás, ni otros meses.`}
        confirmLabel="Borrar disponibilidad"
        pendingLabel="Borrando…"
        pending={trabajando}
        onCancel={() => setBorrando(null)}
        onConfirm={eliminar}
      />
    </div>
  );
}
