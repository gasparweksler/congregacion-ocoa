// Tipos compartidos por las Server Actions de formularios.
export type FormState = {
  error?: string;
  success?: string;
};

export const EMPTY_FORM_STATE: FormState = {};

/**
 * ¿El error de Prisma es una violación de unicidad (P2002)?
 * Se usa para distinguir "otra persona lo creó primero" de un fallo real,
 * sin importar el cliente de Prisma en los componentes de cliente.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}
