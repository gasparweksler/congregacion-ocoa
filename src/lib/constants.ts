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
  // Administra TODA la plataforma: crea congregaciones y sus usuarios. Es el
  // único rol sin congregación propia.
  SUPERADMIN: "SUPERADMIN",
  // El valor interno se mantiene como "SECRETARIO" por compatibilidad con los
  // datos y sesiones existentes; su etiqueta visible es "Administrador".
  SECRETARIO: "SECRETARIO",
  SUPERINTENDENTE: "SUPERINTENDENTE",
  AUXILIAR: "AUXILIAR",
  RESPONSABLE_CONFIRMACIONES: "RESPONSABLE_CONFIRMACIONES",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_VALUES = Object.values(ROLES) as Role[];

/**
 * Roles que un Administrador de congregación puede asignar a sus usuarios.
 * SUPERADMIN queda fuera a propósito: solo se crea desde la plataforma.
 */
export const ASSIGNABLE_ROLE_VALUES = ROLE_VALUES.filter(
  (r) => r !== ROLES.SUPERADMIN,
);

export const ROLE_LABELS: Record<Role, string> = {
  SUPERADMIN: "Superadministrador",
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
//  ESPERANZA Y PRIVILEGIO  (casillas de la tarjeta S-21, opcionales)
// ---------------------------------------------------------------------------
export const HOPE = {
  OTRAS_OVEJAS: "OTRAS_OVEJAS",
  UNGIDO: "UNGIDO",
} as const;

export type Hope = (typeof HOPE)[keyof typeof HOPE];
export const HOPE_VALUES = Object.values(HOPE) as Hope[];

export const HOPE_LABELS: Record<Hope, string> = {
  OTRAS_OVEJAS: "Otras ovejas",
  UNGIDO: "Ungido",
};

export const PRIVILEGE = {
  ANCIANO: "ANCIANO",
  SIERVO_MINISTERIAL: "SIERVO_MINISTERIAL",
} as const;

export type Privilege = (typeof PRIVILEGE)[keyof typeof PRIVILEGE];
export const PRIVILEGE_VALUES = Object.values(PRIVILEGE) as Privilege[];

export const PRIVILEGE_LABELS: Record<Privilege, string> = {
  ANCIANO: "Anciano",
  SIERVO_MINISTERIAL: "Siervo ministerial",
};

export function hopeLabel(hope: string | null): string {
  if (!hope) return "—";
  return HOPE_LABELS[hope as Hope] ?? hope;
}

export function privilegeLabel(privilege: string | null): string {
  if (!privilege) return "—";
  return PRIVILEGE_LABELS[privilege as Privilege] ?? privilege;
}

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

/**
 * Etiqueta del TIPO de reunión. El día concreto ya no es fijo: lo elige cada
 * congregación (ver MeetingDays), así que aquí solo va el tipo.
 */
export const MEETING_DAY_LABELS: Record<MeetingDay, string> = {
  JUEVES: "Entre semana",
  SABADO: "Fin de semana",
};

// ---------------------------------------------------------------------------
//  DÍAS DE REUNIÓN DE CADA CONGREGACIÓN
//  Se guardan como los devuelve Date.getDay(): 0 = domingo … 6 = sábado.
// ---------------------------------------------------------------------------
export const WEEKDAY_NAMES = [
  "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado",
] as const;

/** Opciones ofrecidas para cada reunión. */
export const MIDWEEK_DAY_OPTIONS = [1, 2, 3, 4, 5] as const; // lunes a viernes
export const WEEKEND_DAY_OPTIONS = [6, 0] as const; // sábado o domingo

/** Valores por defecto: los que el sistema tenía fijos en el código. */
export const DEFAULT_MEETING_DAYS = { midweekDay: 4, weekendDay: 6 };

export type MeetingDays = { midweekDay: number; weekendDay: number };

export function weekdayName(n: number): string {
  return WEEKDAY_NAMES[n] ?? String(n);
}

/** ¿Es un día válido para la reunión de entre semana / de fin de semana? */
export function isMidweekDay(n: number): boolean {
  return (MIDWEEK_DAY_OPTIONS as readonly number[]).includes(n);
}
export function isWeekendDay(n: number): boolean {
  return (WEEKEND_DAY_OPTIONS as readonly number[]).includes(n);
}

/** El día (0..6) que corresponde a un tipo de reunión en una congregación. */
export function weekdayOfMeetingDay(day: string, days: MeetingDays): number {
  return day === MEETING_DAYS.SABADO ? days.weekendDay : days.midweekDay;
}

/** Secciones (encabezados) dentro de una reunión. */
export const MEETING_SECTION_LABELS: Record<string, string> = {
  PRESIDENCIA: "Presidencia",
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
  /** Permite asignar 2 hermanos. */
  allowTwo: boolean;
  /**
   * Si es true, los 2 hermanos son iguales (ambos responsables, sin distinción
   * Responsable/Auxiliar). Ej.: pasar micrófono.
   */
  equalPair?: boolean;
};

export const JUEVES_SLOTS: MeetingSlot[] = [
  { key: "j_presidente", label: "Presidente de la reunión", section: "PRESIDENCIA", allowTwo: false },
  { key: "j_oracion_inicio", label: "Oración de Inicio", section: "ORACION_INICIO", allowTwo: false },
  { key: "j_tesoros_discurso", label: "Discurso", section: "TESOROS", allowTwo: false },
  { key: "j_perlas", label: "Busquemos perlas escondidas", section: "TESOROS", allowTwo: false },
  { key: "j_lectura", label: "Lectura de la Biblia", section: "TESOROS", allowTwo: false },
  { key: "j_smm_conversaciones", label: "Empiece conversaciones", section: "SMM", allowTwo: true },
  { key: "j_smm_revisitas", label: "Haga revisitas", section: "SMM", allowTwo: true },
  { key: "j_smm_discurso", label: "Discurso", section: "SMM", allowTwo: false },
  { key: "j_smm_discipulos", label: "Haga discípulos", section: "SMM", allowTwo: true },
  { key: "j_smm_creencias", label: "Explique sus creencias", section: "SMM", allowTwo: true },
  // "Nuestra Vida Cristiana" no lleva Auxiliar (solo un hermano).
  { key: "j_vc_discurso1", label: "Discurso", section: "VC", allowTwo: false },
  { key: "j_vc_discurso2", label: "Discurso", section: "VC", allowTwo: false },
  { key: "j_vc_conductor", label: "Conductor del Estudio Bíblico", section: "VC", allowTwo: false },
  { key: "j_vc_lector", label: "Lector del Estudio Bíblico", section: "VC", allowTwo: false },
  { key: "j_oracion_final", label: "Oración Final", section: "ORACION_FINAL", allowTwo: false },
  // Responsabilidades (igual que el sábado), al final de la reunión.
  { key: "j_microfono", label: "Pasa micrófono", section: "RESPONSABILIDADES", allowTwo: true, equalPair: true },
  { key: "j_acomodador_entrada", label: "Acomodador de entrada", section: "RESPONSABILIDADES", allowTwo: false },
  { key: "j_acomodador_auditorio", label: "Acomodador de auditorio", section: "RESPONSABILIDADES", allowTwo: false },
  { key: "j_sonido", label: "Sonido", section: "RESPONSABILIDADES", allowTwo: false },
  { key: "j_video", label: "Video", section: "RESPONSABILIDADES", allowTwo: false },
  { key: "j_plataforma", label: "Plataforma", section: "RESPONSABILIDADES", allowTwo: false },
];

export const SABADO_SLOTS: MeetingSlot[] = [
  { key: "s_oracion_inicio", label: "Oración de inicio", section: "SAB_ASIGNACIONES", allowTwo: false },
  { key: "s_lector_atalaya", label: "Lector de la Atalaya", section: "SAB_ASIGNACIONES", allowTwo: false },
  { key: "s_presidente", label: "Presidente de la Reunión", section: "SAB_ASIGNACIONES", allowTwo: false },
  { key: "s_microfono", label: "Pasa micrófono", section: "SAB_RESPONSABILIDADES", allowTwo: true, equalPair: true },
  { key: "s_acomodador_entrada", label: "Acomodador de entrada", section: "SAB_RESPONSABILIDADES", allowTwo: false },
  { key: "s_acomodador_auditorio", label: "Acomodador de auditorio", section: "SAB_RESPONSABILIDADES", allowTwo: false },
  { key: "s_sonido", label: "Sonido", section: "SAB_RESPONSABILIDADES", allowTwo: false },
  { key: "s_video", label: "Video", section: "SAB_RESPONSABILIDADES", allowTwo: false },
  { key: "s_plataforma", label: "Plataforma", section: "SAB_RESPONSABILIDADES", allowTwo: false },
];

/**
 * Secciones que NUNCA llevan Auxiliar (segundo hermano).
 * "Nuestra Vida Cristiana" se asigna a un solo hermano.
 */
export const SECTIONS_WITHOUT_SECONDARY = ["VC"];

/** ¿La sección admite un Auxiliar (segundo hermano)? */
export function sectionAllowsSecondary(section: string): boolean {
  return !SECTIONS_WITHOUT_SECONDARY.includes(section);
}

/** Devuelve las casillas (slots) de una reunión según el día. */
export function slotsForDay(day: string): MeetingSlot[] {
  return day === MEETING_DAYS.SABADO ? SABADO_SLOTS : JUEVES_SLOTS;
}

/**
 * Etiqueta de una reunión: "Jueves (Entre semana)".
 *
 * De dónde sale el día, según el tipo de reunión:
 *
 *  - Las importadas de la planilla abarcan una SEMANA y guardan como fecha el
 *    primer día de esa semana (el lunes), no el día en que se reúne la
 *    congregación. Para esas, el día es el que la congregación tiene
 *    configurado; si no, todas dirían "Lunes".
 *  - Las creadas a mano guardan la fecha exacta de la reunión, así que el día
 *    se toma de ella y no de la configuración.
 */
export function meetingDayLabel(
  day: string,
  date?: Date | string | null,
  opts?: { weekLabel?: string | null; days?: MeetingDays },
): string {
  const tipo = MEETING_DAY_LABELS[day as MeetingDay] ?? day;

  if (opts?.weekLabel && opts.days) {
    return `${weekdayName(weekdayOfMeetingDay(day, opts.days))} (${tipo})`;
  }
  if (!date) return tipo;
  const d = new Date(date);
  if (isNaN(d.getTime())) return tipo;
  return `${weekdayName(d.getDay())} (${tipo})`;
}

/** Orden de aparición de las secciones por día. */
export const JUEVES_SECTION_ORDER = [
  "PRESIDENCIA",
  "ORACION_INICIO",
  "TESOROS",
  "SMM",
  "VC",
  "ORACION_FINAL",
  "RESPONSABILIDADES",
];
export const SABADO_SECTION_ORDER = ["SAB_ASIGNACIONES", "SAB_RESPONSABILIDADES"];

// ---------------------------------------------------------------------------
//  RESPONSABILIDADES MENSUALES (planificación desde una sola pantalla)
//  Se guardan como MeetingAssignment con estos slotKey canónicos (sección
//  RESPONSABILIDADES). "Limpieza por Grupos" guarda el nombre del grupo en vez
//  de un publicador.
// ---------------------------------------------------------------------------
export type MonthlyResponsibility = {
  key: string; // slotKey canónico
  label: string;
  kind: "publisher" | "group";
};

export const MONTHLY_RESPONSIBILITIES: MonthlyResponsibility[] = [
  { key: "r_acom_entrada", label: "Acomodador de Entrada", kind: "publisher" },
  { key: "r_acom_auditorio", label: "Acomodador de Auditorio", kind: "publisher" },
  { key: "r_microfono", label: "Pasa Micrófono 1", kind: "publisher" },
  { key: "r_microfono_2", label: "Pasa Micrófono 2", kind: "publisher" },
  { key: "r_acom_plataforma", label: "Acomodador de Plataforma", kind: "publisher" },
  { key: "r_audio", label: "Audio", kind: "publisher" },
  { key: "r_video", label: "Video", kind: "publisher" },
  { key: "r_limpieza", label: "Limpieza por Grupos", kind: "group" },
];

export const MONTHLY_RESP_KEYS = MONTHLY_RESPONSIBILITIES.map((r) => r.key);

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

// ---------------------------------------------------------------------------
//  CATEGORÍAS DE RESPONSABILIDAD
//  Agrupan las casillas de responsabilidad por "tipo de tarea": los hermanos se
//  apuntan a una categoría y la asignación automática reparte sus casillas.
//  "Limpieza por Grupos" queda fuera a propósito: son grupos, no publicadores.
// ---------------------------------------------------------------------------
export type RespCategory = {
  key: string;
  label: string;
  /** Casillas (slotKey) que cubre esta categoría. */
  slots: string[];
};

export const RESP_CATEGORIES: RespCategory[] = [
  {
    key: "ACOMODADORES",
    label: "Acomodadores",
    slots: ["r_acom_entrada", "r_acom_auditorio"],
  },
  { key: "MICROFONO", label: "Pasa Micrófono", slots: ["r_microfono", "r_microfono_2"] },
  { key: "PLATAFORMA", label: "Acomodador de Plataforma", slots: ["r_acom_plataforma"] },
  { key: "AUDIO", label: "Audio", slots: ["r_audio"] },
  { key: "VIDEO", label: "Video", slots: ["r_video"] },
];

export const RESP_CATEGORY_KEYS = RESP_CATEGORIES.map((c) => c.key);

/** La categoría a la que pertenece una casilla, o null si no la cubre ninguna. */
export function categoryOfSlot(slotKey: string): RespCategory | null {
  return RESP_CATEGORIES.find((c) => c.slots.includes(slotKey)) ?? null;
}
