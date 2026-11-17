"use server";

// ============================================================================
//  Carga masiva de reuniones desde el Excel del programa "Vida y Ministerio".
//  Crea una reunión de Jueves por semana, con:
//   - Título de cada parte tal cual el Excel (incluido el número).
//   - Nombre del hermano detectado (editable después).
//   - Etiqueta de la semana por rango de días (ej. "20-26 de Julio").
//  Acceso: Administrador o Responsable de Confirmaciones.
//
//  Aquí solo se lee el archivo: crear las reuniones lo hace
//  src/lib/crear-reuniones.ts, el mismo código que usa el PDF de la Guía, para
//  que los dos caminos dejen la reunión igual.
// ============================================================================

import { loadWorkbook } from "@/lib/xlsx-load";
import { revalidatePath } from "next/cache";
import { requireMeetingsAccess, congregationId } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { type FormState } from "@/server/actions-shared";
import { parseVymc } from "@/lib/vymc-parser";
import { crearReunionesDesdeSemanas } from "@/lib/crear-reuniones";

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

  const resumen = await crearReunionesDesdeSemanas(weeks, {
    userId: user.id,
    userName: user.name ?? null,
    congregationId: congregationId(user),
  });

  await logAudit({
    userId: user.id,
    action: "CREAR",
    entity: "Reunion",
    details: `Importación VyMC: ${resumen.creadas} creada(s), ${resumen.omitidas} omitida(s), ${resumen.completadas} completada(s) con canciones/lectura.`,
  });

  revalidatePath("/reuniones");
  // Se informa del año y del rango usados: así un año equivocado se ve de
  // inmediato en vez de descubrirse semanas después.
  const años = [...new Set(weeks.map((w) => w.date.getFullYear()))].sort();
  return {
    success:
      `Se crearon ${resumen.creadas} reunión(es) de Jueves con títulos y nombres ` +
      `(${weeks[0]?.label} … ${weeks[weeks.length - 1]?.label}, año ${años.join(" y ")}).` +
      (resumen.omitidas ? ` ${resumen.omitidas} ya existían y se omitieron.` : "") +
      (resumen.completadas
        ? ` En ${resumen.completadas} de ellas se completaron las canciones y la lectura semanal que faltaban (las asignaciones no se tocaron).`
        : "") +
      (resumen.conOraciones
        ? ` A ${resumen.conOraciones} se les añadió la casilla de oración que faltaba, vacía.`
        : ""),
  };
}
