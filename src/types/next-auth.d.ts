// ============================================================================
//  Ampliación de tipos de NextAuth
//  Añade los campos personalizados (role, groupId, username, ...) a la sesión
//  y al token JWT para tener tipado fuerte en toda la aplicación.
// ============================================================================

import type { Role } from "@/lib/constants";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      groupId: string | null;
      username: string;
      mustChangePassword: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    username: string;
    role: Role;
    groupId: string | null;
    mustChangePassword?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    groupId: string | null;
    username: string;
    mustChangePassword: boolean;
  }
}
