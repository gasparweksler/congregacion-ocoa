"use client";

import { useState, useTransition } from "react";
import { appOrigin } from "@/lib/app-url";
import {
  confirmAssignmentAction,
  resetConfirmationAction,
  deleteMeetingResponsibilitiesAction,
} from "@/server/meeting-actions";
import { Alert, Badge } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LoadingLinkButton } from "@/components/LoadingLinkButton";
import { CONFIRM_STATUS } from "@/lib/constants";
import type { FormState } from "@/server/actions-shared";

export type RespItem = {
  key: string;
  label: string;
  kind: "publisher" | "group";
  assignmentId: string | null;
  name: string;
  token: string | null;
  status: string;
};

function StatusBadge({ status }: { status: string }) {
  if (status === CONFIRM_STATUS.CONFIRMADO)
    return <Badge tone="green">✅ Confirmado</Badge>;
  if (status === CONFIRM_STATUS.RECHAZADO)
    return <Badge tone="red">❌ Rechazado</Badge>;
  return <Badge tone="amber">⏳ Pendiente</Badge>;
}

export function MeetingResponsibilities({
  meetingId,
  dayLabel,
  dateLabel,
  respMonthHref,
  items,
}: {
  /** La reunión que se está viendo, para poder vaciar sus responsabilidades. */
  meetingId: string;
  dayLabel: string;
  dateLabel: string;
  /** "Todas las Responsabilidades del mes", ya en el mes de esta reunión. */
  respMonthHref: string;
  items: RespItem[];
}) {
  const [, startTransition] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);
  // Vaciar las responsabilidades de esta reunión.
  const [abrirBorrar, setAbrirBorrar] = useState(false);
  const [borrando, empezarBorrado] = useTransition();
  const [aviso, setAviso] = useState<FormState>({});
  // Estado local para reflejar Confirmar/Resetear al instante.
  const [statuses, setStatuses] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((it) => [it.key, it.status])),
  );

  const buildMessage = (name: string, label: string, token: string) => {
    const origin = appOrigin();
    const cp = String.fromCodePoint;
    const E = {
      hug: cp(0x1f917), cal: cp(0x1f4c5), clip: cp(0x1f4cb),
      pray: cp(0x1f64f), smile: cp(0x1f60a), point: cp(0x1f449),
    };
    return (
      `Hola querido Hermano/a *${name}* ${E.hug}\n\n` +
      `Le comento que para la reunión del día ${E.cal} *${dayLabel} ${dateLabel}* ` +
      `tiene la siguiente responsabilidad: ${E.clip} *${label}*.\n\n` +
      `Por favor, haga click en el siguiente enlace para confirmar o rechazar. ` +
      `¡Muchísimas gracias! ${E.pray}${E.smile}\n\n` +
      `${E.point} ${origin}/confirmar/${token}`
    );
  };

  const copyMsg = async (key: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      /* ignore */
    }
  };

  const confirmNow = (it: RespItem) => {
    if (!it.assignmentId) return;
    setStatuses((s) => ({ ...s, [it.key]: CONFIRM_STATUS.CONFIRMADO }));
    startTransition(() => {
      void confirmAssignmentAction(it.assignmentId!, "p");
    });
  };
  const resetNow = (it: RespItem) => {
    if (!it.assignmentId) return;
    if (!window.confirm("¿Resetear esta confirmación a Pendiente?")) return;
    setStatuses((s) => ({ ...s, [it.key]: CONFIRM_STATUS.PENDIENTE }));
    startTransition(() => {
      void resetConfirmationAction(it.assignmentId!, "p");
    });
  };

  // Vaciar las responsabilidades de ESTA reunión. No es un formulario: este
  // bloque vive dentro del formulario de la reunión, y un formulario dentro de
  // otro no es HTML válido. Se llama a la acción directamente.
  const borrarTodas = () => {
    empezarBorrado(async () => {
      const r = await deleteMeetingResponsibilitiesAction(meetingId);
      setAviso(r);
      setAbrirBorrar(false);
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-blue-50 px-3 py-2.5 text-xs text-blue-800">
        <p>
          🔒 Las responsabilidades se administran desde{" "}
          <strong>“Todas las Responsabilidades del mes”</strong>. Aquí solo se
          consultan y se envían los recordatorios.
        </p>
        {/* El atajo lleva ya al mes de esta reunión, no al mes de hoy. */}
        <LoadingLinkButton
          href={respMonthHref}
          className="mt-2 w-full px-3 py-2 text-xs sm:w-auto"
        >
          📋 Ir a Todas las Responsabilidades del mes
        </LoadingLinkButton>
      </div>

      {aviso.error ? <Alert tone="error">{aviso.error}</Alert> : null}
      {aviso.success ? <Alert tone="success">{aviso.success}</Alert> : null}
      {items.map((it) => {
        const status = statuses[it.key] ?? it.status;
        const canSend =
          it.kind === "publisher" && it.name.trim().length > 0 && !!it.token;
        const msg = canSend
          ? buildMessage(it.name.trim(), it.label, it.token!)
          : "";
        return (
          <div
            key={it.key}
            className="rounded-xl border border-border p-3 sm:p-4"
          >
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">
                {it.label}
              </span>
              {it.kind === "publisher" && it.name.trim() ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={status} />
                  {status === CONFIRM_STATUS.PENDIENTE ? (
                    <button
                      type="button"
                      onClick={() => confirmNow(it)}
                      aria-label="Confirmar esta responsabilidad"
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-600 bg-emerald-50 px-2 py-0.5 text-[0.7rem] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                    >
                      ✅ Confirmar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => resetNow(it)}
                      aria-label="Resetear a Pendiente"
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 text-[0.7rem] font-medium text-muted transition-colors hover:bg-slate-50 hover:text-foreground"
                    >
                      ↺ Resetear
                    </button>
                  )}
                </div>
              ) : null}
            </div>
            <p className="text-sm text-foreground">
              {it.name.trim() ? (
                it.name
              ) : (
                <span className="text-muted">— Sin asignar —</span>
              )}
            </p>
            {canSend ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(msg)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
                >
                  📲 WhatsApp
                </a>
                <button
                  type="button"
                  onClick={() => copyMsg(it.key, msg)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-slate-50"
                >
                  {copied === it.key ? "✓ Copiado" : "Copiar texto"}
                </button>
              </div>
            ) : null}
          </div>
        );
      })}

      {/* Vaciar de una vez las responsabilidades de esta reunión, cuando el
          reparto del día se quiere rehacer desde cero. */}
      <div className="border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setAbrirBorrar(true)}
          disabled={borrando}
          className="w-full rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
        >
          🗑️ Eliminar todas las responsabilidades de esta reunión
        </button>
        <ConfirmDialog
          open={abrirBorrar}
          title="¿Estás seguro de que deseas eliminar todas las responsabilidades de esta reunión?"
          description="Para volver a agregarlas, deberás hacerlo desde la sección «Todas las Responsabilidades del mes». Solo se vacía esta reunión: las demás y el programa del mes no se tocan."
          confirmLabel="Confirmar eliminación"
          pendingLabel="Eliminando…"
          pending={borrando}
          onCancel={() => setAbrirBorrar(false)}
          onConfirm={borrarTodas}
        />
      </div>
    </div>
  );
}
