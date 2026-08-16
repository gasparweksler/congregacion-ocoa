"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui";

// Filtro por tipo de publicador (todos / precursores / regulares / auxiliares).
// Cambia el parámetro ?tipo= y refresca los datos.
export function ReportTypeFilter({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("tipo", value);
    else params.delete("tipo");
    router.push(`${pathname}?${params.toString()}`);
    router.refresh();
  }

  return (
    <Select
      className="max-w-xs"
      aria-label="Filtrar por tipo de publicador"
      value={current}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Todos los publicadores</option>
      <option value="precursores">Solo precursores</option>
      <option value="regular">Precursores Regulares</option>
      <option value="auxiliar">Precursores Auxiliares</option>
    </Select>
  );
}
