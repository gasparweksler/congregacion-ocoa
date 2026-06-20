import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, canAccessGroup } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { statusLabel, monthName, isPioneer } from "@/lib/constants";
import { statusTone } from "@/lib/ui-helpers";
import { formatDate, ageFrom } from "@/lib/dates";
import { PageHeader } from "@/components/PageHeader";
import {
  Card,
  CardHeader,
  CardBody,
  Badge,
  Table,
  Th,
  Td,
  EmptyState,
} from "@/components/ui";

export default async function PublisherDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const publisher = await prisma.publisher.findUnique({
    where: { id },
    include: {
      group: { select: { name: true } },
      statusChanges: { orderBy: { changedAt: "desc" } },
      reports: { orderBy: [{ year: "desc" }, { month: "desc" }] },
    },
  });

  if (!publisher) notFound();
  // Control de acceso por grupo.
  if (!canAccessGroup(user, publisher.groupId)) notFound();

  const age = ageFrom(publisher.birthDate);

  return (
    <>
      <PageHeader
        title={publisher.fullName}
        description="Ficha e historial del publicador."
        action={
          <Link
            href="/publicadores"
            className="text-sm font-medium text-primary hover:underline"
          >
            ← Volver
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Datos */}
        <Card className="lg:col-span-1">
          <CardHeader title="Datos" />
          <CardBody className="space-y-2 text-sm">
            <Info label="Estado">
              <Badge tone={statusTone(publisher.status)}>
                {statusLabel(publisher.status)}
              </Badge>
            </Info>
            <Info label="Grupo">{publisher.group?.name ?? "—"}</Info>
            <Info label="Sexo">
              {publisher.sex === "M"
                ? "Masculino"
                : publisher.sex === "F"
                  ? "Femenino"
                  : "—"}
            </Info>
            <Info label="Nacimiento">
              {formatDate(publisher.birthDate)}
              {age !== null ? ` (${age} años)` : ""}
            </Info>
            <Info label="Bautismo">{formatDate(publisher.baptismDate)}</Info>
          </CardBody>
        </Card>

        {/* Historial de estados */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Historial de estados"
            description="Cambios de estado a lo largo del tiempo."
          />
          {publisher.statusChanges.length === 0 ? (
            <EmptyState title="Sin cambios registrados" />
          ) : (
            <CardBody>
              <ol className="space-y-3">
                {publisher.statusChanges.map((sc) => (
                  <li key={sc.id} className="flex items-center gap-3">
                    <Badge tone={statusTone(sc.status)}>
                      {statusLabel(sc.status)}
                    </Badge>
                    <span className="text-sm text-muted">
                      {formatDate(sc.changedAt)}
                    </span>
                  </li>
                ))}
              </ol>
            </CardBody>
          )}
        </Card>
      </div>

      {/* Historial de informes */}
      <div className="mt-6">
        <Card>
          <CardHeader
            title="Historial de informes"
            description={`${publisher.reports.length} informe(s) registrados.`}
          />
          {publisher.reports.length === 0 ? (
            <EmptyState title="Aún no hay informes para este publicador" />
          ) : (
            <CardBody className="px-0 py-0">
              <Table>
                <thead>
                  <tr>
                    <Th>Período</Th>
                    <Th>Estado</Th>
                    <Th>Participó</Th>
                    <Th>Cursos bíblicos</Th>
                    <Th>Horas</Th>
                  </tr>
                </thead>
                <tbody>
                  {publisher.reports.map((r) => (
                    <tr key={r.id}>
                      <Td className="font-medium">
                        {monthName(r.month)} {r.year}
                      </Td>
                      <Td>{statusLabel(r.statusAtReport)}</Td>
                      <Td>{r.participated ? "Sí" : "No"}</Td>
                      <Td>{r.bibleStudies}</Td>
                      <Td>
                        {isPioneer(r.statusAtReport) ? (r.hours ?? 0) : "—"}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardBody>
          )}
        </Card>
      </div>
    </>
  );
}

function Info({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-foreground">{children}</span>
    </div>
  );
}
