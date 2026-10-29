"use server";

// ============================================================================
//  Server Actions de Grupos de Servicio (solo Secretario)
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSecretary, congregationId } from "@/lib/access";
import { groupSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { type FormState, sinDuplicar } from "@/server/actions-shared";

export async function createGroupAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireSecretary();

  const parsed = groupSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const cong = congregationId(user);

  // Evitar nombres duplicados EN ESTA congregación (mensaje claro en vez de
  // error de BD). "Grupo 1" puede existir en otra congregación.
  const exists = await prisma.group.findUnique({
    where: { congregationId_name: { congregationId: cong, name: parsed.data.name } },
  });
  if (exists) return { error: "Ya existe un grupo con ese nombre." };

  // sinDuplicar: si otra persona creó el mismo nombre entre la comprobación
  // de arriba y esta línea, se avisa igual en vez de romper la pantalla.
  const alta = await sinDuplicar(
    () =>
      prisma.group.create({
        data: { name: parsed.data.name, congregationId: cong },
      }),
    "Ya existe un grupo con ese nombre.",
  );
  if (!alta.ok) return { error: alta.error };
  const group = alta.valor;

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

  const cong = congregationId(user);
  const duplicate = await prisma.group.findFirst({
    where: { congregationId: cong, name: parsed.data.name, NOT: { id } },
  });
  if (duplicate) return { error: "Ya existe otro grupo con ese nombre." };

  // updateMany acota por congregación: no se puede renombrar un grupo ajeno.
  const cambio = await sinDuplicar(
    () =>
      prisma.group.updateMany({
        where: { id, congregationId: cong },
        data: { name: parsed.data.name },
      }),
    "Ya existe otro grupo con ese nombre.",
  );
  if (!cambio.ok) return { error: cambio.error };
  if (cambio.valor.count === 0) return { error: "Grupo no encontrado." };
  const group = { id, name: parsed.data.name };

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

  const group = await prisma.group.findFirst({
    where: { id, congregationId: congregationId(user) },
    select: { name: true, _count: { select: { publishers: true } } },
  });
  if (!group) return;

  // Al eliminar un grupo se borran en cascada sus publicadores e informes
  // (definido en el esquema). La confirmación se realiza en la interfaz.
  // deleteMany acota por congregación: no se puede borrar un grupo ajeno.
  await prisma.group.deleteMany({
    where: { id, congregationId: congregationId(user) },
  });

  await logAudit({
    userId: user.id,
    action: "ELIMINAR",
    entity: "Grupo",
    entityId: id,
    details: `Grupo eliminado: ${group.name} (con ${group._count.publishers} publicadores)`,
  });

  revalidatePath("/grupos");
}
