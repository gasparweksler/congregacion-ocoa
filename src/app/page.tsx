import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/access";

// Página raíz: envía al panel si hay sesión, o al login si no la hay.
export default async function Home() {
  const user = await getSessionUser();
  redirect(user ? "/panel" : "/login");
}
