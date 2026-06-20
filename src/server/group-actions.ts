"use server";

// ============================================================================
//  Server Actions de Grupos de Servicio (solo Secretario)
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSecretary } from "@/lib/access";
import { groupSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { type FormState } from "@/server/actions-shared";

export async function createGroupAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireSecretary();

  const parsed = groupSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  // Evitar nombres duplicados (mensaje claro en vez de error de BD).
  const exists = await prisma.group.findUnique({
    where: { name: parsed.data.name },
  });
  if (exists) return { error: "Ya existe un grupo con ese nombre." };

  const group = await prisma.group.create({ data: { name: parsed.data.name } });

  await logAudit({
    userId: user.id,
    action: "CREAR",
    entity: "Grupo",
    entityId: group.id,
    details: `Grupo creado: ${group.name}`,
  });

  revalidatePath("/grupos");
  return { success: `Grupo "${group.name}" creado.` };
}

export async function updateGroupAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireSecretary();

  const id = String(formData.get("id") ?? "");
  const parsed = groupSchema.safeParse({ name: formData.get("name") });
  if (!id) return { error: "Grupo no especificado." };
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const duplicate = await prisma.group.findFirst({
    where: { name: parsed.data.name, NOT: { id } },
  });
  if (duplicate) return { error: "Ya existe otro grupo con ese nombre." };

  const group = await prisma.group.update({
    where: { id },
    data: { name: parsed.data.name },
  });

  await logAudit({
    userId: user.id,
    action: "EDITAR",
    entity: "Grupo",
    entityId: group.id,
    details: `Grupo renombrado a: ${group.name}`,
  });

  revalidatePath("/grupos");
  return { success: "Grupo actualizado." };
}

export async function deleteGroupAction(formData: FormData): Promise<void> {
  const user = await requireSecretary();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const group = await prisma.group.findUnique({
    where: { id },
    select: { name: true, _count: { select: { publishers: true } } },
  });
  if (!group) return;

  // Al eliminar un grupo se borran en cascada sus publicadores e informes
  // (definido en el esquema). La confirmación se realiza en la interfaz.
  await prisma.group.delete({ where: { id } });

  await logAudit({
    userId: user.id,
    action: "ELIMINAR",
    entity: "Grupo",
    entityId: id,
    details: `Grupo eliminado: ${group.name} (con ${group._count.publishers} publicadores)`,
  });

  revalidatePath("/grupos");
}
