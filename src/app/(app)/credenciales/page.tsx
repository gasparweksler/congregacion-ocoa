import { requireSecretary } from "@/lib/access";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui";
import { CredentialsViewer } from "@/components/CredentialsViewer";

// Solo el Secretario puede acceder. Además, dentro pide una pregunta de
// seguridad antes de revelar las contraseñas.
export default async function CredencialesPage() {
  await requireSecretary();

  return (
    <>
      <PageHeader
        title="Ver Credenciales"
        description="Consulta los usuarios y sus contraseñas. Requiere responder la pregunta de seguridad."
      />

      <Card>
        <CardHeader title="Acceso protegido" />
        <CardBody>
          <CredentialsViewer />
        </CardBody>
      </Card>
    </>
  );
}
