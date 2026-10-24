"use server";

// ============================================================================
//  Alta y baja de los hermanos disponibles para cada responsabilidad.
//
//  Los nombres salen siempre de los publicadores de la congregación: aquí se
//  guarda el id del publicador, no un texto escrito a mano, así que no puede
//  quedar un nombre que no exista.
//  Acceso: el mismo que para gestionar reuniones.
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMeetingsAccess, congregationId } from "@/lib/access";
import { RESP_CATEGORIES } from "@/lib/constants";
import { logAudit } from "@/lib/audit";
import { type FormState, isUniqueViolation } from "@/server/actions-shared";

function categoria(formData: FormData) {
  const key = String(formData.get("category") ?? "").trim();
  return RESP_CATEGORIES.find((c) => c.key === key) ?? null;
}

export async function addVolunteerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireMeetingsAccess();
  const cong = congregationId(user);

  const cat = categoria(formData);
  if (!cat) return { error: "Tipo de responsabilidad desconocido." };

  const publisherId = String(formData.get("publisherId") ?? "").trim();
  if (!publisherId) return { error: "Elige un hermano de la lista." };

  // El publicador tiene que ser de esta congregación.
  const pub = await prisma.publisher.findFirst({
    where: { id: publisherId, congregationId: cong },
    select: { fullName: true },
  });
  if (!pub) return { error: "Ese publicador no es de tu congregación." };

  try {
    await prisma.responsibilityVolunteer.create({
      data: { congregationId: cong, category: cat.key, publisherId },
    });
  } catch (error) {
    // Ya estaba en esa categoría: no es un fallo, simplemente no se duplica.
    if (isUniqueViolation(error)) {
      return { success: `${pub.fullName} ya estaba en ${cat.label}.` };
    }
    throw error;
  }

  await logAudit({
    userId: user.id,
    action: "EDITAR",
    entity: "Responsabilidades",
    details: `${pub.fullName} añadido a ${cat.label}.`,
  });

  revalidatePath("/reuniones/responsabilidades");
  return { success: `${pub.fullName} añadido a ${cat.label}.` };
}

export async function removeVolunteerAction(formData: FormData): Promise<void> {
  const user = await requireMeetingsAccess();
  const cong = congregationId(user);

  const cat = categoria(formData);
  const publisherId = String(formData.get("publisherId") ?? "").trim();
  if (!cat || !publisherId) return;

  // deleteMany acota por congregación: no se puede tocar la lista de otra.
  const borradas = await prisma.responsibilityVolunteer.deleteMany({
    where: { congregationId: cong, category: cat.key, publisherId },
  });
  if (borradas.count === 0) return;

  const pub = await prisma.publisher.findUnique({
    where: { id: publisherId },
    select: { fullName: true },
  });
  await logAudit({
    userId: user.id,
    action: "EDITAR",
    entity: "Responsabilidades",
    details: `${pub?.fullName ?? publisherId} quitado de ${cat.label}.`,
  });

  revalidatePath("/reuniones/responsabilidades");
}
