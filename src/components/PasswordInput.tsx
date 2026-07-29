"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

// Campo de contraseña con botón para mostrar/ocultar (funciona en PC y celular).
export function PasswordInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={show ? "text" : "password"}
        className={cn(
          "w-full rounded-xl border border-border bg-white py-2.5 pl-3.5 pr-12 text-sm text-foreground placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:bg-slate-50",
          className,
        )}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={show}
        title={show ? "Ocultar contraseña" : "Mostrar contraseña"}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted transition-colors hover:text-foreground focus:outline-none focus-visible:text-primary"
      >
        <span aria-hidden className="text-base">
          {show ? "🙈" : "👁️"}
        </span>
      </button>
    </div>
  );
}
