"use client";

// Lo que se contesta desde el enlace público. Solo pasa el token: la
// congregación y el mes los pone el servidor a partir de él, nunca el
// navegador.

import { useState } from "react";
import { DisponibilidadCapitan } from "@/components/forms/DisponibilidadCapitan";
import { responderPorToken } from "@/server/capitanes-actions";
import { Alert } from "@/components/ui";
import type { DiaDisponible } from "@/lib/capitanes";

export function RespuestaPublica({
  token,
  year,
  month,
  horarios,
}: {
  token: string;
  year: number;
  month: number;
  horarios: string[];
}) {
  const [enviada, setEnviada] = useState(false);

  if (enviada) {
    return (
      <div className="space-y-4">
        <Alert tone="success">
          ¡Gracias! Tu disponibilidad quedó guardada. El Administrador ya puede
          verla.
        </Alert>
        <button
          type="button"
          onClick={() => setEnviada(false)}
          className="text-sm font-semibold text-primary underline"
        >
          Cambiar lo que puse
        </button>
      </div>
    );
  }

  return (
    <DisponibilidadCapitan
      year={year}
      month={month}
      horarios={horarios}
      inicial={null}
      onGuardar={(nombre: string, dias: DiaDisponible[]) =>
        responderPorToken(token, nombre, dias)
      }
      onListo={() => setEnviada(true)}
    />
  );
}
