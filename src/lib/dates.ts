// Utilidades de fecha para la interfaz.

import { weekdayName } from "@/lib/constants";

/** Convierte una fecha a "yyyy-mm-dd" (para inputs type=date). */
export function toInputDate(date: Date | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/** Formatea una fecha en español legible (dd/mm/aaaa). */
export function formatDate(date: Date | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Calcula la edad en años a partir de una fecha de nacimiento. */
export function ageFrom(date: Date | null | undefined): number | null {
  if (!date) return null;
  const b = new Date(date);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

/**
 * Nombre del día de una fecha "YYYY-MM-DD" ("Jueves", "Domingo"…).
 *
 * Se calcula de la fecha y no del tipo de reunión, porque el día de reunión ya
 * no es fijo: cada congregación elige el suyo. Se construye con las partes
 * sueltas (y a mediodía) para que no se desplace por la zona horaria.
 */
export function weekdayNameOfISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return weekdayName(new Date(y, m - 1, d, 12, 0, 0).getDay());
}
