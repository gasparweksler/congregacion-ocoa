"use server";

// ============================================================================
//  Carga masiva de reuniones desde el Excel del programa "Vida y Ministerio".
//  Crea una reunión de Jueves por semana, con:
//   - Título de cada parte tal cual el Excel (incluido el número).
//   - Nombre del hermano detectado (editable después).
//   - Etiqueta de la semana por rango de días (ej. "20-26 de Julio").
//  Acceso: Administrador o Responsable de Confirmaciones.
// ============================================================================

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMeetingsAccess } from "@/lib/access";
import {
  slotsForDay,
  MEETING_DAYS,
  CONFIRM_STATUS,
  sectionAllowsSecondary,
} from "@/lib/constants";
import { logAudit } from "@/lib/audit";
import { type FormState } from "@/server/actions-shared";
import { parseVymc, buildSlotData } from "@/lib/vymc-parser";

function newToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export async function importMeetingsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireMeetingsAccess();

  const file = formData.get("file");
  if (!file || typeof file === "string" || file.size === 0) {
    return { error: "Selecciona un archivo Excel (.xlsx)." };
  }

  const wb = new ExcelJS.Workbook();
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
  } catch {
    return { error: "No se pudo leer el archivo. Debe ser un .xlsx válido." };
  }

  const weeks = parseVymc(wb);
  if (weeks.length === 0) {
    return {
      error:
        "No se reconocieron semanas. Debe ser el programa Vida y Ministerio (con encabezados tipo 'SEMANA 6-12 DE JULIO').",
    };
  }

  const juevesSlots = slotsForDay(MEETING_DAYS.JUEVES);
  let created = 0;
  let skipped = 0;

  for (const w of weeks) {
    const existing = await prisma.meeting.findFirst({
      where: { day: MEETING_DAYS.JUEVES, date: w.date },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const data = buildSlotData(w);
    const assignments = juevesSlots
      .map((s, i) => {
        const d = data[s.key] ?? {};
        const primaryName = d.p || null;
        // "Nuestra Vida Cristiana" nunca crea Auxiliar. En el resto, si el
        // Excel trae Auxiliar se respeta aunque la casilla por defecto sea de
        // un solo hermano (así no se pierde ningún nombre del programa).
        const sectionOk = sectionAllowsSecondary(s.section);
        const secondaryName = sectionOk ? d.s || null : null;
        const allowsSecondary = sectionOk && (s.allowTwo || !!secondaryName);
        // Solo se crean las asignaciones con datos del Excel (título o nombre);
        // las que quedarían vacías no se crean.
        if (!d.label && !primaryName && !secondaryName) return null;
        return {
          slotKey: s.key,
          section: s.section,
          label: d.label ?? s.label,
          order: i,
          allowTwo: allowsSecondary,
          equalPair: !!s.equalPair,
          primaryName,
          primaryToken: primaryName ? newToken() : null,
          primaryStatus: CONFIRM_STATUS.PENDIENTE,
          secondaryName,
          secondaryToken: secondaryName ? newToken() : null,
          secondaryStatus: CONFIRM_STATUS.PENDIENTE,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);

    await prisma.meeting.create({
      data: {
        date: w.date,
        day: MEETING_DAYS.JUEVES,
        weekLabel: w.label,
        createdById: user.id,
        confirmadorName: user.name ?? null,
        assignments: { create: assignments },
      },
    });
    created++;
  }

  await logAudit({
    userId: user.id,
    action: "CREAR",
    entity: "Reunion",
    details: `Importación VyMC: ${created} creada(s), ${skipped} omitida(s).`,
  });

  revalidatePath("/reuniones");
  return {
    success:
      `Se crearon ${created} reunión(es) de Jueves con títulos y nombres.` +
      (skipped ? ` ${skipped} ya existían y se omitieron.` : ""),
  };
}
