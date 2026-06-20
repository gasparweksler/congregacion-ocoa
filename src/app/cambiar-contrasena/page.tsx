import Link from "next/link";
import { requireUser } from "@/lib/access";
import { Card, CardBody, CardHeader, Alert } from "@/components/ui";
import { ChangePasswordForm } from "@/components/forms/ChangePasswordForm";

// Ruta independiente (fuera del layout que obliga el cambio) para evitar
// bucles de redirección cuando el usuario tiene mustChangePassword = true.
export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ obligatorio?: string }>;
}) {
  await requireUser();
  const { obligatorio } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader
            title="Cambiar contraseña"
            description="Elige una contraseña personal y segura."
          />
          <CardBody className="space-y-4">
            {obligatorio ? (
              <Alert tone="warning">
                Por seguridad, debes cambiar la contraseña inicial antes de
                continuar.
              </Alert>
            ) : null}
            <ChangePasswordForm />
            <div className="pt-2 text-center">
              <Link
                href="/panel"
                className="text-sm font-medium text-primary hover:underline"
              >
                ← Volver al panel
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
