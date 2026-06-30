// ============================================================================
//  Constantes del dominio
//  Centraliza los valores enumerados (roles, estados, sexo) y sus etiquetas
//  en español. Al no usar `enum` de Prisma (SQLite), esta es la fuente única
//  de verdad para validación (Zod) y presentación (UI).
// ============================================================================

// ---------------------------------------------------------------------------
//  ROLES DE USUARIO
// ---------------------------------------------------------------------------
export const ROLES = {
  // El valor interno se mantiene como "SECRETARIO" por compatibilidad con los
  // datos y sesiones existentes; su etiqueta visible es "Administrador".
  SECRETARIO: "SECRETARIO",
  SUPERINTENDENTE: "SUPERINTENDENTE",
  AUXILIAR: "AUXILIAR",
  RESPONSABLE_CONFIRMACIONES: "RESPONSABLE_CONFIRMACIONES",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_VALUES = Object.values(ROLES) as Role[];

export const ROLE_LABELS: Record<Role, string> = {
  SECRETARIO: "Administrador",
  SUPERINTENDENTE: "Superintendente de Grupo",
  AUXILIAR: "Auxiliar de Grupo",
  RESPONSABLE_CONFIRMACIONES: "Responsable de Confirmaciones",
};

/** Roles que administran un único grupo (mismos permisos entre sí). */
export const GROUP_ROLES: Role[] = [ROLES.SUPERINTENDENTE, ROLES.AUXILIAR];

// ---------------------------------------------------------------------------
//  ESTADOS DEL PUBLICADOR
// ---------------------------------------------------------------------------
export const PUBLISHER_STATUS = {
  BAUTIZADO: "BAUTIZADO",
  NO_BAUTIZADO: "NO_BAUTIZADO",
  INACTIVO: "INACTIVO",
  PRECURSOR_REGULAR: "PRECURSOR_REGULAR",
  PRECURSOR_AUXILIAR: "PRECURSOR_AUXILIAR",
  PRECURSOR_AUXILIAR_INDEFINIDO: "PRECURSOR_AUXILIAR_INDEFINIDO",
} as const;

export type PublisherStatus =
  (typeof PUBLISHER_STATUS)[keyof typeof PUBLISHER_STATUS];

export const PUBLISHER_STATUS_VALUES = Object.values(
  PUBLISHER_STATUS,
) as PublisherStatus[];

export const PUBLISHER_STATUS_LABELS: Record<PublisherStatus, string> = {
  BAUTIZADO: "Bautizado",
  NO_BAUTIZADO: "No Bautizado",
  INACTIVO: "Inactivo",
  PRECURSOR_REGULAR: "Precursor Regular",
  PRECURSOR_AUXILIAR: "Precursor Auxiliar",
  PRECURSOR_AUXILIAR_INDEFINIDO: "Precursor Auxiliar Indefinido",
};

/**
 * Estados que corresponden a precursores. Estos publicadores informan, además
 * de participación y cursos bíblicos, las HORAS de predicación.
 */
export const PIONEER_STATUSES: PublisherStatus[] = [
  PUBLISHER_STATUS.PRECURSOR_REGULAR,
  PUBLISHER_STATUS.PRECURSOR_AUXILIAR,
  PUBLISHER_STATUS.PRECURSOR_AUXILIAR_INDEFINIDO,
];

/** Indica si un estado debe registrar horas de predicación. */
export function isPioneer(status: string): boolean {
  return PIONEER_STATUSES.includes(status as PublisherStatus);
}

// ---------------------------------------------------------------------------
//  SEXO (opcional)
// ---------------------------------------------------------------------------
export const SEX = {
  M: "M",
  F: "F",
} as const;

export type Sex = (typeof SEX)[keyof typeof SEX];

export const SEX_LABELS: Record<Sex, string> = {
  M: "Masculino",
  F: "Femenino",
};

// ---------------------------------------------------------------------------
//  MESES (para selectores y exportaciones)
// ---------------------------------------------------------------------------
export const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

/** Devuelve el nombre del mes (1..12). */
export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? String(month);
}

// ---------------------------------------------------------------------------
//  Helpers de etiquetas seguras (no rompen si llega un valor desconocido)
// ---------------------------------------------------------------------------
export function statusLabel(status: string): string {
  return PUBLISHER_STATUS_LABELS[status as PublisherStatus] ?? status;
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role as Role] ?? role;
}

// ---------------------------------------------------------------------------
//  REUNIONES DE LA CONGREGACIÓN
// ---------------------------------------------------------------------------
export const MEETING_DAYS = {
  JUEVES: "JUEVES",
  SABADO: "SABADO",
} as const;

export type MeetingDay = (typeof MEETING_DAYS)[keyof typeof MEETING_DAYS];

export const MEETING_DAY_LABELS: Record<MeetingDay, string> = {
  JUEVES: "Jueves (Entre semana)",
  SABADO: "Sábado (Fin de semana)",
};

/** Secciones (encabezados) dentro de una reunión. */
export const MEETING_SECTION_LABELS: Record<string, string> = {
  ORACION_INICIO: "Oración de Inicio",
  TESOROS: "Tesoros de la Biblia",
  SMM: "Seamos Mejores Maestros",
  VC: "Nuestra Vida Cristiana",
  ORACION_FINAL: "Oración Final",
  RESPONSABILIDADES: "Responsabilidades",
  SAB_ASIGNACIONES: "Asignaciones",
  SAB_RESPONSABILIDADES: "Responsabilidades",
};

export type MeetingSlot = {
  key: string;
  label: string;
  section: string;
  /** Permite asignar 2 hermanos (Responsable + Auxiliar). */
  allowTwo: boolean;
};

export const JUEVES_SLOTS: MeetingSlot[] = [
  { key: "j_oracion_inicio", label: "Oración de Inicio", section: "ORACION_INICIO", allowTwo: false },
  { key: "j_tesoros_discurso", label: "Discurso", section: "TESOROS", allowTwo: false },
  { key: "j_perlas", label: "Busquemos perlas escondidas", section: "TESOROS", allowTwo: false },
  { key: "j_lectura", label: "Lectura de la Biblia", section: "TESOROS", allowTwo: false },
  { key: "j_smm_conversaciones", label: "Empiece conversaciones", section: "SMM", allowTwo: true },
  { key: "j_smm_revisitas", label: "Haga revisitas", section: "SMM", allowTwo: true },
  { key: "j_smm_discurso", label: "Discurso", section: "SMM", allowTwo: false },
  { key: "j_smm_discipulos", label: "Haga discípulos", section: "SMM", allowTwo: true },
  { key: "j_smm_creencias", label: "Explique sus creencias", section: "SMM", allowTwo: true },
  { key: "j_vc_discurso1", label: "Discurso", section: "VC", allowTwo: true },
  { key: "j_vc_discurso2", label: "Discurso", section: "VC", allowTwo: true },
  { key: "j_vc_conductor", label: "Conductor del Estudio Bíblico", section: "VC", allowTwo: false },
  { key: "j_vc_lector", label: "Lector del Estudio Bíblico", section: "VC", allowTwo: false },
  { key: "j_oracion_final", label: "Oración Final", section: "ORACION_FINAL", allowTwo: false },
  // Responsabilidades (igual que el sábado), al final de la reunión.
  { key: "j_microfono", label: "Pasa micrófono", section: "RESPONSABILIDADES", allowTwo: true },
  { key: "j_acomodador_entrada", label: "Acomodador de entrada", section: "RESPONSABILIDADES", allowTwo: true },
  { key: "j_acomodador_auditorio", label: "Acomodador de auditorio", section: "RESPONSABILIDADES", allowTwo: true },
  { key: "j_sonido", label: "Sonido", section: "RESPONSABILIDADES", allowTwo: false },
  { key: "j_video", label: "Video", section: "RESPONSABILIDADES", allowTwo: false },
  { key: "j_plataforma", label: "Plataforma", section: "RESPONSABILIDADES", allowTwo: true },
];

export const SABADO_SLOTS: MeetingSlot[] = [
  { key: "s_oracion_inicio", label: "Oración de inicio", section: "SAB_ASIGNACIONES", allowTwo: false },
  { key: "s_lector_atalaya", label: "Lector de la Atalaya", section: "SAB_ASIGNACIONES", allowTwo: false },
  { key: "s_presidente", label: "Presidente de la Reunión", section: "SAB_ASIGNACIONES", allowTwo: false },
  { key: "s_microfono", label: "Pasa micrófono", section: "SAB_RESPONSABILIDADES", allowTwo: true },
  { key: "s_acomodador_entrada", label: "Acomodador de entrada", section: "SAB_RESPONSABILIDADES", allowTwo: true },
  { key: "s_acomodador_auditorio", label: "Acomodador de auditorio", section: "SAB_RESPONSABILIDADES", allowTwo: true },
  { key: "s_sonido", label: "Sonido", section: "SAB_RESPONSABILIDADES", allowTwo: false },
  { key: "s_video", label: "Video", section: "SAB_RESPONSABILIDADES", allowTwo: false },
  { key: "s_plataforma", label: "Plataforma", section: "SAB_RESPONSABILIDADES", allowTwo: true },
];

/** Devuelve las casillas (slots) de una reunión según el día. */
export function slotsForDay(day: string): MeetingSlot[] {
  return day === MEETING_DAYS.SABADO ? SABADO_SLOTS : JUEVES_SLOTS;
}

export function meetingDayLabel(day: string): string {
  return MEETING_DAY_LABELS[day as MeetingDay] ?? day;
}

/** Orden de aparición de las secciones por día. */
export const JUEVES_SECTION_ORDER = [
  "ORACION_INICIO",
  "TESOROS",
  "SMM",
  "VC",
  "ORACION_FINAL",
  "RESPONSABILIDADES",
];
export const SABADO_SECTION_ORDER = ["SAB_ASIGNACIONES", "SAB_RESPONSABILIDADES"];

// ---------------------------------------------------------------------------
//  ESTADO DE CONFIRMACIÓN (asignaciones de reuniones)
// ---------------------------------------------------------------------------
export const CONFIRM_STATUS = {
  PENDIENTE: "PENDIENTE",
  CONFIRMADO: "CONFIRMADO",
  RECHAZADO: "RECHAZADO",
} as const;

export type ConfirmStatus =
  (typeof CONFIRM_STATUS)[keyof typeof CONFIRM_STATUS];

export const CONFIRM_STATUS_LABELS: Record<ConfirmStatus, string> = {
  PENDIENTE: "⏳ Pendiente",
  CONFIRMADO: "✅ Confirmado",
  RECHAZADO: "❌ Rechazado",
};
