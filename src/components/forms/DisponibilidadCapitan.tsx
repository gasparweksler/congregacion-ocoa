"use client";

// ============================================================================
//  El formulario de disponibilidad de capitán.
//
//  Es el mismo en los tres sitios donde se contesta —el enlace público, la
//  cuenta del hermano y la corrección del Administrador—, así que se escribe
//  una vez y cada pantalla le dice a quién guardar.
//
//  Pensado para el teléfono: el calendario se toca con el dedo (casillas
//  grandes), los horarios son botones y no hay menús que se escapen.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import {
  CABECERA_SEMANA,
  etiquetaDeDia,
  etiquetaDelMes,
  etiquetaModalidad,
  resumenDeDias,
  semanasDelMes,
  type DiaDisponible,
} from "@/lib/capitanes";
import { Alert, Button } from "@/components/ui";
import type { FormState } from "@/server/actions-shared";

/** Lo que se sabe de un día mientras se rellena el formulario. */
type Elegido = {
  slots: string[];
  houseToHouse: boolean;
  zoom: boolean;
  /** Verdadero si ese día tiene horarios o modalidad propios. */
  propio: boolean;
};

export function DisponibilidadCapitan({
  year,
  month,
  horarios,
  inicial,
  nombreInicial = "",
  nombreFijo = false,
  textoBoton = "Enviar disponibilidad",
  onGuardar,
  onListo,
}: {
  year: number;
  month: number;
  /** Los horarios que configuró el Administrador. */
  horarios: string[];
  /** Lo que ya tenía contestado, si contestó. */
  inicial: DiaDisponible[] | null;
  nombreInicial?: string;
  /** Con sesión el nombre no se escribe: es el del usuario. */
  nombreFijo?: boolean;
  textoBoton?: string;
  /** Quién guarda: lo pone cada pantalla. */
  onGuardar: (nombre: string, dias: DiaDisponible[]) => Promise<FormState>;
  /** Se llama al guardar bien (para cerrar un panel, por ejemplo). */
  onListo?: () => void;
}) {
  const semanas = useMemo(() => semanasDelMes(year, month), [year, month]);

  const [nombre, setNombre] = useState(nombreInicial);
  const [dias, setDias] = useState<Map<string, Elegido>>(() => {
    const m = new Map<string, Elegido>();
    for (const d of inicial ?? []) {
      m.set(d.dateISO, {
        slots: d.slots,
        houseToHouse: d.houseToHouse,
        zoom: d.zoom,
        propio: true,
      });
    }
    return m;
  });

  // Lo que se aplica a los días que no se han ajustado uno a uno.
  const [slotsGeneral, setSlotsGeneral] = useState<string[]>(
    inicial?.[0]?.slots ?? [],
  );
  const [casaGeneral, setCasaGeneral] = useState(
    inicial?.[0] ? inicial[0].houseToHouse : true,
  );
  const [zoomGeneral, setZoomGeneral] = useState(inicial?.[0]?.zoom ?? false);

  const [abierto, setAbierto] = useState<string | null>(null);
  const [aviso, setAviso] = useState<FormState>({});
  const [guardando, startTransition] = useTransition();

  const elegidos = useMemo(
    () => [...dias.keys()].sort((a, b) => a.localeCompare(b)),
    [dias],
  );

  // --- Tocar el calendario --------------------------------------------------
  const alternarDia = (dateISO: string) => {
    setAviso({});
    setDias((prev) => {
      const m = new Map(prev);
      if (m.has(dateISO)) m.delete(dateISO);
      else
        m.set(dateISO, {
          slots: slotsGeneral,
          houseToHouse: casaGeneral,
          zoom: zoomGeneral,
          propio: false,
        });
      return m;
    });
  };

  /** Cambia lo general y arrastra los días que no tienen ajuste propio. */
  const aplicarGeneral = (cambio: Partial<Omit<Elegido, "propio">>) => {
    setDias((prev) => {
      const m = new Map(prev);
      for (const [k, v] of m) {
        if (!v.propio) m.set(k, { ...v, ...cambio });
      }
      return m;
    });
  };

  const alternarSlotGeneral = (slot: string) => {
    const siguiente = slotsGeneral.includes(slot)
      ? slotsGeneral.filter((s) => s !== slot)
      : [...slotsGeneral, slot];
    setSlotsGeneral(siguiente);
    aplicarGeneral({ slots: siguiente });
  };

  const alternarSlotDia = (dateISO: string, slot: string) => {
    setDias((prev) => {
      const m = new Map(prev);
      const v = m.get(dateISO);
      if (!v) return prev;
      const slots = v.slots.includes(slot)
        ? v.slots.filter((s) => s !== slot)
        : [...v.slots, slot];
      m.set(dateISO, { ...v, slots, propio: true });
      return m;
    });
  };

  const cambiarModalidadDia = (
    dateISO: string,
    cual: "casa" | "zoom",
    valor: boolean,
  ) => {
    setDias((prev) => {
      const m = new Map(prev);
      const v = m.get(dateISO);
      if (!v) return prev;
      m.set(dateISO, {
        ...v,
        houseToHouse: cual === "casa" ? valor : v.houseToHouse,
        zoom: cual === "zoom" ? valor : v.zoom,
        propio: true,
      });
      return m;
    });
  };

  // --- Guardar --------------------------------------------------------------
  const enviar = () => {
    const lista: DiaDisponible[] = elegidos.map((dateISO) => {
      const v = dias.get(dateISO)!;
      return {
        dateISO,
        slots: v.slots,
        houseToHouse: v.houseToHouse,
        zoom: v.zoom,
      };
    });
    setAviso({});
    startTransition(async () => {
      const r = await onGuardar(nombre, lista);
      setAviso(r);
      if (r.success) onListo?.();
    });
  };

  const resumen = resumenDeDias(elegidos, year, month);

  // --- Pintar ---------------------------------------------------------------
  const casillaDia = (seleccionado: boolean) =>
    "flex aspect-square w-full items-center justify-center rounded-xl text-sm font-semibold transition-colors " +
    (seleccionado
      ? "bg-primary text-white shadow-sm"
      : "border border-border bg-white text-foreground hover:bg-slate-50");

  const chip = (activo: boolean) =>
    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors " +
    (activo
      ? "bg-primary text-white"
      : "border border-border bg-white text-foreground hover:bg-slate-50");

  return (
    <div className="space-y-5">
      {/* Nombre */}
      <div>
        <label
          className="mb-1 block text-sm font-medium text-foreground"
          htmlFor="capitan-nombre"
        >
          Nombre
        </label>
        <input
          id="capitan-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          readOnly={nombreFijo}
          placeholder="Nombre y apellido"
          autoComplete="name"
          className={
            "w-full rounded-xl border border-border px-3.5 py-2.5 text-base text-foreground outline-none focus:border-primary " +
            (nombreFijo ? "bg-slate-100" : "bg-white")
          }
        />
      </div>

      {/* Calendario */}
      <div>
        <p className="mb-1 text-sm font-medium text-foreground">
          ¿Qué días puedes ser capitán en {etiquetaDelMes(year, month)}?
        </p>
        <p className="mb-2 text-xs text-muted">
          Toca los días en que puedes. Para quitar uno, vuelve a tocarlo.
        </p>

        <div className="rounded-2xl border border-border bg-slate-50 p-2">
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
            {semanas.flat().map((c, i) =>
              c.dateISO === null ? (
                <div key={`v${i}`} aria-hidden />
              ) : (
                <button
                  key={c.dateISO}
                  type="button"
                  onClick={() => alternarDia(c.dateISO!)}
                  aria-pressed={dias.has(c.dateISO)}
                  aria-label={`${c.dia} de ${etiquetaDelMes(year, month)}`}
                  className={casillaDia(dias.has(c.dateISO))}
                >
                  {c.dia}
                </button>
              ),
            )}
          </div>
        </div>

        {/* Leyenda */}
        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded bg-primary" />
            Día elegido
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded border border-border bg-white" />
            Día libre, sin elegir
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded bg-slate-50" />
            Fuera del mes
          </span>
        </div>

        <p className="mt-2 text-sm text-foreground">
          {resumen ? (
            <>
              <strong>Disponibilidad:</strong> {resumen}
            </>
          ) : (
            <span className="text-muted">
              Todavía no has elegido ningún día.
            </span>
          )}
        </p>
      </div>

      {/* Horarios y modalidad, para todos los días */}
      <div className="space-y-3 rounded-2xl border border-border bg-white p-3">
        <div>
          <p className="text-sm font-medium text-foreground">Horarios</p>
          <p className="mb-2 text-xs text-muted">
            {horarios.length > 0
              ? "Se aplican a todos los días que elijas. Abajo puedes cambiar los de un día suelto."
              : "El Administrador todavía no ha cargado horarios; puedes enviar tu disponibilidad igual."}
          </p>
          <div className="flex flex-wrap gap-2">
            {horarios.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => alternarSlotGeneral(h)}
                aria-pressed={slotsGeneral.includes(h)}
                className={chip(slotsGeneral.includes(h))}
              >
                {h}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-foreground">
            Modalidad de predicación
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const v = !casaGeneral;
                setCasaGeneral(v);
                aplicarGeneral({ houseToHouse: v });
              }}
              aria-pressed={casaGeneral}
              className={chip(casaGeneral)}
            >
              🚪 Casa en casa
            </button>
            <button
              type="button"
              onClick={() => {
                const v = !zoomGeneral;
                setZoomGeneral(v);
                aplicarGeneral({ zoom: v });
              }}
              aria-pressed={zoomGeneral}
              className={chip(zoomGeneral)}
            >
              💻 Por Zoom
            </button>
          </div>
        </div>
      </div>

      {/* Cada día, por si uno es distinto */}
      {elegidos.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            Tus días ({elegidos.length})
          </p>
          {elegidos.map((dateISO) => {
            const v = dias.get(dateISO)!;
            const desplegado = abierto === dateISO;
            return (
              <div
                key={dateISO}
                className="rounded-xl border border-border bg-white p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium capitalize text-foreground">
                      {etiquetaDeDia(dateISO)}
                    </p>
                    <p className="text-xs text-muted">
                      {v.slots.length > 0
                        ? v.slots.join(" · ")
                        : "Sin horario concreto"}{" "}
                      · {etiquetaModalidad(v)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAbierto(desplegado ? null : dateISO)}
                      className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium text-foreground hover:bg-slate-50"
                    >
                      {desplegado ? "Listo" : "Ajustar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => alternarDia(dateISO)}
                      className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      Quitar
                    </button>
                  </div>
                </div>

                {desplegado ? (
                  <div className="mt-3 space-y-3 border-t border-border pt-3">
                    {horarios.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {horarios.map((h) => (
                          <button
                            key={h}
                            type="button"
                            onClick={() => alternarSlotDia(dateISO, h)}
                            aria-pressed={v.slots.includes(h)}
                            className={chip(v.slots.includes(h))}
                          >
                            {h}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          cambiarModalidadDia(dateISO, "casa", !v.houseToHouse)
                        }
                        aria-pressed={v.houseToHouse}
                        className={chip(v.houseToHouse)}
                      >
                        🚪 Casa en casa
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          cambiarModalidadDia(dateISO, "zoom", !v.zoom)
                        }
                        aria-pressed={v.zoom}
                        className={chip(v.zoom)}
                      >
                        💻 Por Zoom
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {aviso.error ? <Alert tone="error">{aviso.error}</Alert> : null}
      {aviso.success ? <Alert tone="success">{aviso.success}</Alert> : null}

      <Button onClick={enviar} disabled={guardando} className="w-full sm:w-auto">
        {guardando ? "Guardando…" : textoBoton}
      </Button>
    </div>
  );
}
