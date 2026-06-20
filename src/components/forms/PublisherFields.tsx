"use client";

// Campos compartidos por los formularios de crear/editar publicador.
import { Label, Input, Select } from "@/components/ui";
import {
  PUBLISHER_STATUS_VALUES,
  PUBLISHER_STATUS_LABELS,
  SEX,
  SEX_LABELS,
} from "@/lib/constants";

export type GroupOption = { id: string; name: string };

export type PublisherDefaults = {
  fullName?: string;
  sex?: string | null;
  birthDate?: string | null; // yyyy-mm-dd
  baptismDate?: string | null; // yyyy-mm-dd
  status?: string;
  groupId?: string | null;
};

export function PublisherFields({
  defaults,
  showGroup,
  groups,
}: {
  defaults?: PublisherDefaults;
  showGroup: boolean;
  groups: GroupOption[];
}) {
  const d = defaults ?? {};
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label required>Nombre completo</Label>
        <Input name="fullName" defaultValue={d.fullName ?? ""} required />
      </div>

      <div>
        <Label>Sexo (opcional)</Label>
        <Select name="sex" defaultValue={d.sex ?? ""}>
          <option value="">— Sin especificar —</option>
          <option value={SEX.M}>{SEX_LABELS.M}</option>
          <option value={SEX.F}>{SEX_LABELS.F}</option>
        </Select>
      </div>

      <div>
        <Label required>Estado</Label>
        <Select name="status" defaultValue={d.status ?? PUBLISHER_STATUS_VALUES[0]}>
          {PUBLISHER_STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {PUBLISHER_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label>Fecha de nacimiento (opcional)</Label>
        <Input type="date" name="birthDate" defaultValue={d.birthDate ?? ""} />
      </div>

      <div>
        <Label>Fecha de bautismo (si aplica)</Label>
        <Input
          type="date"
          name="baptismDate"
          defaultValue={d.baptismDate ?? ""}
        />
      </div>

      {showGroup ? (
        <div className="sm:col-span-2">
          <Label required>Grupo</Label>
          <Select name="groupId" defaultValue={d.groupId ?? ""} required>
            <option value="" disabled>
              Selecciona un grupo
            </option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
    </div>
  );
}
