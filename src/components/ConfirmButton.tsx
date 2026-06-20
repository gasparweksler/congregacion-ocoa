"use client";

// Botón que ejecuta una Server Action dentro de un <form>, pidiendo
// confirmación antes de enviar. Útil para acciones destructivas (eliminar).
import { cn } from "@/lib/cn";

export function ConfirmButton({
  action,
  hidden,
  confirmText,
  children,
  className,
  variant = "danger",
}: {
  action: (formData: FormData) => void | Promise<void>;
  hidden?: Record<string, string>;
  confirmText: string;
  children: React.ReactNode;
  className?: string;
  variant?: "danger" | "secondary";
}) {
  const styles =
    variant === "danger"
      ? "text-red-600 hover:bg-red-50"
      : "text-slate-600 hover:bg-slate-100";
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
      className="inline"
    >
      {hidden
        ? Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))
        : null}
      <button
        type="submit"
        className={cn(
          "rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
          styles,
          className,
        )}
      >
        {children}
      </button>
    </form>
  );
}
