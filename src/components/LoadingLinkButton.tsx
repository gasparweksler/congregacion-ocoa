"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-white shadow-sm hover:bg-[var(--primary-hover)]",
  secondary: "bg-white text-foreground border border-border hover:bg-slate-50",
};

// Botón de navegación que muestra un spinner mientras carga la sección destino.
export function LoadingLinkButton({
  href,
  variant = "primary",
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      onClick={() => startTransition(() => router.push(href))}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-wait",
        variants[variant],
        className,
      )}
    >
      {pending ? (
        <>
          <span
            aria-hidden
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          Cargando…
        </>
      ) : (
        children
      )}
    </button>
  );
}
