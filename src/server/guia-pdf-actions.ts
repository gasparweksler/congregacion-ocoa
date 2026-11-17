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

import { revalidatePath } from "next/cache";
import { requireMeetingsAccess, congregationId } from "@/lib/access";
import { extractPdfItems } from "@/lib/pdf-text";
import { lineasDePdf } from "@/lib/pdf-lines";
import { leerGuia, normalizarGuia, type GuiaLeida } from "@/lib/vymc-pdf";
import { semanasDeLaGuia } from "@/lib/guia-a-semanas";
import { crearReunionesDesdeSemanas } from "@/lib/crear-reuniones";
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

// ---------------------------------------------------------------------------
//  Generar las reuniones directamente desde la Guía, sin pasar por el Excel.
// ---------------------------------------------------------------------------

export type GenerarReunionesState = {
  error?: string;
  success?: string;
  /** Semanas que no se pudieron crear, con el motivo. */
  avisos?: string[];
};

/**
 * Crea las reuniones de entre semana con el programa revisado en pantalla.
 *
 * Lo que llega del navegador no se cree: pasa por normalizarGuia (recorta,
 * descarta lo que no encaje) y de ahí a la MISMA función que usa la carga del
 * Excel, así que las reuniones salen idénticas por los dos caminos. Si una
 * semana ya existe, no se toca.
 */
export async function crearReunionesDesdeGuiaAction(
  entrada: unknown,
): Promise<GenerarReunionesState> {
  const user = await requireMeetingsAccess();

  const guia = normalizarGuia(entrada);
  if (!guia) {
    return {
      error:
        "No hay ningún programa que generar. Sube el PDF de la Guía de actividades y revísalo antes.",
    };
  }

  const { semanas, descartadas } = semanasDeLaGuia(guia);
  const avisos = descartadas.map((d) => `${d.etiqueta}: ${d.motivo}.`);

  if (semanas.length === 0) {
    return {
      error:
        "Ninguna semana del programa se pudo convertir en reunión. Revisa las fechas y que cada semana tenga sus partes.",
      avisos,
    };
  }

  const resumen = await crearReunionesDesdeSemanas(semanas, {
    userId: user.id,
    userName: user.name ?? null,
    congregationId: congregationId(user),
  });

  await logAudit({
    userId: user.id,
    action: "CREAR",
    entity: "Reunion",
    details:
      `Reuniones generadas desde la Guía (${guia.titulo}): ${resumen.creadas} creada(s), ` +
      `${resumen.omitidas} omitida(s), ${resumen.completadas} completada(s) con canciones/lectura.`,
  });

  revalidatePath("/reuniones");

  const rango = `${semanas[0].label} … ${semanas[semanas.length - 1].label}`;
  return {
    success:
      (resumen.creadas > 0
        ? `Se crearon ${resumen.creadas} reunión(es) de entre semana (${rango}), con los títulos del programa y sus canciones. Para verlas, pulsa «Reunión de Entre Semana» en la lista; los hermanos se ponen dentro de cada reunión.`
        : "No se creó ninguna reunión nueva: todas las semanas del programa ya estaban cargadas.") +
      (resumen.omitidas ? ` ${resumen.omitidas} ya existían y no se tocaron.` : "") +
      (resumen.completadas
        ? ` En ${resumen.completadas} se completaron las canciones y la lectura semanal que faltaban.`
        : "") +
      (resumen.conOraciones
        ? ` A ${resumen.conOraciones} se les añadió la casilla de oración que faltaba, vacía.`
        : ""),
    avisos,
  };
}
