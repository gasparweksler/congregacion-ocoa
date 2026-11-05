"use server";

// ============================================================================
//  Lectura del PDF de la GUÍA DE ACTIVIDADES (Vida y Ministerio).
//
//  Se sube el PDF tal como se descarga de jw.org, de cualquier mes o año, y
//  aquí se extrae el programa completo: semanas, lectura de la Biblia,
//  canciones y todas las partes de cada sección.
//
//  No se guarda nada en la base de datos: la acción devuelve lo leído y la
//  pantalla lo muestra para revisarlo y corregirlo antes de generar la
//  planilla. Así no se crea ninguna reunión por accidente (eso sigue siendo
//  cosa de la carga masiva) y no se ocupa espacio con datos de paso.
// ============================================================================

import { requireMeetingsAccess } from "@/lib/access";
import { extractPdfItems } from "@/lib/pdf-text";
import { lineasDePdf } from "@/lib/pdf-lines";
import { leerGuia, type GuiaLeida } from "@/lib/vymc-pdf";
import { logAudit } from "@/lib/audit";

export type GuiaPdfState = {
  error?: string;
  success?: string;
  guia?: GuiaLeida;
  /** Nombre del archivo subido, para mostrarlo en la vista previa. */
  archivo?: string;
};

/** Tope de tamaño: una guía de dos meses pesa menos de 2 MB. */
const MAX_BYTES = 25 * 1024 * 1024;

export async function leerGuiaPdfAction(
  _prev: GuiaPdfState,
  formData: FormData,
): Promise<GuiaPdfState> {
  const user = await requireMeetingsAccess();

  const file = formData.get("file");
  if (!file || typeof file === "string" || file.size === 0) {
    return { error: "Selecciona el PDF de la Guía de actividades." };
  }
  if (file.size > MAX_BYTES) {
    return {
      error: `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo es ${MAX_BYTES / 1024 / 1024} MB.`,
    };
  }

  let guia: GuiaLeida;
  try {
    const items = await extractPdfItems(
      new Uint8Array(await file.arrayBuffer()),
    );
    guia = leerGuia(lineasDePdf(items));
  } catch {
    return {
      error:
        "No se pudo leer el PDF. Comprueba que sea el archivo de la Guía de actividades descargado de jw.org y que no esté protegido con contraseña.",
    };
  }

  if (guia.semanas.length === 0) {
    return {
      error:
        "El PDF se abrió, pero no se reconoció ninguna semana. ¿Es la Guía de actividades para la reunión de Vida y Ministerio? Debe traer encabezados como “4-10 DE ENERO”.",
      guia,
    };
  }

  await logAudit({
    userId: user.id,
    action: "EXPORTAR",
    entity: "Reunion",
    details:
      `Lectura del PDF de la Guía (${guia.titulo}): ${guia.semanas.length} semana(s), ` +
      `${guia.semanas.reduce((n, s) => n + s.partes.length, 0)} parte(s).`,
  });

  const partes = guia.semanas.reduce((n, s) => n + s.partes.length, 0);
  return {
    success: `Se leyeron ${guia.semanas.length} semana(s) y ${partes} parte(s) de ${guia.titulo}.`,
    guia,
    archivo: file.name,
  };
}
