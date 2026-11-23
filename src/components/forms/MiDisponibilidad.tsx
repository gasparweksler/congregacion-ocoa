"use client";

// La disponibilidad del propio hermano, desde su cuenta. El nombre no se
// escribe: es el de su usuario, para que el Administrador sepa seguro quién
// contestó y no se dupliquen dos formas de escribir el mismo nombre.

import { useRouter } from "next/navigation";
import { DisponibilidadCapitan } from "@/components/forms/DisponibilidadCapitan";
import { guardarMiDisponibilidad } from "@/server/capitanes-actions";
import type { DiaDisponible } from "@/lib/capitanes";

export function MiDisponibilidad({
  surveyId,
  year,
  month,
  horarios,
  inicial,
  nombre,
}: {
  surveyId: string;
  year: number;
  month: number;
  horarios: string[];
  inicial: DiaDisponible[] | null;
  nombre: string;
}) {
  const router = useRouter();

  return (
    <DisponibilidadCapitan
      year={year}
      month={month}
      horarios={horarios}
      inicial={inicial}
      nombreInicial={nombre}
      nombreFijo
      textoBoton={inicial ? "Guardar cambios" : "Enviar disponibilidad"}
      onGuardar={(_nombre: string, dias: DiaDisponible[]) =>
        guardarMiDisponibilidad(surveyId, dias)
      }
      onListo={() => router.refresh()}
    />
  );
}
