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

/**
 * Hace una escritura y convierte el choque de "ya existe" en un aviso normal.
 *
 * Varias acciones comprueban primero si un nombre está libre y crean después.
 * Entre esas dos consultas pasan unas décimas de segundo, y si otra persona se
 * adelanta justo ahí, las dos vieron "libre": la base impide el duplicado
 * (bien) pero el error subía crudo a la pantalla (mal). Aquí se devuelve el
 * mismo mensaje que si lo hubiéramos visto al comprobar.
 *
 * Cualquier otro error se deja pasar: solo se traduce el duplicado.
 */
export async function sinDuplicar<T>(
  escribir: () => Promise<T>,
  mensaje: string,
): Promise<{ ok: true; valor: T } | { ok: false; error: string }> {
  try {
    return { ok: true, valor: await escribir() };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: mensaje };
    throw error;
  }
}
