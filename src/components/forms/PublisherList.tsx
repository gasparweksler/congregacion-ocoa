"use client";

import { useMemo, useState } from "react";
import { Input, EmptyState } from "@/components/ui";
import {
  PublisherRow,
  type PublisherRowData,
} from "@/components/forms/PublisherRow";
import type { GroupOption } from "@/components/forms/PublisherFields";

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

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return publishers;
    return publishers.filter((p) => normalize(p.fullName).includes(q));
  }, [publishers, query]);

  return (
    <div>
      <div className="border-b border-border px-5 py-3">
        <div className="relative">
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
        {query.trim() ? (
          <p className="mt-2 text-xs text-muted">
            {filtered.length} resultado(s) para “{query.trim()}”.
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
