// ============================================================================
//  Configuración de autenticación (NextAuth / Auth.js v5)
//  - Proveedor de credenciales (usuario + contraseña).
//  - Sesiones JWT (necesario con el proveedor de credenciales).
//  - El token y la sesión transportan role y groupId para el control de acceso.
// ============================================================================

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { type Role } from "@/lib/constants";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Credenciales",
      credentials: {
        username: { label: "Usuario", type: "text" },
        password: { label: "Contraseña", type: "password" },
      },
      authorize: async (credentials) => {
        const username = String(credentials?.username ?? "").trim();
        const password = String(credentials?.password ?? "");
        if (!username || !password) return null;

        const user = await prisma.user.findUnique({ where: { username } });
        // Usuario inexistente o desactivado => acceso denegado.
        if (!user || !user.active) return null;

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        // Lo que se devuelve aquí alimenta el callback `jwt`.
        return {
          id: user.id,
          name: user.name,
          username: user.username,
          role: user.role as Role,
          groupId: user.groupId,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  callbacks: {
    // Persistimos los datos del usuario en el token.
    jwt: ({ token, user }) => {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.groupId = user.groupId ?? null;
        token.username = user.username;
        token.mustChangePassword = user.mustChangePassword ?? false;
      }
      return token;
    },
    // Exponemos esos datos en `session.user` para usarlos en el servidor/cliente.
    session: ({ session, token }) => {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.groupId = (token.groupId as string | null) ?? null;
        session.user.username = token.username as string;
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
      }
      return session;
    },
  },
});
