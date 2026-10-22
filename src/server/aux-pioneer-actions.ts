"use server";

// ============================================================================
//  Inscripciones de Precursor Auxiliar
//  La inscripción llega desde un enlace público (sin sesión). El enlace lleva
//  la CONGREGACIÓN y el año/mes que armó el Administrador: sin la congregación
//  la inscripción no sabría a quién pertenece. Evita duplicados por persona +
//  período dentro de cada congregación (upsert).
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSecretary, congregationId } from "@/lib/access";

export type SignupState = { error?: string; success?: string };

// ¿Está permitida la inscripción de 15 horas para ese período? (por defecto sí)
export async function isFifteenAllowed(
  congregation: string,
  year: number,
  month: number,
): Promise<boolean> {
  const s = await prisma.auxPioneerSetting.findUnique({
    where: {
      congregationId_year_month: { congregationId: congregation, year, month },
    },
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
  const user = await requireSecretary();
  const cong = congregationId(user);
  await prisma.auxPioneerSetting.upsert({
    where: { congregationId_year_month: { congregationId: cong, year, month } },
    update: { allow15h: allow },
    create: { congregationId: cong, year, month, allow15h: allow },
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
  // La congregación viene del enlace, no de una sesión (la página es pública).
  const slug = String(formData.get("congregacion") ?? "").trim();

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

  // Sin congregación válida no se guarda nada: así una inscripción nunca cae
  // en la congregación equivocada.
  const congregation = slug
    ? await prisma.congregation.findFirst({
        where: { slug, active: true },
        select: { id: true },
      })
    : null;
  if (!congregation) {
    return {
      error:
        "El enlace de invitación no es válido. Pide al administrador que te envíe uno nuevo.",
    };
  }

  // Si el Administrador desactivó las 15 horas para este mes, no se permite.
  if (hours === 15 && !(await isFifteenAllowed(congregation.id, year, month))) {
    return {
      error: "Para este mes solo está disponible la opción de 30 horas.",
    };
  }

  const nameKey = normalizeName(name);
  if (!nameKey) return { error: "Escribe tu nombre." };

  // Una inscripción por persona y período EN SU congregación: si ya existe,
  // se actualiza. Un tocayo de otra congregación ya no la bloquea.
  await prisma.auxiliaryPioneerSignup.upsert({
    where: {
      congregationId_nameKey_year_month: {
        congregationId: congregation.id,
        nameKey,
        year,
        month,
      },
    },
    update: { name, hours },
    create: {
      congregationId: congregation.id,
      name,
      nameKey,
      hours,
      year,
      month,
    },
  });

  revalidatePath("/precursores-auxiliares");
  return {
    success: "¡Inscripción registrada correctamente!",
  };
}
