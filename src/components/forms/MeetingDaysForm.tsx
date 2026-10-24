"use client";

// Días de reunión de la congregación: uno de entre semana (lunes a viernes) y
// uno de fin de semana (sábado o domingo). Cada congregación tiene los suyos.

import { useActionState } from "react";
import { setMeetingDaysAction } from "@/server/meeting-days-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import {
  MIDWEEK_DAY_OPTIONS,
  WEEKEND_DAY_OPTIONS,
  weekdayName,
  type MeetingDays,
} from "@/lib/constants";

function Grupo({
  titulo,
  ayuda,
  name,
  opciones,
  actual,
  disabled,
}: {
  titulo: string;
  ayuda: string;
  name: string;
  opciones: readonly number[];
  actual: number;
  disabled: boolean;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-semibold text-foreground">{titulo}</legend>
      <p className="mb-2 text-xs text-muted">{ayuda}</p>
      <div className="flex flex-wrap gap-1.5">
        {opciones.map((d) => (
          <label
            key={d}
            // El día elegido va en color primario con texto blanco (igual que
            // el botón): así se distingue bien tanto en claro como en oscuro.
            className="inline-flex cursor-pointer items-center rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground transition-colors hover:bg-slate-50 has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:font-semibold has-[:checked]:text-white has-[:disabled]:cursor-default"
          >
            <input
              type="radio"
              name={name}
              value={d}
              defaultChecked={d === actual}
              disabled={disabled}
              className="sr-only"
            />
            {weekdayName(d)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function MeetingDaysForm({
  days,
  canEdit,
}: {
  days: MeetingDays;
  canEdit: boolean;
}) {
  const [state, action] = useActionState(setMeetingDaysAction, EMPTY_FORM_STATE);

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <Grupo
        titulo="Fin de semana"
        ayuda="El día de la reunión del fin de semana."
        name="weekendDay"
        opciones={WEEKEND_DAY_OPTIONS}
        actual={days.weekendDay}
        disabled={!canEdit}
      />
      <Grupo
        titulo="Entre semana"
        ayuda="El día de la reunión de Vida y Ministerio."
        name="midweekDay"
        opciones={MIDWEEK_DAY_OPTIONS}
        actual={days.midweekDay}
        disabled={!canEdit}
      />

      {canEdit ? (
        <>
          <SubmitButton pendingText="Guardando…">Guardar días</SubmitButton>
          <p className="text-xs text-muted">
            Cambiarlos no mueve las reuniones ya creadas: se aplica a las fechas
            que se ofrecen de aquí en adelante.
          </p>
        </>
      ) : (
        <p className="text-xs text-muted">
          Solo el Administrador puede cambiar los días de reunión.
        </p>
      )}
    </form>
  );
}
