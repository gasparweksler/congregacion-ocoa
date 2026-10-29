"use server";

// ============================================================================
//  Mantenimiento de datos (solo Secretario)
//  Permite reiniciar/eliminar informes históricos para liberar espacio.
//  Acciones destructivas: siempre se confirman en la interfaz y se auditan.
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSecretary, congregationId } from "@/lib/access";
import { logAudit } from "@/lib/audit";

/**
 * Elimina las líneas de auditoría más antiguas que los meses indicados.
 *
 * Es la única tabla que crece sin freno: cada edición escribe una línea y
 * nunca se borra nada. Con 0 meses se borra el registro entero.
 *
 * Aviso que conviene recordar: borrar filas en Postgres NO devuelve disco. El
 * hueco queda reutilizable por la propia tabla (así deja de crecer), pero el
 * tamaño que muestra Supabase no baja. Esto se hace para que la pantalla siga
 * siendo usable, no para recuperar espacio.
 */
export async function deleteAuditLogsAction(formData: FormData): Promise<void> {
  const user = await requireSecretary();
  const meses = parseInt(String(formData.get("meses") ?? ""), 10);
  if (isNaN(meses) || meses < 0 || meses > 120) return;

  const corte = new Date();
  corte.setMonth(corte.getMonth() - meses);

  const cong = congregationId(user);
  const { count } = await prisma.auditLog.deleteMany({
    where: {
      congregationId: cong,
      ...(meses > 0 ? { createdAt: { lt: corte } } : {}),
    },
  });

  // La propia limpieza se anota: si no, el registro no explicaría por qué
  // empieza donde empieza.
  await logAudit({
    userId: user.id,
    congregationId: cong,
    action: "REINICIAR_DATOS",
    entity: "Auditoria",
    details:
      meses > 0
        ? `Eliminadas ${count} línea(s) de auditoría anteriores a ${meses} mes(es).`
        : `Eliminado el registro de auditoría entero (${count} línea(s)).`,
  });

  revalidatePath("/auditoria");
}

/** Elimina todos los informes de un año concreto. */
export async function deleteReportsByYearAction(
  formData: FormData,
): Promise<void> {
  const user = await requireSecretary();
  const year = parseInt(String(formData.get("year") ?? ""), 10);
  if (isNaN(year)) return;

  // Acotado a su congregación: nunca borra informes de otra.
  const { count } = await prisma.monthlyReport.deleteMany({
    where: { congregationId: congregationId(user), year },
  });

  await logAudit({
    userId: user.id,
    action: "REINICIAR_DATOS",
    entity: "Informe",
    details: `Eliminados ${count} informes del año ${year}.`,
  });

  revalidatePath("/auditoria");
  revalidatePath("/estadisticas");
}

/** Elimina TODOS los informes (mantiene publicadores, grupos y usuarios). */
export async function deleteAllReportsAction(): Promise<void> {
  const user = await requireSecretary();

  const { count } = await prisma.monthlyReport.deleteMany({
    where: { congregationId: congregationId(user) },
  });

  await logAudit({
    userId: user.id,
    action: "REINICIAR_DATOS",
    entity: "Informe",
    details: `Eliminados TODOS los informes (${count}).`,
  });

  revalidatePath("/auditoria");
  revalidatePath("/estadisticas");
}
