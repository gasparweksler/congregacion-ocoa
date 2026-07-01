import { notFound } from "next/navigation";
import { requireMeetingsAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import {
  meetingDayLabel,
  slotsForDay,
  JUEVES_SECTION_ORDER,
  SABADO_SECTION_ORDER,
  MEETING_SECTION_LABELS,
  MEETING_DAYS,
} from "@/lib/constants";
import { formatDate, toInputDate } from "@/lib/dates";
import { PageHeader } from "@/components/PageHeader";
import { LinkButton } from "@/components/ui";
import { MeetingEditor } from "@/components/forms/MeetingEditor";

export default async function ReunionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireMeetingsAccess();
  const { id } = await params;

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: { assignments: { orderBy: { order: "asc" } } },
  });
  if (!meeting) notFound();

  // Lista de hermanos (publicadores) para el buscador rápido.
  const publishers = await prisma.publisher.findMany({
    orderBy: { fullName: "asc" },
    select: { fullName: true },
  });
  const hermanos = publishers.map((p) => p.fullName);

  // Mapa slotKey -> allowTwo, para saber si la casilla admite 2 hermanos.
  const slots = slotsForDay(meeting.day);
  const allowTwoByKey = Object.fromEntries(
    slots.map((s) => [s.key, s.allowTwo]),
  );
  const equalPairByKey = Object.fromEntries(
    slots.map((s) => [s.key, !!s.equalPair]),
  );

  const sectionOrder =
    meeting.day === MEETING_DAYS.SABADO
      ? SABADO_SECTION_ORDER
      : JUEVES_SECTION_ORDER;

  const rows = meeting.assignments.map((a) => ({
    id: a.id,
    slotKey: a.slotKey,
    section: a.section,
    label: a.label,
    allowTwo: allowTwoByKey[a.slotKey] ?? false,
    equalPair: equalPairByKey[a.slotKey] ?? false,
    note: a.note ?? "",
    primaryName: a.primaryName ?? "",
    primaryToken: a.primaryToken,
    primaryStatus: a.primaryStatus,
    secondaryName: a.secondaryName ?? "",
    secondaryToken: a.secondaryToken,
    secondaryStatus: a.secondaryStatus,
  }));

  return (
    <>
      <PageHeader
        title={`Reunión · ${meeting.weekLabel ?? formatDate(meeting.date)}`}
        description={`${meetingDayLabel(meeting.day)} · Creada ${formatDate(
          meeting.createdAt,
        )} · Última modificación ${formatDate(meeting.updatedAt)}`}
        action={
          <LinkButton href="/reuniones" variant="secondary">
            ← Volver
          </LinkButton>
        }
      />

      <MeetingEditor
        meetingId={meeting.id}
        day={meeting.day}
        dayLabel={meetingDayLabel(meeting.day)}
        dateLabel={formatDate(meeting.date)}
        confirmadorName={meeting.confirmadorName ?? ""}
        currentUserName={user.name ?? user.username}
        weekLabel={meeting.weekLabel ?? ""}
        dateInput={toInputDate(meeting.date)}
        rows={rows}
        sectionOrder={sectionOrder}
        sectionLabels={MEETING_SECTION_LABELS}
        hermanos={hermanos}
      />
    </>
  );
}
