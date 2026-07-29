"use client";

import { useMemo, useState } from "react";
import { Input, Select, EmptyState } from "@/components/ui";
import {
  PublisherRow,
  type PublisherRowData,
} from "@/components/forms/PublisherRow";
import type { GroupOption } from "@/components/forms/PublisherFields";
import {
  PUBLISHER_STATUS_VALUES,
  PUBLISHER_STATUS_LABELS,
  type PublisherStatus,
} from "@/lib/constants";

// Normaliza para buscar sin distinguir acentos ni mayúsculas.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function PublisherList({
  publishers,
  showGroup,
  groups,
}: {
  publishers: PublisherRowData[];
  showGroup: boolean;
  groups: GroupOption[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | PublisherStatus>("");

  // Estados presentes en la lista actual (para no mostrar filtros vacíos).
  const availableStatuses = useMemo(
    () => new Set(publishers.map((p) => p.status)),
    [publishers],
  );

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return publishers.filter((p) => {
      if (status && p.status !== status) return false;
      if (q && !normalize(p.fullName).includes(q)) return false;
      return true;
    });
  }, [publishers, query, status]);

  return (
    <div>
      <div className="border-b border-border px-5 py-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <span
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            >
              🔍
            </span>
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar publicador por nombre…"
              className="pl-9"
              aria-label="Buscar publicador por nombre"
            />
          </div>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as "" | PublisherStatus)}
            aria-label="Filtrar por estado"
            className="sm:max-w-[16rem]"
          >
            <option value="">Todos los estados</option>
            {PUBLISHER_STATUS_VALUES.filter((s) =>
              availableStatuses.has(s),
            ).map((s) => (
              <option key={s} value={s}>
                {PUBLISHER_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        {query.trim() || status ? (
          <p className="mt-2 text-xs text-muted">
            {filtered.length} resultado(s)
            {status ? ` · ${PUBLISHER_STATUS_LABELS[status]}` : ""}
            {query.trim() ? ` · “${query.trim()}”` : ""}.
          </p>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Sin coincidencias"
          description="Ningún publicador coincide con la búsqueda. Prueba con otro nombre."
        />
      ) : (
        <div className="divide-y divide-border">
          {filtered.map((p) => (
            <PublisherRow
              key={p.id}
              showGroup={showGroup}
              groups={groups}
              publisher={p}
            />
          ))}
        </div>
      )}
    </div>
  );
}
