"use client";

// Selector de período (año + mes). Cambia ?anio= y ?mes= en la URL.
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui";
import { MONTH_NAMES } from "@/lib/constants";
import { yearOptions } from "@/lib/period";

export function PeriodSelector({
  year,
  month,
}: {
  year: number;
  month: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(key: "anio" | "mes", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        className="w-40"
        value={month}
        onChange={(e) => update("mes", e.target.value)}
      >
        {MONTH_NAMES.map((name, i) => (
          <option key={i + 1} value={i + 1}>
            {name}
          </option>
        ))}
      </Select>
      <Select
        className="w-28"
        value={year}
        onChange={(e) => update("anio", e.target.value)}
      >
        {yearOptions().map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
    </div>
  );
}
