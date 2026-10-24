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
import { RESP_MANAGED_CATEGORIES } from "@/lib/constants";
import { matchPublisher, normalizeName } from "@/lib/assignment-stats";
import { logAudit } from "@/lib/audit";
import { type FormState, isUniqueViolation } from "@/server/actions-shared";

function categoria(formData: FormData) {
  const key = String(formData.get("category") ?? "").trim();
  return RESP_MANAGED_CATEGORIES.find((c) => c.key === key) ?? null;
}

export async function addVolunteerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireMeetingsAccess();
  const cong = congregationId(user);

  const cat = categoria(formData);
  if (!cat) return { error: "Tipo de responsabilidad desconocido." };

  // Se escribe el nombre (con autocompletado) y aquí se resuelve a un
  // publicador real: así no puede guardarse un nombre que no exista.
  const escrito = String(formData.get("name") ?? "").replace(/\s+/g, " ").trim();
  if (!escrito) return { error: "Escribe el nombre del hermano." };

  const publicadores = await prisma.publisher.findMany({
    where: { congregationId: cong },
    select: { id: true, fullName: true },
  });
  // Mismo emparejado que usan las estadísticas: exacto o, si no, por palabras
  // y solo cuando no hay ambigüedad.
  const indice = new Map(
    publicadores.map((x) => [normalizeName(x.fullName), x]),
  );
  const pub = matchPublisher(escrito, publicadores, indice);
  if (!pub) {
    return {
      error: `No hay ningún publicador que coincida con "${escrito}". Escríbelo como aparece en Publicadores (la lista te va sugiriendo).`,
    };
  }
  const publisherId = pub.id;

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

/**
 * Interruptor "Repetir los de Sonido" de la categoría Video: los disponibles
 * de Video pasan a ser exactamente los de Audio.
 */
export async function setVideoSameAsAudioAction(
  formData: FormData,
): Promise<void> {
  const user = await requireMeetingsAccess();
  const cong = congregationId(user);
  const activo = String(formData.get("value") ?? "") === "si";

  await prisma.congregation.update({
    where: { id: cong },
    data: { videoSameAsAudio: activo },
  });

  await logAudit({
    userId: user.id,
    action: "EDITAR",
    entity: "Responsabilidades",
    details: `Video: repetir los de Sonido ${activo ? "activado" : "desactivado"}.`,
  });

  revalidatePath("/reuniones/responsabilidades");
}
