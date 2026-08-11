"use client";

import { useActionState } from "react";
import { signupAuxiliaryPioneerAction, type SignupState } from "@/server/aux-pioneer-actions";
import { Label, Input, Select, Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

const initial: SignupState = {};

export function AuxPioneerSignupForm({
  year,
  month,
  periodLabel,
  allow15,
}: {
  year: number;
  month: number;
  periodLabel: string;
  allow15: boolean;
}) {
  const [state, formAction] = useActionState(
    signupAuxiliaryPioneerAction,
    initial,
  );

  if (state.success) {
    return (
      <Alert tone="success">
        ✅ {state.success} Quedaste inscrito como Precursor Auxiliar para{" "}
        <strong>{periodLabel}</strong>. ¡Muchísimas gracias! 💚
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div className="rounded-xl border border-border bg-slate-50 px-4 py-3 text-sm">
        <span className="text-muted">Mes de inscripción:</span>{" "}
        <span className="font-semibold text-foreground">{periodLabel}</span>
      </div>

      <div>
        <Label htmlFor="name" required>
          Nombre
        </Label>
        <Input
          id="name"
          name="name"
          placeholder="Escribe tu nombre completo"
          autoComplete="name"
          required
        />
      </div>

      <div>
        <Label htmlFor="hours" required>
          Horas
        </Label>
        <Select
          id="hours"
          name="hours"
          defaultValue={allow15 ? "" : "30"}
          required
        >
          {allow15 ? (
            <option value="" disabled>
              — Selecciona —
            </option>
          ) : null}
          {allow15 ? <option value="15">15 Horas</option> : null}
          <option value="30">30 Horas</option>
        </Select>
        {!allow15 ? (
          <p className="mt-1 text-xs text-muted">
            Para este mes solo está disponible la opción de 30 horas.
          </p>
        ) : null}
      </div>

      <SubmitButton pendingText="Registrando inscripción…" className="w-full">
        Confirmar inscripción
      </SubmitButton>
    </form>
  );
}
