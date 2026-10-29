import { requireSecretary,
  congregationId,
} from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import {
  Card,
  CardHeader,
  CardBody,
  Table,
  Th,
  Td,
  EmptyState,
  Badge,
} from "@/components/ui";
import { MaintenancePanel } from "@/components/MaintenancePanel";

function actionTone(action: string) {
  switch (action) {
    case "CREAR":
      return "green" as const;
    case "ELIMINAR":
    case "REINICIAR_DATOS":
      return "red" as const;
    case "EDITAR":
      return "blue" as const;
    default:
      return "slate" as const;
  }
}

export default async function AuditoriaPage() {
  const user = await requireSecretary();

  const cong = congregationId(user);
  const [logs, totalLogs] = await Promise.all([
    prisma.auditLog.findMany({
      where: { congregationId: cong },
      orderBy: { createdAt: "desc" },
      take: 150,
      include: { user: { select: { name: true, username: true } } },
    }),
    prisma.auditLog.count({ where: { congregationId: cong } }),
  ]);

  return (
    <>
      <PageHeader
        title="Auditoría y mantenimiento"
        description="Registro de cambios importantes y herramientas de datos."
      />

      <Card className="mb-6">
        <CardHeader title="Mantenimiento de datos" />
        <CardBody>
          <MaintenancePanel lineasAuditoria={totalLogs} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Registro de auditoría"
          description={
            totalLogs > logs.length
              ? `Los ${logs.length} más recientes, de ${totalLogs} en total.`
              : `${logs.length} evento(s).`
          }
        />
        {logs.length === 0 ? (
          <EmptyState title="Sin eventos registrados todavía" />
        ) : (
          <CardBody className="px-0 py-0">
            <Table>
              <thead>
                <tr>
                  <Th>Fecha y hora</Th>
                  <Th>Usuario</Th>
                  <Th>Acción</Th>
                  <Th>Entidad</Th>
                  <Th>Detalle</Th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <Td className="whitespace-nowrap text-muted">
                      {l.createdAt.toLocaleString("es-CL")}
                    </Td>
                    <Td>{l.user?.name ?? "—"}</Td>
                    <Td>
                      <Badge tone={actionTone(l.action)}>{l.action}</Badge>
                    </Td>
                    <Td>{l.entity}</Td>
                    <Td className="text-muted">{l.details ?? ""}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardBody>
        )}
      </Card>
    </>
  );
}
