"use client";

// Selector que filtra por grupo cambiando el parámetro ?grupo= de la URL.
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui";

export function GroupFilter({
  groups,
  current,
  paramName = "grupo",
}: {
  groups: { id: string; name: string }[];
  current: string;
  paramName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(paramName, value);
    else params.delete(paramName);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium text-muted">Filtrar por grupo:</label>
      <Select
        className="max-w-xs"
        value={current}
        onChange={(e) => onChange(e.target.value)}
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
