"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui";
import { MONTH_NAMES } from "@/lib/constants";

export function HistoryFilters({
  years,
  groups,
}: {
  years: number[];
  groups: { id: string; name: string }[];
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const set = (key: string, value: string) => {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/informes/historial?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Select
        className="w-auto"
        value={sp.get("anio") ?? ""}
        onChange={(e) => set("anio", e.target.value)}
      >
        <option value="">Todos los años</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
      <Select
        className="w-auto"
        value={sp.get("mes") ?? ""}
        onChange={(e) => set("mes", e.target.value)}
      >
        <option value="">Todos los meses</option>
        {MONTH_NAMES.map((m, i) => (
          <option key={i} value={i + 1}>
            {m}
          </option>
        ))}
      </Select>
      <Select
        className="w-auto"
        value={sp.get("grupo") ?? ""}
        onChange={(e) => set("grupo", e.target.value)}
      >
        <option value="">Todos los grupos</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
