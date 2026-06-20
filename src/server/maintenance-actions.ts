"use server";

// ============================================================================
//  Mantenimiento de datos (solo Secretario)
//  Permite reiniciar/eliminar informes históricos para liberar espacio.
//  Acciones destructivas: siempre se confirman en la interfaz y se auditan.
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSecretary } from "@/lib/access";
import { logAudit } from "@/lib/audit";

/** Elimina todos los informes de un año concreto. */
export async function deleteReportsByYearAction(
  formData: FormData,
): Promise<void> {
  const user = await requireSecretary();
  const year = parseInt(String(formData.get("year") ?? ""), 10);
  if (isNaN(year)) return;

  const { count } = await prisma.monthlyReport.deleteMany({ where: { year } });

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

  const { count } = await prisma.monthlyReport.deleteMany({});

  await logAudit({
    userId: user.id,
    action: "REINICIAR_DATOS",
    entity: "Informe",
    details: `Eliminados TODOS los informes (${count}).`,
  });

  revalidatePath("/auditoria");
  revalidatePath("/estadisticas");
}
