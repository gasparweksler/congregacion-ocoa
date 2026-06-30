import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CONFIRM_STATUS, meetingDayLabel } from "@/lib/constants";
import { formatDate } from "@/lib/dates";

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
        <div
          className={
            "mt-4 rounded-xl px-4 py-3 text-sm font-medium " +
            (confirmed
              ? "bg-emerald-50 text-emerald-800"
              : "bg-red-50 text-red-800")
          }
        >
          {confirmed
            ? "✅ ¡Gracias! Registramos tu confirmación."
            : "❌ Registramos que no podrás. Se buscará un reemplazo."}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">
          ¿Puedes encargarte de esta asignación?
        </p>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <Link
          href={`/confirmar/${token}?r=si`}
          className={
            "flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors " +
            (confirmed
              ? "bg-emerald-600 text-white"
              : "border border-emerald-600 text-emerald-700 hover:bg-emerald-50")
          }
        >
          ✅ Sí, confirmo
        </Link>
        <Link
          href={`/confirmar/${token}?r=no`}
          className={
            "flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors " +
            (rejected
              ? "bg-red-600 text-white"
              : "border border-red-300 text-red-700 hover:bg-red-50")
          }
        >
          ❌ No podré, necesito reemplazo
        </Link>
      </div>

      <p className="mt-4 text-center text-xs text-muted">
        Puedes cambiar tu respuesta tocando la otra opción.
      </p>
    </Shell>
  );
}
