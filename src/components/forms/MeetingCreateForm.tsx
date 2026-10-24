"use client";

import { useActionState } from "react";
import { createMeetingAction } from "@/server/meeting-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Label, Input, Select, Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import {
  MEETING_DAYS,
  MEETING_DAY_LABELS,
  DEFAULT_MEETING_DAYS,
  weekdayName,
  type MeetingDays,
} from "@/lib/constants";

export function MeetingCreateForm({
  days = DEFAULT_MEETING_DAYS,
}: {
  /** Días de reunión de la congregación, para nombrarlos en el desplegable. */
  days?: MeetingDays;
}) {
  const [state, action] = useActionState(createMeetingAction, EMPTY_FORM_STATE);

  return (
    <form action={action} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div>
        <Label htmlFor="date" required>
          Fecha
        </Label>
        <Input id="date" name="date" type="date" required />
      </div>

      <div>
        <Label htmlFor="day" required>
          Día / tipo de reunión
        </Label>
        <Select id="day" name="day" defaultValue={MEETING_DAYS.JUEVES}>
          <option value={MEETING_DAYS.JUEVES}>
            {weekdayName(days.midweekDay)} ({MEETING_DAY_LABELS.JUEVES})
          </option>
          <option value={MEETING_DAYS.SABADO}>
            {weekdayName(days.weekendDay)} ({MEETING_DAY_LABELS.SABADO})
          </option>
        </Select>
      </div>

      <SubmitButton pendingText="Creando…">Crear reunión</SubmitButton>
    </form>
  );
}
