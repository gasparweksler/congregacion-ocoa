"use server";

// ============================================================================
//  Server Actions de Publicadores
//  - Secretario: cualquier grupo.
//  - Superintendente/Auxiliar: SOLO su grupo (el groupId se fuerza al suyo).
//  Cada cambio de estado queda registrado en StatusChange (historial).
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  requireUser,
  assertGroupAccess,
  isSecretary,
} from "@/lib/access";
import { publisherSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { type FormState } from "@/server/actions-shared";

// Convierte "yyyy-mm-dd" en Date (mediodía local para evitar saltos de día).
function toDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T12:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

export async function createPublisherAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const parsed = publisherSchema.safeParse({
    fullName: formData.get("fullName"),
    sex: formData.get("sex") || null,
    birthDate: formData.get("birthDate"),
    baptismDate: formData.get("baptismDate"),
    status: formData.get("status"),
    // Para super/aux se ignora el groupId del formulario y se usa el suyo.
    groupId: isSecretary(user)
      ? formData.get("groupId")
      : (user.groupId ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const data = parsed.data;

  // Verificación de acceso al grupo destino.
  assertGroupAccess(user, data.groupId);

  const publisher = await prisma.publisher.create({
    data: {
      fullName: data.fullName,
      sex: data.sex ?? null,
      birthDate: toDate(data.birthDate),
      baptismDate: toDate(data.baptismDate),
      status: data.status,
      groupId: data.groupId,
      // Registro inicial del estado en el historial.
      statusChanges: {
        create: { status: data.status, changedById: user.id },
      },
    },
  });

  await logAudit({
    userId: user.id,
    action: "CREAR",
    entity: "Publicador",
    entityId: publisher.id,
    details: `Publicador creado: ${publisher.fullName}`,
  });

  revalidatePath("/publicadores");
  return { success: `Publicador "${publisher.fullName}" creado.` };
}

export async function updatePublisherAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Publicador no especificado." };

  const current = await prisma.publisher.findUnique({ where: { id } });
  if (!current) return { error: "Publicador no encontrado." };

  // Acceso al grupo actual del publicador.
  assertGroupAccess(user, current.groupId);

  const parsed = publisherSchema.safeParse({
    fullName: formData.get("fullName"),
    sex: formData.get("sex") || null,
    birthDate: formData.get("birthDate"),
    baptismDate: formData.get("baptismDate"),
    status: formData.get("status"),
    // Solo el Secretario puede mover de grupo; el resto conserva el suyo.
    groupId: isSecretary(user)
      ? formData.get("groupId")
      : current.groupId,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const data = parsed.data;

  // Si cambia de grupo, verificar acceso también al grupo destino.
  assertGroupAccess(user, data.groupId);

  const statusChanged = data.status !== current.status;

  await prisma.publisher.update({
    where: { id },
    data: {
      fullName: data.fullName,
      sex: data.sex ?? null,
      birthDate: toDate(data.birthDate),
      baptismDate: toDate(data.baptismDate),
      status: data.status,
      groupId: data.groupId,
      // Solo se añade al historial si el estado realmente cambió.
      ...(statusChanged
        ? {
            statusChanges: {
              create: { status: data.status, changedById: user.id },
            },
          }
        : {}),
    },
  });

  await logAudit({
    userId: user.id,
    action: "EDITAR",
    entity: "Publicador",
    entityId: id,
    details: `Publicador actualizado: ${data.fullName}${
      statusChanged ? ` (estado → ${data.status})` : ""
    }`,
  });

  revalidatePath("/publicadores");
  revalidatePath(`/publicadores/${id}`);
  return { success: "Publicador actualizado." };
}

export async function deletePublisherAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const current = await prisma.publisher.findUnique({
    where: { id },
    select: { fullName: true, groupId: true },
  });
  if (!current) return;

  assertGroupAccess(user, current.groupId);

  // Borra en cascada sus informes e historial (definido en el esquema).
  await prisma.publisher.delete({ where: { id } });

  await logAudit({
    userId: user.id,
    action: "ELIMINAR",
    entity: "Publicador",
    entityId: id,
    details: `Publicador eliminado: ${current.fullName}`,
  });

  revalidatePath("/publicadores");
}
