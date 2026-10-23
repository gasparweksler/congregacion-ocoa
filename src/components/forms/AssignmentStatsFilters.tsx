"use client";

// Filtros de las Estadísticas de Asignaciones. Van por la URL para que la
// consulta se pueda compartir y volver atrás funcione; tras navegar se refresca
// para evitar la caché del enrutador (mismo patrón que el resto de filtros).

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Label, Input, Select, Button } from "@/components/ui";
import { MEETING_SECTION_LABELS } from "@/lib/constants";

export function AssignmentStatsFilters({
  sections,
  incluirResponsabilidades,
}: {
  sections: string[];
  incluirResponsabilidades: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pendiente, setPendiente] = useState(false);

  const valor = (k: string) => sp.get(k) ?? "";

  const aplicar = (form: HTMLFormElement) => {
    const fd = new FormData(form);
    const next = new URLSearchParams();
    for (const [k, v] of fd.entries()) {
      const s = String(v).trim();
      if (s) next.set(k, s);
    }
    setPendiente(true);
    router.push(`/reuniones/estadisticas?${next.toString()}`);
    router.refresh();
    setTimeout(() => setPendiente(false), 600);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        aplicar(e.currentTarget);
      }}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      <div className="sm:col-span-2 lg:col-span-1">
        <Label htmlFor="q">Buscar hermano</Label>
        <Input
          id="q"
          name="q"
          defaultValue={valor("q")}
          placeholder="Nombre o parte del nombre…"
        />
      </div>

      <div>
        <Label htmlFor="section">Tipo de asignación</Label>
        <Select id="section" name="section" defaultValue={valor("section")}>
          <option value="">— Todas —</option>
          {sections.map((s) => (
            <option key={s} value={s}>
              {MEETING_SECTION_LABELS[s] ?? s}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="dias">Avisar tras … días sin asignación</Label>
        <Input
          id="dias"
          name="dias"
          type="number"
          inputMode="numeric"
          min={1}
          max={3650}
          defaultValue={valor("dias") || "90"}
          placeholder="90"
        />
      </div>

      <div>
        <Label htmlFor="desde">Desde</Label>
        <Input id="desde" name="desde" type="date" defaultValue={valor("desde")} />
      </div>

      <div>
        <Label htmlFor="hasta">Hasta</Label>
        <Input id="hasta" name="hasta" type="date" defaultValue={valor("hasta")} />
      </div>

      <div className="flex items-end">
        <label className="flex items-center gap-2 pb-2.5 text-sm text-foreground">
          <input
            type="checkbox"
            name="resp"
            value="1"
            defaultChecked={incluirResponsabilidades}
          />
          Incluir responsabilidades
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3">
        <Button type="submit" variant="primary">
          {pendiente ? "Buscando…" : "🔎 Aplicar filtros"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setPendiente(true);
            router.push("/reuniones/estadisticas");
            router.refresh();
            setTimeout(() => setPendiente(false), 600);
          }}
        >
          Limpiar
        </Button>
      </div>
    </form>
  );
}
