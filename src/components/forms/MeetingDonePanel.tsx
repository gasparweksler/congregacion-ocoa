"use client";

// ============================================================================
//  Registro de qué asignaciones se REALIZARON en una reunión.
//  Va aparte del editor de asignaciones a propósito: así no interfiere con el
//  guardado del programa ni con el aviso de edición simultánea.
//
//  Tres estados por hermano: sin registrar (como nace), realizada y no
//  realizada. Cada cambio se guarda al momento.
// ============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { MEETING_SECTION_LABELS } from "@/lib/constants";
import {
  setAssignmentDoneAction,
  markMeetingDoneAction,
} from "@/server/meeting-actions";

export type DoneItem = {
  assignmentId: string;
  section: string;
  label: string;
  who: "p" | "s";
  name: string;
  roleLabel: string;
  done: boolean | null;
};

export function MeetingDonePanel({
  meetingId,
  items,
}: {
  meetingId: string;
  items: DoneItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Se refleja el cambio al momento y se guarda detrás.
  const [local, setLocal] = useState<Record<string, boolean | null>>(() =>
    Object.fromEntries(items.map((i) => [`${i.assignmentId}_${i.who}`, i.done])),
  );

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted">
        Esta reunión todavía no tiene hermanos asignados.
      </p>
    );
  }

  const set = (it: DoneItem, value: boolean | null) => {
    const k = `${it.assignmentId}_${it.who}`;
    setLocal((prev) => ({ ...prev, [k]: value }));
    startTransition(async () => {
      await setAssignmentDoneAction(it.assignmentId, it.who, value);
      router.refresh();
    });
  };

  const sinRegistrar = items.filter(
    (i) => local[`${i.assignmentId}_${i.who}`] === null,
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form action={markMeetingDoneAction}>
          <input type="hidden" name="meetingId" value={meetingId} />
          <Button type="submit" variant="primary" disabled={sinRegistrar === 0}>
            ✅ Marcar reunión como realizada
          </Button>
        </form>
        <span className="text-sm text-muted">
          {sinRegistrar === 0
            ? "Todas las asignaciones tienen registro."
            : `${sinRegistrar} sin registrar. El botón solo marca esas; lo que ya corregiste a mano no se toca.`}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {items.map((it) => {
              const k = `${it.assignmentId}_${it.who}`;
              const v = local[k];
              return (
                <tr key={k} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2">
                    <span className="font-medium text-foreground">{it.name}</span>
                    <span className="block text-xs text-muted">
                      {MEETING_SECTION_LABELS[it.section] ?? it.section} ·{" "}
                      {it.label} · {it.roleLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-1">
                      {(
                        [
                          [true, "Realizada", "bg-emerald-600"],
                          [false, "No realizada", "bg-red-600"],
                          [null, "Sin registrar", "bg-slate-500"],
                        ] as const
                      ).map(([value, texto, activo]) => (
                        <button
                          key={texto}
                          type="button"
                          disabled={pending}
                          onClick={() => set(it, value)}
                          aria-pressed={v === value}
                          className={cn(
                            "rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-60",
                            v === value
                              ? `${activo} text-white`
                              : "border border-border text-muted hover:bg-slate-50",
                          )}
                        >
                          {texto}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
