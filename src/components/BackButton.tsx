"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

// Botón "Volver" con estado de carga mientras navega a la página anterior.
export function BackButton({
  href,
  children = "← Volver",
}: {
  href: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => router.push(href))}
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? (
        <>
          <span
            aria-hidden
            className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
          />
          Volviendo…
        </>
      ) : (
        children
      )}
    </button>
  );
}
