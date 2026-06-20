// ============================================================================
//  Registro de auditoría
//  Helper único para anotar acciones importantes (crear/editar/eliminar,
//  inicios de sesión, reinicios de datos). Nunca interrumpe la operación
//  principal: si falla el registro, sólo lo avisa por consola.
// ============================================================================

import { prisma } from "@/lib/prisma";

export type AuditAction =
  | "CREAR"
  | "EDITAR"
  | "ELIMINAR"
  | "INGRESAR_SESION"
  | "CAMBIAR_PASSWORD"
  | "REINICIAR_DATOS"
  | "EXPORTAR";

export async function logAudit(params: {
  userId?: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  details?: string | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        details: params.details ?? null,
      },
    });
  } catch (error) {
    console.error("No se pudo registrar la auditoría:", error);
  }
}
