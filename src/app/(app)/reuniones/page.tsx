import Link from "next/link";
import { requireMeetingsAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { meetingDayLabel, CONFIRM_STATUS } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody, EmptyState, Badge } from "@/components/ui";
import { MeetingCreateForm } from "@/components/forms/MeetingCreateForm";
import { MeetingImport } from "@/components/forms/MeetingImport";

export default async function ReunionesPage() {
  await requireMeetingsAccess();

  const meetings = await prisma.meeting.findMany({
    orderBy: { date: "desc" },
    include: { assignments: true },
  });

  return (
    <>
      <PageHeader
        title="Reuniones de la Congregación"
        description="Organiza las asignaciones y responsabilidades de cada reunión y confirma la disponibilidad de los hermanos."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader title="Nueva reunión" />
            <CardBody>
              <MeetingCreateForm />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Carga masiva (Excel)"
              description="Crea varias reuniones de una vez desde una plantilla."
            />
            <CardBody>
              <MeetingImport />
            </CardBody>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Reuniones"
              description={`${meetings.length} reunión(es) registradas.`}
            />
            {meetings.length === 0 ? (
              <EmptyState
                title="Aún no hay reuniones"
                description="Crea la primera reunión con el formulario de la izquierda."
              />
            ) : (
              <div className="divide-y divide-border">
                {meetings.map((m) => {
                  let confirmed = 0,
                    rejected = 0,
                    pending = 0,
                    assigned = 0;
                  for (const a of m.assignments) {
                    if (a.primaryName) {
                      assigned++;
                      if (a.primaryStatus === CONFIRM_STATUS.CONFIRMADO)
                        confirmed++;
                      else if (a.primaryStatus === CONFIRM_STATUS.RECHAZADO)
                        rejected++;
                      else pending++;
                    }
                    if (a.secondaryName) {
                      assigned++;
                      if (a.secondaryStatus === CONFIRM_STATUS.CONFIRMADO)
                        confirmed++;
                      else if (a.secondaryStatus === CONFIRM_STATUS.RECHAZADO)
                        rejected++;
                      else pending++;
                    }
                  }
                  return (
                    <Link
                      key={m.id}
                      href={`/reuniones/${m.id}`}
                      className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {formatDate(m.date)}
                          </span>
                          <Badge tone="blue">{meetingDayLabel(m.day)}</Badge>
                        </div>
                        <p className="mt-0.5 text-sm text-muted">
                          {assigned} asignación(es)
                          {m.confirmadorName
                            ? ` · Confirma: ${m.confirmadorName}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {confirmed > 0 ? (
                          <Badge tone="green">✅ {confirmed}</Badge>
                        ) : null}
                        {pending > 0 ? (
                          <Badge tone="amber">⏳ {pending}</Badge>
                        ) : null}
                        {rejected > 0 ? (
                          <Badge tone="red">❌ {rejected}</Badge>
                        ) : null}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
