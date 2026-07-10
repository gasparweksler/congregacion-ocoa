"use server";

// ============================================================================
//  Server Actions de Informes Mensuales
//  Guarda en lote los informes de un período (año/mes) para los publicadores
//  visibles según el rol. Las horas solo se registran para precursores.
// ============================================================================

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  requireUser,
  canAccessGroup,
  scopedGroupId,
} from "@/lib/access";
import { isPioneer } from "@/lib/constants";
import { logAudit } from "@/lib/audit";
import { type FormState } from "@/server/actions-shared";

function toInt(value: FormDataEntryValue | null, max = 9999): number {
  const n = parseInt(String(value ?? "0"), 10);
  if (isNaN(n) || n < 0) return 0;
  return Math.min(n, max);
}

// Elimina los informes de un período (año/mes) dentro del alcance del usuario.
// Un Superintendente/Auxiliar solo puede borrar los de su grupo; el
// Administrador puede borrar los del grupo filtrado (o de todos si no filtra).
export async function deleteReportsPeriodAction(
  formData: FormData,
): Promise<void> {
  const user = await requireUser();
  const year = parseInt(String(formData.get("year") ?? ""), 10);
  const month = parseInt(String(formData.get("month") ?? ""), 10);
  if (isNaN(year) || isNaN(month)) return;

  const scope = scopedGroupId(user); // grupo si super/aux; null si admin
  const submittedGroup = String(formData.get("grupo") ?? "") || null;
  const groupId = scope ?? submittedGroup;

  const res = await prisma.monthlyReport.deleteMany({
    where: {
      year,
      month,
      ...(groupId ? { publisher: { groupId } } : {}),
    },
  });

  await logAudit({
    userId: user.id,
    action: "ELIMINAR",
    entity: "Informe",
    details: `Se eliminaron ${res.count} informe(s) de ${month}/${year}.`,
  });

  revalidatePath("/informes");
  revalidatePath("/estadisticas");
  revalidatePath("/panel");
  redirect(
    `/informes?anio=${year}&mes=${month}${
      submittedGroup ? `&grupo=${submittedGroup}` : ""
    }`,
  );
}

export async function saveReportsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const year = parseInt(String(formData.get("year") ?? ""), 10);
  const month = parseInt(String(formData.get("month") ?? ""), 10);
  if (
    isNaN(year) ||
    isNaN(month) ||
    year < 2000 ||
    year > 2100 ||
    month < 1 ||
    month > 12
  ) {
    return { error: "Período inválido." };
  }

  const ids = String(formData.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return { error: "No hay publicadores para guardar." };

  // Traemos los publicadores reales (estado actual + grupo) para validar acceso
  // y registrar el estado del período de forma fiable.
  const publishers = await prisma.publisher.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, groupId: true },
  });

  let saved = 0;
  for (const p of publishers) {
    // Seguridad: nunca guardar informes de un grupo ajeno.
    if (!canAccessGroup(user, p.groupId)) continue;

    const participated = formData.get(`p_${p.id}`) === "on";
    const bibleStudies = toInt(formData.get(`b_${p.id}`), 999);
    // Precursor Auxiliar para este mes (los precursores permanentes siempre).
    const auxiliaryPioneer = formData.get(`aux_${p.id}`) === "on";
    const reportsHours = isPioneer(p.status) || auxiliaryPioneer;
    const hours = reportsHours ? toInt(formData.get(`h_${p.id}`), 9999) : null;
    const commentRaw = String(formData.get(`c_${p.id}`) ?? "").trim();
    const comment = commentRaw.length > 0 ? commentRaw.slice(0, 2000) : null;

    await prisma.monthlyReport.upsert({
      where: {
        publisherId_year_month: { publisherId: p.id, year, month },
      },
      create: {
        publisherId: p.id,
        year,
        month,
        participated,
        bibleStudies,
        hours,
        auxiliaryPioneer,
        comment,
        statusAtReport: p.status,
        submittedById: user.id,
      },
      update: {
        participated,
        bibleStudies,
        hours,
        auxiliaryPioneer,
        comment,
        statusAtReport: p.status,
        submittedById: user.id,
      },
    });
    saved++;
  }

  await logAudit({
    userId: user.id,
    action: "EDITAR",
    entity: "Informe",
    details: `Informes guardados para ${month}/${year}: ${saved} publicador(es).`,
  });

  revalidatePath("/informes");
  revalidatePath("/estadisticas");
  revalidatePath("/panel");
  return { success: `Se guardaron los informes de ${saved} publicador(es).` };
}
