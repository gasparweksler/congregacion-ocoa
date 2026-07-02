// ============================================================================
//  Esquemas de validación (Zod)
//  Se usan tanto en formularios como en Server Actions para garantizar datos
//  correctos antes de tocar la base de datos.
// ============================================================================

import { z } from "zod";
import {
  PUBLISHER_STATUS_VALUES,
  ROLE_VALUES,
  GROUP_ROLES,
  SEX,
} from "@/lib/constants";

// --- Login -----------------------------------------------------------------
export const loginSchema = z.object({
  username: z.string().trim().min(1, "Ingresa tu usuario"),
  password: z.string().min(1, "Ingresa tu contraseña"),
});

// --- Cambio de contraseña --------------------------------------------------
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Ingresa tu contraseña actual"),
    newPassword: z
      .string()
      .min(6, "La nueva contraseña debe tener al menos 6 caracteres"),
    confirmPassword: z.string().min(1, "Confirma la nueva contraseña"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

// --- Grupo -----------------------------------------------------------------
export const groupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "El nombre del grupo debe tener al menos 2 caracteres")
    .max(60, "El nombre es demasiado largo"),
});

// --- Usuario (Superintendente / Auxiliar / Secretario) ---------------------
const usernameField = z
  .string()
  .trim()
  .min(3, "El usuario debe tener al menos 3 caracteres")
  .max(40, "El usuario es demasiado largo")
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    "Solo se permiten letras, números, punto, guion y guion bajo",
  );

export const createUserSchema = z
  .object({
    name: z.string().trim().min(2, "Ingresa el nombre completo"),
    username: usernameField,
    password: z
      .string()
      .min(6, "La contraseña debe tener al menos 6 caracteres"),
    role: z.enum(ROLE_VALUES as [string, ...string[]]),
    groupId: z.string().trim().optional().nullable(),
    mustChangePassword: z.boolean().optional().default(false),
    alsoConfirmador: z.boolean().optional().default(false),
    groupRoleLabel: z.string().trim().optional().nullable(),
  })
  .refine(
    // Superintendente/Auxiliar deben tener grupo asignado.
    (d) => !GROUP_ROLES.includes(d.role as never) || !!d.groupId,
    { message: "Selecciona el grupo para este usuario", path: ["groupId"] },
  );

export const updateUserSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(2, "Ingresa el nombre completo"),
    username: usernameField,
    role: z.enum(ROLE_VALUES as [string, ...string[]]),
    groupId: z.string().trim().optional().nullable(),
    active: z.boolean().optional().default(true),
    alsoConfirmador: z.boolean().optional().default(false),
    groupRoleLabel: z.string().trim().optional().nullable(),
    // Opcional: si se completa, restablece la contraseña.
    newPassword: z
      .string()
      .min(6, "La contraseña debe tener al menos 6 caracteres")
      .optional()
      .or(z.literal("")),
  })
  .refine((d) => !GROUP_ROLES.includes(d.role as never) || !!d.groupId, {
    message: "Selecciona el grupo para este usuario",
    path: ["groupId"],
  });

// --- Publicador ------------------------------------------------------------
const optionalDate = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const publisherSchema = z.object({
  fullName: z.string().trim().min(2, "Ingresa el nombre completo"),
  sex: z.enum([SEX.M, SEX.F]).optional().nullable(),
  birthDate: optionalDate,
  baptismDate: optionalDate,
  status: z.enum(PUBLISHER_STATUS_VALUES as [string, ...string[]]),
  groupId: z.string().min(1, "Selecciona el grupo"),
});

// --- Informe mensual -------------------------------------------------------
export const monthlyReportSchema = z.object({
  publisherId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  participated: z.boolean(),
  bibleStudies: z.coerce
    .number()
    .int("Debe ser un número entero")
    .min(0, "No puede ser negativo")
    .max(999),
  // Horas: opcional (solo precursores). Se valida en la acción según el estado.
  hours: z.coerce
    .number()
    .int("Debe ser un número entero")
    .min(0, "No puede ser negativo")
    .max(9999)
    .optional()
    .nullable(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type GroupInput = z.infer<typeof groupSchema>;
export type PublisherInput = z.infer<typeof publisherSchema>;
export type MonthlyReportInput = z.infer<typeof monthlyReportSchema>;
