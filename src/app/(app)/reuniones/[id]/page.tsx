import { notFound } from "next/navigation";
import { requireMeetingsAccess,
  congregationId,
} from "@/lib/access";
import { prisma } from "@/lib/prisma";
import {
  meetingDayLabel,
  JUEVES_SECTION_ORDER,
  SABADO_SECTION_ORDER,
  MEETING_SECTION_LABELS,
  MEETING_DAYS,
  MONTHLY_RESPONSIBILITIES,
  MONTHLY_RESP_KEYS,
} from "@/lib/constants";
import { formatDate, toInputDate } from "@/lib/dates";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui";
import { MeetingEditor } from "@/components/forms/MeetingEditor";
import {
  MeetingDonePanel,
  type DoneItem,
} from "@/components/forms/MeetingDonePanel";
import { AutoRefresh } from "@/components/AutoRefresh";
import { BackButton } from "@/components/BackButton";

export default async function ReunionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireMeetingsAccess();
  const cong = congregationId(user);
  const { id } = await params;

  const meeting = await prisma.meeting.findFirst({
    where: { id, congregationId: cong },
    include: { assignments: { orderBy: { order: "asc" } } },
  });
  if (!meeting) notFound();

  // Lista de hermanos (publicadores) para el buscador rápido.
  const publishers = await prisma.publisher.findMany({
    where: { congregationId: cong },
    orderBy: { fullName: "asc" },
    select: { fullName: true },
  });
  const hermanos = publishers.map((p) => p.fullName);

  // Un elemento por hermano asignado (responsable y auxiliar por separado).
  const doneItems: DoneItem[] = meeting.assignments.flatMap((a) => [
    ...(a.primaryName?.trim()
      ? [
          {
            assignmentId: a.id,
            section: a.section,
            label: a.label,
            who: "p" as const,
            name: a.primaryName.trim(),
            roleLabel: "Responsable",
            done: a.primaryDone,
          },
        ]
      : []),
    ...(a.secondaryName?.trim()
      ? [
          {
            assignmentId: a.id,
            section: a.section,
            label: a.label,
            who: "s" as const,
            name: a.secondaryName.trim(),
            roleLabel: "Auxiliar",
            done: a.secondaryDone,
          },
        ]
      : []),
  ]);

  const sectionOrder =
    meeting.day === MEETING_DAYS.SABADO
      ? SABADO_SECTION_ORDER
      : JUEVES_SECTION_ORDER;

  // Las RESPONSABILIDADES se administran en la vista mensual; aquí solo se
  // muestran (bloqueadas). Se separan de las asignaciones editables.
  const isResp = (a: { section: string; slotKey: string }) =>
    a.section === "RESPONSABILIDADES" ||
    a.section === "SAB_RESPONSABILIDADES" ||
    MONTHLY_RESP_KEYS.includes(a.slotKey);

  const rows = meeting.assignments
    .filter((a) => !isResp(a))
    .map((a) => ({
      id: a.id,
      slotKey: a.slotKey,
      section: a.section,
      label: a.label,
      allowTwo: a.allowTwo,
      equalPair: a.equalPair,
      note: a.note ?? "",
      primaryName: a.primaryName ?? "",
      primaryToken: a.primaryToken,
      primaryStatus: a.primaryStatus,
      secondaryName: a.secondaryName ?? "",
      secondaryToken: a.secondaryToken,
      secondaryStatus: a.secondaryStatus,
    }));

  // Responsabilidades canónicas (leídas de la planificación mensual).
  const responsibilities = MONTHLY_RESPONSIBILITIES.map((r) => {
    const a = meeting.assignments.find((x) => x.slotKey === r.key);
    return {
      key: r.key,
      label: r.label,
      kind: r.kind,
      assignmentId: a?.id ?? null,
      name: a?.primaryName ?? "",
      token: a?.primaryToken ?? null,
      status: a?.primaryStatus ?? "PENDIENTE",
    };
  });

  return (
    <>
      <AutoRefresh seconds={8} />
      <PageHeader
        title={`Reunión · ${meeting.weekLabel ?? formatDate(meeting.date)}`}
        description={`${meetingDayLabel(meeting.day, meeting.date)} · Creada ${formatDate(
          meeting.createdAt,
        )} · Última modificación ${formatDate(meeting.updatedAt)}`}
        action={<BackButton href="/reuniones" />}
      />

      <MeetingEditor
        meetingId={meeting.id}
        day={meeting.day}
        dayLabel={meetingDayLabel(meeting.day, meeting.date)}
        dateLabel={formatDate(meeting.date)}
        confirmadorName={meeting.confirmadorName ?? ""}
        currentUserName={user.name ?? user.username}
        weekLabel={meeting.weekLabel ?? ""}
        dateInput={toInputDate(meeting.date)}
        rows={rows}
        sectionOrder={sectionOrder}
        sectionLabels={MEETING_SECTION_LABELS}
        hermanos={hermanos}
        responsibilities={responsibilities}
        loadedAt={meeting.updatedAt.toISOString()}
      />

      {/* Registro de cumplimiento. Va fuera del editor para no interferir con
          el guardado del programa ni con el aviso de edición simultánea. */}
      <Card className="mt-6">
        <CardHeader
          title="¿Qué asignaciones se realizaron?"
          description="Esto es distinto de la confirmación por WhatsApp: aquí se registra lo que de verdad ocurrió en la reunión. Alimenta las Estadísticas de Asignaciones."
        />
        <CardBody>
          <MeetingDonePanel meetingId={meeting.id} items={doneItems} />
        </CardBody>
      </Card>
    </>
  );
}
