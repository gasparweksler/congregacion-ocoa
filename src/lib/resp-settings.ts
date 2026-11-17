// ============================================================================
//  Qué responsabilidades usa cada congregación.
//
//  Dos ajustes, que viven en Congregation:
//
//    micCount        1 o 2 hermanos pasando el micrófono. Con 1, la casilla
//                    "Pasa Micrófono 2" ya no se reparte ni se imprime.
//    audioAlsoVideo  el mismo hermano hace Audio y Video: la casilla de Video
//                    deja de repartirse e imprimirse, y la de Audio pasa a
//                    llamarse "Audio y Video".
//    ushersMerged    un solo hermano como acomodador de entrada y de
//                    auditorio: la casilla de Auditorio deja de repartirse e
//                    imprimirse, y la de Entrada pasa a llamarse "Acomodador
//                    de Auditorio y de Entrada".
//
//  Importante: una casilla apagada NO se borra de la base. Lo que ya estuviera
//  escrito en "Pasa Micrófono 2", en "Video" o en "Acomodador de Auditorio"
//  sigue guardado, y vuelve a verse en cuanto se reactive el ajuste. Apagarla
//  solo significa que el reparto automático no la rellena y que el PDF no la
//  imprime.
//
//  Módulo puro (sin base de datos): lo usan la pantalla, el reparto automático
//  y el PDF, para que los tres apliquen exactamente la misma regla.
// ============================================================================

import {
  MONTHLY_RESPONSIBILITIES,
  type MonthlyResponsibility,
} from "@/lib/constants";

export type RespSettings = {
  /** 1 o 2. */
  micCount: number;
  audioAlsoVideo: boolean;
  ushersMerged: boolean;
};

/** Lo que hacía el sistema cuando esto estaba fijo en el código. */
export const RESP_SETTINGS_DEFAULT: RespSettings = {
  micCount: 2,
  audioAlsoVideo: false,
  ushersMerged: false,
};

/** Las casillas que puede apagar un ajuste. */
export const SLOT_MIC_1 = "r_microfono";
export const SLOT_MIC_2 = "r_microfono_2";
export const SLOT_AUDIO = "r_audio";
export const SLOT_VIDEO = "r_video";
export const SLOT_ACOM_ENTRADA = "r_acom_entrada";
export const SLOT_ACOM_AUDITORIO = "r_acom_auditorio";

/** Etiqueta de Audio cuando el mismo hermano hace las dos cosas. */
export const LABEL_AUDIO_Y_VIDEO = "Audio y Video";

/** Etiqueta del micrófono cuando la congregación usa uno solo. */
export const LABEL_MICROFONO_UNICO = "Pasa Micrófono";

/** Etiqueta del acomodador cuando uno solo cubre las dos puertas. */
export const LABEL_ACOM_AMBOS = "Acomodador de Auditorio y de Entrada";

/**
 * Normaliza lo que venga de la base. Si la columna todavía no existiera o
 * llegara un valor raro, se cae a lo de siempre (2 micrófonos, Video aparte)
 * en vez de dejar la pantalla sin casillas.
 */
export function respSettingsFrom(
  row: {
    micCount?: number | null;
    audioAlsoVideo?: boolean | null;
    ushersMerged?: boolean | null;
  } | null,
): RespSettings {
  return {
    micCount: row?.micCount === 1 ? 1 : 2,
    audioAlsoVideo: row?.audioAlsoVideo === true,
    ushersMerged: row?.ushersMerged === true,
  };
}

/** ¿La congregación reparte esta casilla? */
export function respActiva(slotKey: string, s: RespSettings): boolean {
  if (slotKey === SLOT_MIC_2) return s.micCount >= 2;
  if (slotKey === SLOT_VIDEO) return !s.audioAlsoVideo;
  if (slotKey === SLOT_ACOM_AUDITORIO) return !s.ushersMerged;
  return true;
}

/** Cómo se llama la casilla con estos ajustes. */
export function respLabel(r: MonthlyResponsibility, s: RespSettings): string {
  if (r.key === SLOT_AUDIO && s.audioAlsoVideo) return LABEL_AUDIO_Y_VIDEO;
  // Con un solo micrófono, el "1" sobra: no hay un segundo del que
  // distinguirlo.
  if (r.key === SLOT_MIC_1 && s.micCount < 2) return LABEL_MICROFONO_UNICO;
  if (r.key === SLOT_ACOM_ENTRADA && s.ushersMerged) return LABEL_ACOM_AMBOS;
  return r.label;
}

/** Por qué una casilla está apagada, para explicarlo en la pantalla. */
export function respMotivo(slotKey: string, s: RespSettings): string | null {
  if (slotKey === SLOT_MIC_2 && s.micCount < 2) {
    return "La congregación usa un solo Pasa Micrófono.";
  }
  if (slotKey === SLOT_VIDEO && s.audioAlsoVideo) {
    return "Lo hace el hermano de Audio.";
  }
  if (slotKey === SLOT_ACOM_AUDITORIO && s.ushersMerged) {
    return "Lo hace el mismo hermano que está en la entrada.";
  }
  return null;
}

/**
 * Las responsabilidades que la congregación usa de verdad, en el mismo orden
 * de siempre y con la etiqueta ya ajustada.
 */
export function activeResponsibilities(
  s: RespSettings,
): MonthlyResponsibility[] {
  return MONTHLY_RESPONSIBILITIES.filter((r) => respActiva(r.key, s)).map((r) => ({
    ...r,
    label: respLabel(r, s),
  }));
}

/**
 * Lo que se enseña en la pantalla del mes: las activas, más las apagadas que
 * TODAVÍA tienen un nombre guardado (en gris y sin poder editarse, para que no
 * parezca que ese nombre se borró).
 */
export function responsibilitiesToShow(
  s: RespSettings,
  tieneNombre: (slotKey: string) => boolean,
): (MonthlyResponsibility & { inactiva?: string })[] {
  return MONTHLY_RESPONSIBILITIES.flatMap((r) => {
    const motivo = respMotivo(r.key, s);
    if (!motivo) return [{ ...r, label: respLabel(r, s) }];
    if (!tieneNombre(r.key)) return [];
    return [{ ...r, inactiva: motivo }];
  });
}
