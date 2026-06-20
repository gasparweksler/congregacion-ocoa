import { requireSecretary } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui";
import { ExportPanel } from "@/components/ExportPanel";

export default async function ExportarPage() {
  await requireSecretary();

  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <>
      <PageHeader
        title="Exportar a Excel"
        description="Descarga informes, estadísticas y listados en formato .xlsx."
      />
      <Card>
        <CardHeader
          title="Generar archivos"
          description="Elige el período y, si quieres, un grupo específico."
        />
        <CardBody>
          <ExportPanel groups={groups} />
        </CardBody>
      </Card>
    </>
  );
}
