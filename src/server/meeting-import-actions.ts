"use server";

// ============================================================================
//  Carga masiva de reuniones desde el Excel del programa "Vida y Ministerio".
//  Crea una reunión de Jueves por semana, con:
//   - Título de cada parte tal cual el Excel (incluido el número).
//   - Nombre del hermano detectado (editable después).
//   - Etiqueta de la semana por rango de días (ej. "20-26 de Julio").
//  Acceso: Administrador o Responsable de Confirmaciones.
// ============================================================================

import { loadWorkbook } from "@/lib/xlsx-load";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMeetingsAccess, congregationId } from "@/lib/access";
import {
  slotsForDay,
  MEETING_DAYS,
  CONFIRM_STATUS,
  sectionAllowsSecondary,
} from "@/lib/constants";
import { logAudit } from "@/lib/audit";
import { type FormState, isUniqueViolation } from "@/server/actions-shared";
import {
  parseVymc,
  buildSlotData,
  programFieldsToFill,
} from "@/lib/vymc-parser";

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

  let wb;
  try {
    wb = await loadWorkbook(Buffer.from(await file.arrayBuffer()));
  } catch {
    return {
      error:
        "No se pudo leer el archivo. Debe ser un .xlsx válido (si lo exportaste desde otro programa, prueba a abrirlo en Excel y guardarlo de nuevo).",
    };
  }

  // Año indicado en el formulario: solo se usa si el archivo no lo trae
  // (ver yearOfSheet en vymc-parser.ts).
  const anio = parseInt(String(formData.get("anio") ?? ""), 10);
  const fallbackYear =
    !isNaN(anio) && anio >= 2000 && anio <= 2100
      ? anio
      : new Date().getFullYear();

  const weeks = parseVymc(wb, fallbackYear);
  if (weeks.length === 0) {
    return {
      error:
        "No se reconocieron semanas. Debe ser el programa Vida y Ministerio (con encabezados tipo 'SEMANA 6-12 DE JULIO').",
    };
  }

  const cong = congregationId(user);
  const juevesSlots = slotsForDay(MEETING_DAYS.JUEVES);
  let created = 0;
  let skipped = 0;
  let completed = 0;

  for (const w of weeks) {
    const existing = await prisma.meeting.findFirst({
      where: { congregationId: cong, day: MEETING_DAYS.JUEVES, date: w.date },
    });
    if (existing) {
      // La reunión ya está: NO se tocan sus asignaciones ni sus nombres. Solo
      // se rellenan los datos del programa impreso (lectura semanal y
      // canciones) que todavía estén vacíos, nunca los que ya tengan valor.
      const faltantes = programFieldsToFill(existing, w);
      if (Object.keys(faltantes).length > 0) {
        await prisma.meeting.update({
          where: { id: existing.id },
          data: faltantes,
        });
        completed++;
      }
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

    // Partes que no caben en las casillas fijas: el número de asignaciones de
    // "Seamos Mejores Maestros" y "Nuestra Vida Cristiana" cambia cada semana,
    // así que las que sobran se añaden como casillas nuevas en vez de perderse.
    const extras = Object.entries(data)
      .filter(([, d]) => d.extra)
      .map(([key, d], i) => {
        const sectionOk = sectionAllowsSecondary(d.extra!.section);
        const secondaryName = sectionOk ? d.s || null : null;
        const primaryName = d.p || null;
        return {
          slotKey: key,
          section: d.extra!.section,
          label: d.label ?? "Asignación",
          // Después de las fijas, conservando el orden del programa.
          order: juevesSlots.length + i,
          allowTwo: sectionOk && (d.extra!.allowTwo || !!secondaryName),
          equalPair: false,
          primaryName,
          primaryToken: primaryName ? newToken() : null,
          primaryStatus: CONFIRM_STATUS.PENDIENTE,
          secondaryName,
          secondaryToken: secondaryName ? newToken() : null,
          secondaryStatus: CONFIRM_STATUS.PENDIENTE,
        };
      });
    assignments.push(...extras);

    try {
      await prisma.meeting.create({
        data: {
          date: w.date,
          day: MEETING_DAYS.JUEVES,
          congregationId: cong,
          weekLabel: w.label,
          // Datos del programa impreso (no son asignaciones de nadie).
          weeklyReading: w.reading || null,
          songStart: w.songStart || null,
          songMiddle: w.songMiddle || null,
          songEnd: w.songEnd || null,
          createdById: user.id,
          confirmadorName: user.name ?? null,
          assignments: { create: assignments },
        },
      });
      created++;
    } catch (error) {
      // Otra persona la creó mientras se importaba: se cuenta como omitida.
      if (isUniqueViolation(error)) {
        skipped++;
        continue;
      }
      throw error;
    }
  }

  await logAudit({
    userId: user.id,
    action: "CREAR",
    entity: "Reunion",
    details: `Importación VyMC: ${created} creada(s), ${skipped} omitida(s), ${completed} completada(s) con canciones/lectura.`,
  });

  revalidatePath("/reuniones");
  // Se informa del año y del rango usados: así un año equivocado se ve de
  // inmediato en vez de descubrirse semanas después.
  const años = [...new Set(weeks.map((w) => w.date.getFullYear()))].sort();
  return {
    success:
      `Se crearon ${created} reunión(es) de Jueves con títulos y nombres ` +
      `(${weeks[0]?.label} … ${weeks[weeks.length - 1]?.label}, año ${años.join(" y ")}).` +
      (skipped ? ` ${skipped} ya existían y se omitieron.` : "") +
      (completed
        ? ` En ${completed} de ellas se completaron las canciones y la lectura semanal que faltaban (las asignaciones no se tocaron).`
        : ""),
  };
}
