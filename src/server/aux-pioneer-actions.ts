"use server";

// ============================================================================
//  Inscripciones de Precursor Auxiliar
//  La inscripción llega desde un enlace público (sin sesión). El año/mes viene
//  en el enlace que armó el Administrador, así queda en el período elegido y no
//  en el mes actual. Evita duplicados por persona + período (upsert).
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSecretary } from "@/lib/access";

export type SignupState = { error?: string; success?: string };

// ¿Está permitida la inscripción de 15 horas para ese período? (por defecto sí)
export async function isFifteenAllowed(
  year: number,
  month: number,
): Promise<boolean> {
  const s = await prisma.auxPioneerSetting.findUnique({
    where: { year_month: { year, month } },
    select: { allow15h: true },
  });
  return s?.allow15h ?? true;
}

// El Administrador activa/desactiva la opción de 15 horas para un período.
export async function setAllow15hAction(
  year: number,
  month: number,
  allow: boolean,
): Promise<void> {
  await requireSecretary();
  await prisma.auxPioneerSetting.upsert({
    where: { year_month: { year, month } },
    update: { allow15h: allow },
    create: { year, month, allow15h: allow },
  });
  revalidatePath("/precursores-auxiliares");
  revalidatePath("/precursor-auxiliar");
}

// Normaliza el nombre para detectar duplicados (sin acentos, minúsculas).
function normalizeName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

export async function signupAuxiliaryPioneerAction(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const name = String(formData.get("name") ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const hours = parseInt(String(formData.get("hours") ?? ""), 10);
  const year = parseInt(String(formData.get("year") ?? ""), 10);
  const month = parseInt(String(formData.get("month") ?? ""), 10);

  if (!name) return { error: "Escribe tu nombre." };
  if (hours !== 15 && hours !== 30)
    return { error: "Selecciona 15 o 30 horas." };
  if (
    isNaN(year) ||
    isNaN(month) ||
    month < 1 ||
    month > 12 ||
    year < 2000 ||
    year > 2100
  ) {
    return { error: "El período de la invitación no es válido." };
  }

  // Si el Administrador desactivó las 15 horas para este mes, no se permite.
  if (hours === 15 && !(await isFifteenAllowed(year, month))) {
    return {
      error: "Para este mes solo está disponible la opción de 30 horas.",
    };
  }

  const nameKey = normalizeName(name);
  if (!nameKey) return { error: "Escribe tu nombre." };

  // Una inscripción por persona y período: si ya existe, se actualiza.
  await prisma.auxiliaryPioneerSignup.upsert({
    where: { nameKey_year_month: { nameKey, year, month } },
    update: { name, hours },
    create: { name, nameKey, hours, year, month },
  });

  revalidatePath("/precursores-auxiliares");
  return {
    success: "¡Inscripción registrada correctamente!",
  };
}
