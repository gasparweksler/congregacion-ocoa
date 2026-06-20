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
  SECRETARIO: "SECRETARIO",
  SUPERINTENDENTE: "SUPERINTENDENTE",
  AUXILIAR: "AUXILIAR",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_VALUES = Object.values(ROLES) as Role[];

export const ROLE_LABELS: Record<Role, string> = {
  SECRETARIO: "Secretario",
  SUPERINTENDENTE: "Superintendente de Grupo",
  AUXILIAR: "Auxiliar de Grupo",
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
