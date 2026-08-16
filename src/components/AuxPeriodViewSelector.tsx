"use client";

import { useRouter, usePathname } from "next/navigation";
import { Select } from "@/components/ui";

export type ViewOption = { year: number; month: number; label: string };

// Selector para consultar inscripciones por período (mes en curso, siguiente y
// meses anteriores con registros). Cambia ?anio y ?mes en la URL.
export function AuxPeriodViewSelector({
  options,
  year,
  month,
}: {
  options: ViewOption[];
  year: number;
  month: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const value = `${year}-${month}`;

  return (
    <Select
      className="sm:max-w-[16rem]"
      aria-label="Consultar inscripciones por período"
      value={value}
      onChange={(e) => {
        const [y, m] = e.target.value.split("-");
        router.push(`${pathname}?anio=${y}&mes=${m}`);
        router.refresh();
      }}
    >
      {options.map((o) => (
        <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
