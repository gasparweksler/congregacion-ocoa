import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/access";
import { Card, CardBody } from "@/components/ui";
import { LoginForm } from "@/components/forms/LoginForm";

// Página de inicio de sesión. Si ya hay sesión, va directo al panel.
export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/panel");

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-100 to-slate-200 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-white shadow-md">
            O
          </div>
          <h1 className="text-xl font-bold text-foreground">
            Congregación Ocoa
          </h1>
          <p className="mt-1 text-sm text-muted">
            Sistema de Actividad de Publicadores
          </p>
        </div>

        <Card>
          <CardBody className="px-6 py-6">
            <LoginForm />
          </CardBody>
        </Card>

        <p className="mt-6 text-center text-xs text-muted">
          Acceso exclusivo para el Secretario, Superintendentes y Auxiliares.
        </p>
      </div>
    </div>
  );
}
