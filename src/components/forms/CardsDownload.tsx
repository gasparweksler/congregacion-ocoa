"use client";

// Panel "Descargar Tarjetas": arma la descarga del formulario S-21 de uno o
// de muchos publicadores según el filtro. Una sola tarjeta llega como PDF;
// varias, como un ZIP con un PDF por hermano.

import { useState } from "react";
import { Button, Label, Input, Select } from "@/components/ui";
import { DownloadButton } from "@/components/DownloadButton";
import {
  PUBLISHER_STATUS_VALUES,
  PUBLISHER_STATUS_LABELS,
  PRIVILEGE_VALUES,
  PRIVILEGE_LABELS,
  type Privilege,
} from "@/lib/constants";

export function CardsDownload({
  groups,
  showGroup,
  serviceYears,
  defaultServiceYear,
}: {
  groups: { id: string; name: string }[];
  showGroup: boolean;
  serviceYears: number[];
  defaultServiceYear: number;
}) {
  const [open, setOpen] = useState(false);
  const [anio, setAnio] = useState(String(defaultServiceYear));
  const [estado, setEstado] = useState("");
  const [privilegio, setPrivilegio] = useState("");
  const [grupo, setGrupo] = useState("");
  const [q, setQ] = useState("");

  const href = (() => {
    const p = new URLSearchParams({ anio });
    if (estado) p.set("estado", estado);
    if (privilegio) p.set("privilegio", privilegio);
    if (grupo) p.set("grupo", grupo);
    if (q.trim()) p.set("q", q.trim());
    return `/api/tarjetas?${p.toString()}`;
  })();

  const limpiar = () => {
    setEstado("");
    setPrivilegio("");
    setGrupo("");
    setQ("");
  };

  return (
    <div>
      <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
        🗂️ Descargar Tarjetas
      </Button>

      {open ? (
        <div className="mt-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            Descargar Tarjetas
          </h3>
          <p className="mt-0.5 text-sm text-muted">
            Elige a quién incluir. Si coincide un solo hermano se descarga su
            tarjeta en PDF; si son varios, un ZIP con un PDF por hermano.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Año de servicio</Label>
              <Select value={anio} onChange={(e) => setAnio(e.target.value)}>
                {serviceYears.map((y) => (
                  <option key={y} value={y}>
                    {y} (sep {y - 1} – ago {y})
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Buscar por nombre</Label>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nombre del publicador…"
              />
            </div>

            <div>
              <Label>Estado</Label>
              <Select value={estado} onChange={(e) => setEstado(e.target.value)}>
                <option value="">— Todos —</option>
                {PUBLISHER_STATUS_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {PUBLISHER_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Privilegio</Label>
              <Select
                value={privilegio}
                onChange={(e) => setPrivilegio(e.target.value)}
              >
                <option value="">— Todos —</option>
                {PRIVILEGE_VALUES.map((p: Privilege) => (
                  <option key={p} value={p}>
                    {PRIVILEGE_LABELS[p]}
                  </option>
                ))}
              </Select>
            </div>

            {showGroup ? (
              <div className="sm:col-span-2">
                <Label>Grupo</Label>
                <Select value={grupo} onChange={(e) => setGrupo(e.target.value)}>
                  <option value="">— Todos —</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {/* Puede ser un PDF o un ZIP con decenas de tarjetas: lo que más
                tarda de toda la aplicación. */}
            <DownloadButton
              href={href}
              variant="primary"
              pendingText="Generando tarjetas…"
              hint="Se está armando el archivo. Con muchas tarjetas puede tardar un poco."
            >
              📥 Descargar
            </DownloadButton>
            <Button variant="ghost" onClick={limpiar}>
              Limpiar filtros
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
