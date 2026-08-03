"use client";

import { useState, useTransition } from "react";
import {
  confirmAssignmentAction,
  resetConfirmationAction,
} from "@/server/meeting-actions";
import { Badge } from "@/components/ui";
import { CONFIRM_STATUS } from "@/lib/constants";

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
  dayLabel,
  dateLabel,
  items,
}: {
  dayLabel: string;
  dateLabel: string;
  items: RespItem[];
}) {
  const [, startTransition] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);
  // Estado local para reflejar Confirmar/Resetear al instante.
  const [statuses, setStatuses] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((it) => [it.key, it.status])),
  );

  const buildMessage = (name: string, label: string, token: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
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

  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
        🔒 Las responsabilidades se administran desde{" "}
        <strong>“Todas las Responsabilidades del mes”</strong>. Aquí solo se
        consultan y se envían los recordatorios.
      </p>
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
    </div>
  );
}
