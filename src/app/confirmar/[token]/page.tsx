import { prisma } from "@/lib/prisma";
import { CONFIRM_STATUS, meetingDayLabel } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { ConfirmAnswerButtons } from "@/components/ConfirmAnswerButtons";

// Página pública (sin sesión): el hermano abre el enlace de WhatsApp y aquí se
// registra su respuesta (Sí confirmo / No podré).
export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 text-xl font-bold text-white shadow">
            O
          </div>
          <div className="leading-tight">
            <p className="font-semibold tracking-tight text-foreground">
              Congregación Ocoa
            </p>
            <p className="text-xs text-muted">Confirmación de asignación</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}

export default async function ConfirmarPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ r?: string }>;
}) {
  const { token } = await params;
  const { r } = await searchParams;

  const assignment = await prisma.meetingAssignment.findFirst({
    where: { OR: [{ primaryToken: token }, { secondaryToken: token }] },
    include: { meeting: true },
  });

  if (!assignment) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-foreground">
          Enlace no válido
        </h1>
        <p className="mt-2 text-sm text-muted">
          Este enlace de confirmación no existe o fue actualizado. Pide al
          responsable que te envíe el mensaje nuevamente.
        </p>
      </Shell>
    );
  }

  const isPrimary = assignment.primaryToken === token;
  const name = (isPrimary ? assignment.primaryName : assignment.secondaryName) ?? "Hermano";

  // Registrar la respuesta si viene en el enlace.
  let status = isPrimary ? assignment.primaryStatus : assignment.secondaryStatus;
  if (r === "si" || r === "no") {
    status =
      r === "si" ? CONFIRM_STATUS.CONFIRMADO : CONFIRM_STATUS.RECHAZADO;
    await prisma.meetingAssignment.update({
      where: { id: assignment.id },
      data: isPrimary
        ? { primaryStatus: status }
        : { secondaryStatus: status },
    });
  }

  const confirmed = status === CONFIRM_STATUS.CONFIRMADO;
  const rejected = status === CONFIRM_STATUS.RECHAZADO;
  const answered = confirmed || rejected;

  return (
    <Shell>
      <h1 className="text-lg font-semibold text-foreground">
        Hola, {name}
      </h1>
      <div className="mt-3 rounded-xl border border-border bg-slate-50 px-4 py-3 text-sm">
        <p className="font-medium text-foreground">{assignment.label}</p>
        <p className="mt-0.5 text-muted">
          {meetingDayLabel(assignment.meeting.day)} ·{" "}
          {formatDate(assignment.meeting.date)}
        </p>
        {assignment.note ? (
          <p className="mt-1 text-muted">Nota: {assignment.note}</p>
        ) : null}
      </div>

      {answered ? (
        // Ya respondió: se muestra SOLO el estado registrado + agradecimiento,
        // sin los botones, para evitar respuestas duplicadas o repetidas.
        <>
          <div
            className={
              "mt-4 rounded-xl px-4 py-4 text-center " +
              (confirmed
                ? "bg-emerald-50 text-emerald-800"
                : "bg-red-50 text-red-800")
            }
          >
            <p className="text-3xl">{confirmed ? "✅" : "📝"}</p>
            <p className="mt-1 text-base font-semibold">
              {confirmed ? "¡Gracias! Tu confirmación fue recibida." : "¡Gracias! Tu respuesta fue recibida."}
            </p>
            <p className="mt-1 text-sm">
              {confirmed
                ? "Quedaste confirmado para esta asignación."
                : "Registramos que no podrás. Se buscará un reemplazo."}
            </p>
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 text-sm">
            <span className="text-muted">Estado registrado:</span>
            <span
              className={
                "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold " +
                (confirmed
                  ? "bg-emerald-600 text-white"
                  : "bg-red-600 text-white")
              }
            >
              {confirmed ? "✅ Confirmado" : "❌ Rechazado"}
            </span>
          </div>
          <p className="mt-4 text-center text-xs text-muted">
            Tu respuesta ya quedó guardada. Si necesitas modificarla, comunícate
            con el responsable de confirmaciones.
          </p>
        </>
      ) : (
        // Aún pendiente: se muestran los botones para responder por primera vez.
        <>
          <p className="mt-4 text-sm text-muted">
            ¿Puedes encargarte de esta asignación?
          </p>
          <ConfirmAnswerButtons token={token} />
        </>
      )}
    </Shell>
  );
}
