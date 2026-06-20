// Endpoint de NextAuth (maneja /api/auth/*: login, logout, sesión, etc.)
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
