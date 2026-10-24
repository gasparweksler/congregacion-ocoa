import Link from "next/link";
import { cn } from "@/lib/cn";
import {
  requireMeetingsAccess,
  congregationId,
  isSecretary,
} from "@/lib/access";
import { prisma } from "@/lib/prisma";
import {
  meetingDayLabel,
  CONFIRM_STATUS,
  ROLES,
  MONTHLY_RESP_KEYS,
  MEETING_DAYS,
} from "@/lib/constants";
import { ConfirmadorSelect } from "@/components/ConfirmadorSelect";
import { AutoRefresh } from "@/components/AutoRefresh";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody, EmptyState, Badge } from "@/components/ui";
import { MeetingCreateForm } from "@/components/forms/MeetingCreateForm";
import { MeetingImport } from "@/components/forms/MeetingImport";
import { ProgramaPdfDownload } from "@/components/forms/ProgramaPdfDownload";
import { MeetingDaysForm } from "@/components/forms/MeetingDaysForm";
import { getMeetingDays } from "@/lib/meeting-days";
import { DeleteMeetingButton } from "@/components/DeleteMeetingButton";
import { EnterMeetingButton } from "@/components/EnterMeetingButton";
import { LoadingLinkButton } from "@/components/LoadingLinkButton";
import {
  deleteMeetingAction,
  deleteAllMeetingsAction,
} from "@/server/meeting-actions";

export default async function ReunionesPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>;
}) {
  const user = await requireMeetingsAccess();
  const cong = congregationId(user);

  // Filtro por tipo de reunión, para no verlas mezcladas. Va por la URL para
  // que sobreviva al refresco automático de la pantalla.
  const { dia } = await searchParams;
  const filtro =
    dia === MEETING_DAYS.JUEVES || dia === MEETING_DAYS.SABADO ? dia : null;

  // Días de reunión de esta congregación (antes estaban fijos: jueves/sábado).
  const meetingDays = await getMeetingDays(cong);

  const meetingsRaw = await prisma.meeting.findMany({
    where: { congregationId: cong },
    include: { assignments: true },
  });
  // Orden por cercanía a la fecha de hoy: la más cercana primero, la más lejana
  // al final (sirve tanto para reuniones próximas como pasadas).
  const now = Date.now();
  const todas = meetingsRaw.sort(
    (a, b) =>
      Math.abs(a.date.getTime() - now) - Math.abs(b.date.getTime() - now),
  );
  // Cuántas hay de cada tipo (se muestran en los botones aunque haya filtro).
  const totalEntreSemana = todas.filter(
    (m) => m.day === MEETING_DAYS.JUEVES,
  ).length;
  const totalFinDeSemana = todas.length - totalEntreSemana;
  const meetings = filtro ? todas.filter((m) => m.day === filtro) : todas;

  // Responsables de Confirmación disponibles para el desplegable de cada reunión.
  const confirmadoresUsers = await prisma.user.findMany({
    where: {
      active: true,
      congregationId: cong,
      OR: [
        { alsoConfirmador: true },
        { role: ROLES.RESPONSABLE_CONFIRMACIONES },
        { role: ROLES.SECRETARIO },
      ],
    },
    orderBy: { name: "asc" },
    select: { name: true },
  });
  const confirmadorOptions = Array.from(
    new Set(confirmadoresUsers.map((u) => u.name).filter(Boolean)),
  );

  // Meses con programa de Jueves cargado, para ofrecer solo esos en el PDF
  // (el más cercano a hoy primero, igual que el listado de reuniones).
  const conteoPorMes = new Map<string, number>();
  for (const m of meetingsRaw) {
    if (m.day !== MEETING_DAYS.JUEVES) continue;
    const k = `${m.date.getFullYear()}-${m.date.getMonth() + 1}`;
    conteoPorMes.set(k, (conteoPorMes.get(k) ?? 0) + 1);
  }
  const programaPeriods = [...conteoPorMes.entries()]
    .map(([k, count]) => {
      const [year, month] = k.split("-").map(Number);
      return { year, month, count };
    })
    .sort(
      (a, b) =>
        Math.abs(new Date(a.year, a.month - 1, 15).getTime() - now) -
        Math.abs(new Date(b.year, b.month - 1, 15).getTime() - now),
    );

  return (
    <>
      <AutoRefresh seconds={8} />
      <PageHeader
        title="Reuniones de la Congregación"
        description="Organiza las asignaciones y responsabilidades de cada reunión y confirma la disponibilidad de los hermanos."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <LoadingLinkButton
              href="/reuniones/responsabilidades"
              variant="primary"
            >
              🗓️ Todas las Responsabilidades del mes
            </LoadingLinkButton>
            <LoadingLinkButton
              href="/reuniones/estadisticas"
              variant="secondary"
            >
              📈 Estadísticas de Asignaciones
            </LoadingLinkButton>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-1">
          <Card>
            <CardHeader
              title="Selecciona tu día de reunión"
              description="Cada congregación tiene sus propios días."
            />
            <CardBody>
              <MeetingDaysForm
                days={meetingDays}
                canEdit={isSecretary(user)}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Nueva reunión" />
            <CardBody>
              <MeetingCreateForm days={meetingDays} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Carga masiva (Excel)"
              description="Crea varias reuniones de una vez desde una plantilla."
            />
            <CardBody className="space-y-4">
              {/* La planilla en blanco se descarga tal cual, para completarla y
                  subirla después aquí mismo. */}
              <div>
                <a
                  href="/api/plantilla-vymc"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-slate-50"
                >
                  📄 Descargar Planilla Excel
                </a>
                <p className="mt-1.5 text-xs text-muted">
                  Complétala con el programa del mes y súbela aquí abajo.
                </p>
              </div>

              {/* El programa ya cargado, en PDF para imprimir y repartir. */}
              <div className="border-t border-border pt-4">
                <ProgramaPdfDownload periods={programaPeriods} />
              </div>

              <MeetingImport />
            </CardBody>
          </Card>
        </div>

        <div className="min-w-0 lg:col-span-2">
          <Card>
            <CardHeader
              title="Reuniones"
              description={
                filtro
                  ? `${meetings.length} de ${todas.length} reunión(es): solo ${
                      filtro === MEETING_DAYS.JUEVES
                        ? "las de entre semana"
                        : "las de fin de semana"
                    }.`
                  : `${todas.length} reunión(es) registradas.`
              }
              action={
                todas.length > 0 ? (
                  <DeleteMeetingButton
                    action={deleteAllMeetingsAction}
                    title="Eliminar TODAS las reuniones"
                    description={`Se eliminarán las ${todas.length} reuniones de la congregación con sus asignaciones y sus enlaces de confirmación, incluidas las que ahora no se ven por el filtro. Las reuniones no se pueden recuperar.`}
                  >
                    Eliminar todas
                  </DeleteMeetingButton>
                ) : undefined
              }
            />

            {/* Separa las reuniones por tipo: pulsar el filtro activo lo quita
                y vuelven a verse todas. */}
            {todas.length > 0 ? (
              <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3 sm:px-5">
                {[
                  {
                    key: MEETING_DAYS.JUEVES,
                    label: "Reunión de Entresemana",
                    n: totalEntreSemana,
                  },
                  {
                    key: MEETING_DAYS.SABADO,
                    label: "Reunión de Fin de Semana",
                    n: totalFinDeSemana,
                  },
                ].map((b) => {
                  const activo = filtro === b.key;
                  return (
                    <Link
                      key={b.key}
                      href={activo ? "/reuniones" : `/reuniones?dia=${b.key}`}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors",
                        activo
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-surface text-foreground hover:bg-slate-50",
                      )}
                    >
                      {b.label}
                      <span
                        className={cn(
                          "tabular-nums",
                          activo ? "text-white/80" : "text-muted",
                        )}
                      >
                        {b.n}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : null}
            {meetings.length === 0 ? (
              <EmptyState
                title={
                  filtro ? "Ninguna reunión de este tipo" : "Aún no hay reuniones"
                }
                description={
                  filtro
                    ? "No hay reuniones de este tipo registradas. Pulsa otra vez el filtro para ver todas."
                    : "Crea la primera reunión con el formulario de la izquierda."
                }
              />
            ) : (
              <div className="divide-y divide-border">
                {meetings.map((m) => {
                  let confirmed = 0,
                    rejected = 0,
                    pending = 0,
                    asignaciones = 0,
                    responsabilidades = 0;
                  for (const a of m.assignments) {
                    // Las responsabilidades se cuentan aparte de las
                    // asignaciones del programa de la reunión.
                    const esResponsabilidad =
                      a.section === "RESPONSABILIDADES" ||
                      a.section === "SAB_RESPONSABILIDADES" ||
                      MONTHLY_RESP_KEYS.includes(a.slotKey);
                    if (esResponsabilidad) responsabilidades++;
                    else asignaciones++;

                    if (a.primaryName) {
                      if (a.primaryStatus === CONFIRM_STATUS.CONFIRMADO)
                        confirmed++;
                      else if (a.primaryStatus === CONFIRM_STATUS.RECHAZADO)
                        rejected++;
                      else pending++;
                    }
                    if (a.secondaryName) {
                      if (a.secondaryStatus === CONFIRM_STATUS.CONFIRMADO)
                        confirmed++;
                      else if (a.secondaryStatus === CONFIRM_STATUS.RECHAZADO)
                        rejected++;
                      else pending++;
                    }
                  }
                  return (
                    <div
                      key={m.id}
                      className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/reuniones/${m.id}`}
                          className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground">
                                {m.weekLabel ?? formatDate(m.date)}
                              </span>
                              <Badge tone="blue">
                                {meetingDayLabel(m.day, m.date, {
                                  weekLabel: m.weekLabel,
                                  days: meetingDays,
                                })}
                              </Badge>
                            </div>
                            <p className="mt-0.5 text-sm text-muted">
                              Total de asignaciones: {asignaciones}
                              <span className="mx-1.5 text-border">·</span>
                              Total de responsabilidades: {responsabilidades}
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
                        <div className="mt-2">
                          <ConfirmadorSelect
                            meetingId={m.id}
                            current={m.confirmadorName ?? ""}
                            options={confirmadorOptions}
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <EnterMeetingButton meetingId={m.id} />
                        <DeleteMeetingButton
                          action={deleteMeetingAction}
                          hidden={{ id: m.id }}
                          title="Eliminar reunión"
                          description={`Se eliminará la reunión "${
                            m.weekLabel ?? formatDate(m.date)
                          }" con sus asignaciones y sus enlaces de confirmación. La reunión no se puede recuperar.`}
                        >
                          🗑️ Eliminar
                        </DeleteMeetingButton>
                      </div>
                    </div>
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
