// ============================================================================
//  Utilidades de contraseña
//  Usamos bcryptjs (implementación en JS puro) para evitar problemas de
//  compilación de binarios nativos en Windows. El hash incluye su propia sal.
// ============================================================================

import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/** Genera el hash seguro de una contraseña en texto plano. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** Compara una contraseña en texto plano con su hash almacenado. */
export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
