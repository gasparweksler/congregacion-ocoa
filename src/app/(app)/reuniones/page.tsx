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
import {
  Card,
  CardHeader,
  CardBody,
  CollapsibleCard,
  EmptyState,
  Badge,
} from "@/components/ui";
import { MeetingCreateForm } from "@/components/forms/MeetingCreateForm";
import { MeetingImport } from "@/components/forms/MeetingImport";
import { GuiaPdfPlanilla } from "@/components/forms/GuiaPdfPlanilla";
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

  // Qué se está mirando. Va por la URL para que sobreviva al refresco
  // automático de la pantalla.
  //
  // Sin elegir (null) no se enseña ninguna reunión: con los años son cientos,
  // y abrir la pantalla con todas mezcladas no ayudaba a nadie. Hay que pulsar
  // uno de los tres botones.
  const { dia } = await searchParams;
  const vista: "JUEVES" | "SABADO" | "TODAS" | null =
    dia === MEETING_DAYS.JUEVES || dia === MEETING_DAYS.SABADO
      ? dia
      : dia === "TODAS"
        ? "TODAS"
        : null;
  /** El día concreto, cuando la vista es de un solo tipo. */
  const filtro = vista === "TODAS" || vista === null ? null : vista;

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
  // Nada elegido, nada que enseñar.
  const meetings =
    vista === null ? [] : filtro ? todas.filter((m) => m.day === filtro) : todas;

  // Cómo se llama y qué alcanza el botón de borrado masivo, según la vista.
  const borrado =
    vista === MEETING_DAYS.JUEVES
      ? {
          etiqueta: "Eliminar todas las de entre semana",
          cuantas: totalEntreSemana,
          queSon: "reuniones de entre semana",
        }
      : vista === MEETING_DAYS.SABADO
        ? {
            etiqueta: "Eliminar todas las de fin de semana",
            cuantas: totalFinDeSemana,
            queSon: "reuniones de fin de semana",
          }
        : {
            etiqueta: "Eliminar todas las reuniones registradas",
            cuantas: todas.length,
            queSon: "reuniones de la congregación, de entre semana y de fin de semana",
          };

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

  // Meses con reuniones cargadas, para ofrecer solo esos en los PDF (el más
  // cercano a hoy primero, igual que el listado de reuniones). Se cuentan los
  // dos tipos por separado: el mismo selector sirve para los dos programas,
  // y cada botón dice cuántas reuniones hay de lo suyo.
  const conteoPorMes = new Map<string, { count: number; countFinde: number }>();
  for (const m of meetingsRaw) {
    const k = `${m.date.getFullYear()}-${m.date.getMonth() + 1}`;
    const n = conteoPorMes.get(k) ?? { count: 0, countFinde: 0 };
    if (m.day === MEETING_DAYS.JUEVES) n.count++;
    else n.countFinde++;
    conteoPorMes.set(k, n);
  }
  const programaPeriods = [...conteoPorMes.entries()]
    .map(([k, n]) => {
      const [year, month] = k.split("-").map(Number);
      return { year, month, ...n };
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
          <CollapsibleCard
            title="Selecciona tu día de reunión"
            description="Cada congregación tiene sus propios días."
          >
            <MeetingDaysForm days={meetingDays} canEdit={isSecretary(user)} />
          </CollapsibleCard>

          <Card>
            <CardHeader title="Nueva reunión" />
            <CardBody>
              <MeetingCreateForm days={meetingDays} />
            </CardBody>
          </Card>

          <CollapsibleCard
            title="Gestión de Archivos"
            description="Planillas, PDF de la Guía de actividades y descarga de los programas del mes."
            bodyClassName="space-y-4"
          >
            {/* La planilla: en blanco, o ya escrita con el programa del PDF de
                la Guía de actividades si se sube uno. */}
            <GuiaPdfPlanilla />

            {/* Los programas ya cargados, en PDF para imprimir y repartir:
                el de entre semana y el de fin de semana, con un mismo mes. */}
            <div className="border-t border-border pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
                Descargar PDF
              </p>
              <ProgramaPdfDownload periods={programaPeriods} />
            </div>

            <MeetingImport />
          </CollapsibleCard>
        </div>

        <div className="min-w-0 lg:col-span-2">
          <Card>
            <CardHeader
              title="Reuniones"
              description={
                vista === null
                  ? `${todas.length} reunión(es) registradas. Elige abajo cuáles quieres ver.`
                  : filtro
                    ? `${meetings.length} de ${todas.length} reunión(es): solo ${
                        filtro === MEETING_DAYS.JUEVES
                          ? "las de entre semana"
                          : "las de fin de semana"
                      }.`
                    : `Las ${todas.length} reunión(es) registradas, de los dos tipos.`
              }
              action={
                // Borrar reuniones en bloque lo hace solo el Administrador:
                // antes podía también un Responsable de Confirmaciones.
                //
                // El botón solo sale con una vista elegida, y borra ÚNICAMENTE
                // lo que esa vista enseña: así nadie borra de un tirón algo
                // que no está viendo.
                vista !== null && borrado.cuantas > 0 && isSecretary(user) ? (
                  <DeleteMeetingButton
                    action={deleteAllMeetingsAction}
                    hidden={{ dia: filtro ?? "" }}
                    title={`${borrado.etiqueta} (${borrado.cuantas})`}
                    description={`Se eliminarán las ${borrado.cuantas} ${borrado.queSon}, con sus asignaciones y sus enlaces de confirmación.${
                      filtro
                        ? ` Las del otro tipo no se tocan: seguirán ahí las ${
                            filtro === MEETING_DAYS.JUEVES
                              ? `${totalFinDeSemana} de fin de semana`
                              : `${totalEntreSemana} de entre semana`
                          }.`
                        : ""
                    } Las reuniones no se pueden recuperar.`}
                  >
                    🗑️ {borrado.etiqueta}
                  </DeleteMeetingButton>
                ) : undefined
              }
            />

            {/* Los tres botones. Pulsar el que ya está activo lo desactiva y
                se vuelve a la pantalla sin elegir. */}
            <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3 sm:px-5">
              {[
                {
                  key: MEETING_DAYS.JUEVES,
                  label: "Reunión de Entre Semana",
                  n: totalEntreSemana,
                },
                {
                  key: MEETING_DAYS.SABADO,
                  label: "Reunión de Fin de Semana",
                  n: totalFinDeSemana,
                },
                {
                  key: "TODAS",
                  label: "Ver Todas las Reuniones",
                  n: todas.length,
                },
              ].map((b) => {
                const activo = vista === b.key;
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
            {vista === null ? (
              <EmptyState
                title="Elige qué reuniones ver"
                description={
                  todas.length === 0
                    ? "Todavía no hay ninguna reunión registrada. Crea la primera con el formulario de la izquierda."
                    : "Pulsa uno de los tres botones de arriba: las de entre semana, las de fin de semana, o todas juntas."
                }
              />
            ) : meetings.length === 0 ? (
              <EmptyState
                title={
                  filtro ? "Ninguna reunión de este tipo" : "Aún no hay reuniones"
                }
                description={
                  filtro
                    ? "No hay reuniones de este tipo registradas. Prueba con otro botón."
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
                    asignacionesPuestas = 0,
                    responsabilidades = 0,
                    responsabilidadesPuestas = 0;
                  for (const a of m.assignments) {
                    // Las responsabilidades se cuentan aparte de las
                    // asignaciones del programa de la reunión.
                    const esResponsabilidad =
                      a.section === "RESPONSABILIDADES" ||
                      a.section === "SAB_RESPONSABILIDADES" ||
                      MONTHLY_RESP_KEYS.includes(a.slotKey);
                    // Se cuentan las casillas y, aparte, las que ya tienen a
                    // alguien: el número de casillas solo decía cuántas
                    // existen, no cuánto trabajo quedaba hecho.
                    const puesta = !!(a.primaryName?.trim() || a.secondaryName?.trim());
                    if (esResponsabilidad) {
                      responsabilidades++;
                      if (puesta) responsabilidadesPuestas++;
                    } else {
                      asignaciones++;
                      if (puesta) asignacionesPuestas++;
                    }

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
                              Asignadas {asignacionesPuestas} de {asignaciones}
                              <span className="mx-1.5 text-border">·</span>
                              Responsabilidades {responsabilidadesPuestas} de{" "}
                              {responsabilidades}
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
