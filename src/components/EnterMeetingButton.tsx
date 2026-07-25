"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

// Botón para entrar a una reunión con un pequeño mensaje de carga mientras
// se navega (igual que pulsar sobre el nombre de la reunión).
export function EnterMeetingButton({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(() => {
          router.push(`/reuniones/${meetingId}`);
        })
      }
      className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--primary-hover)] disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? (
        <>
          <span
            aria-hidden
            className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
          />
          Entrando…
        </>
      ) : (
        <>➡️ Entrar a la reunión</>
      )}
    </button>
  );
}
