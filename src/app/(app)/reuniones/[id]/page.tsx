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
  MONTHLY_RESP_KEYS,
  slotsForDay,
  weekdayOfMeetingDay,
} from "@/lib/constants";
import { realMeetingDate } from "@/lib/meeting-week";
import { formatDate, toInputDate } from "@/lib/dates";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui";
import { MeetingEditor } from "@/components/forms/MeetingEditor";
import { getMeetingDays } from "@/lib/meeting-days";
import { respSettingsFrom, responsibilitiesToShow } from "@/lib/resp-settings";
import { ProgramDataForm } from "@/components/forms/ProgramDataForm";
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

  const meetingDays = await getMeetingDays(cong);
  // Los ajustes de responsabilidades de la congregación (cuántos micrófonos,
  // si el de Audio hace también Video, si un solo acomodador cubre las dos
  // puertas): lo que no se reparte no se pide confirmar.
  const respSettings = respSettingsFrom(
    await prisma.congregation.findUnique({
      where: { id: cong },
      select: { micCount: true, audioAlsoVideo: true, ushersMerged: true },
    }),
  );

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

  // Rescate de títulos en blanco: un fallo ya corregido guardaba algunas
  // asignaciones con el título genérico "Asignación" (el que pone el servidor
  // cuando el formulario no trae ninguno). Si la casilla es una de las fijas
  // de la reunión, se muestra con su nombre de siempre en vez de ese genérico.
  // No se toca ningún nombre de hermano, y al guardar queda ya bien escrito.
  const tituloDeSlot = new Map(
    slotsForDay(meeting.day).map((s) => [s.key, s.label]),
  );
  const titulo = (slotKey: string, label: string) =>
    label === "Asignación" ? (tituloDeSlot.get(slotKey) ?? label) : label;

  const rows = meeting.assignments
    .filter((a) => !isResp(a))
    .map((a) => ({
      id: a.id,
      slotKey: a.slotKey,
      section: a.section,
      label: titulo(a.slotKey, a.label),
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

  // Responsabilidades canónicas (leídas de la planificación mensual), solo las
  // que la congregación usa. Una que ya no se reparte sigue a la vista si tiene
  // un nombre guardado, para no hacer creer que se borró.
  const nombreDeSlot = (slotKey: string) =>
    (meeting.assignments.find((x) => x.slotKey === slotKey)?.primaryName ?? "").trim();
  const responsibilities = responsibilitiesToShow(
    respSettings,
    (slotKey) => nombreDeSlot(slotKey) !== "",
  ).map((r) => {
    const a = meeting.assignments.find((x) => x.slotKey === r.key);
    return {
      key: r.key,
      label: r.inactiva ? `${r.label} (ya no se reparte)` : r.label,
      kind: r.kind,
      assignmentId: a?.id ?? null,
      name: a?.primaryName ?? "",
      token: a?.primaryToken ?? null,
      status: a?.primaryStatus ?? "PENDIENTE",
    };
  });

  // Lo que la planilla trae de la semana, sin inventar nada: si un dato no
  // estaba en el Excel, queda vacío y se puede escribir a mano.
  // Atajo a "Todas las Responsabilidades del mes" desde esta reunión: se abre
  // ya en SU mes, no en el de hoy. Las reuniones importadas guardan la fecha
  // del lunes de su semana, así que el mes se toma del día en que de verdad
  // se reúnen (que puede caer en el mes siguiente).
  const fechaReal = realMeetingDate(meeting.date, meeting.day, {
    weekLabel: meeting.weekLabel,
    weekday: weekdayOfMeetingDay(meeting.day, meetingDays),
  });
  const respMonthHref = `/reuniones/responsabilidades?anio=${fechaReal.getFullYear()}&mes=${fechaReal.getMonth() + 1}`;

  const datosPrograma = {
    weeklyReading: meeting.weeklyReading ?? "",
    songStart: meeting.songStart ?? "",
    songMiddle: meeting.songMiddle ?? "",
    songEnd: meeting.songEnd ?? "",
    speakerName: meeting.speakerName ?? "",
    talkNumber: meeting.talkNumber ?? "",
    talkTitle: meeting.talkTitle ?? "",
    hospitalityGroup: meeting.hospitalityGroup ?? "",
  };
  const esFinde = meeting.day === MEETING_DAYS.SABADO;

  return (
    <>
      <AutoRefresh seconds={8} />
      <PageHeader
        title={`Reunión · ${meeting.weekLabel ?? formatDate(meeting.date)}`}
        description={`${meetingDayLabel(meeting.day, meeting.date, {
          weekLabel: meeting.weekLabel,
          days: meetingDays,
        })} · Creada ${formatDate(
          meeting.createdAt,
        )} · Última modificación ${formatDate(meeting.updatedAt)}`}
        action={<BackButton href="/reuniones" />}
      />

      {/* Datos del programa que no son asignación de nadie: se leen de la
          planilla al importar y se usan también para el PDF del programa. */}
      <Card className="mb-6">
        <CardHeader
          title={esFinde ? "Programa del fin de semana" : "Programa de la semana"}
          description={
            esFinde
              ? "Las canciones del fin de semana. El orador, el tema y la hospitalidad se escriben más abajo, en sus asignaciones."
              : "Canciones y lectura semanal. Llegan de la planilla al importarla, y se pueden corregir aquí."
          }
        />
        <CardBody>
          <ProgramDataForm
            meetingId={meeting.id}
            day={meeting.day}
            data={datosPrograma}
          />
        </CardBody>
      </Card>

      <MeetingEditor
        meetingId={meeting.id}
        day={meeting.day}
        dayLabel={meetingDayLabel(meeting.day, meeting.date, {
          weekLabel: meeting.weekLabel,
          days: meetingDays,
        })}
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
        respMonthHref={respMonthHref}
        esFinde={esFinde}
        programa={{
          speakerName: datosPrograma.speakerName,
          talkNumber: datosPrograma.talkNumber,
          talkTitle: datosPrograma.talkTitle,
          hospitalityGroup: datosPrograma.hospitalityGroup,
        }}
        loadedAt={meeting.updatedAt.toISOString()}
      />

    </>
  );
}
