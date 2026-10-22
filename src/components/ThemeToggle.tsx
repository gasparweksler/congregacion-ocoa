"use client";

// ============================================================================
//  Interruptor de apariencia (Claro / Oscuro / Automático), en el menú lateral.
//  Guarda la elección en el navegador y la aplica poniendo data-theme="dark"
//  en <html>; el tema real lo define la paleta de globals.css.
//  "Automático" sigue la configuración del sistema operativo.
// ============================================================================

import { useEffect, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

export type Theme = "claro" | "oscuro" | "auto";

export const THEME_KEY = "ocoa-tema";
const CHANGED = "ocoa-tema-cambiado";

const OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: "claro", label: "Claro", icon: "☀️" },
  { value: "oscuro", label: "Oscuro", icon: "🌙" },
  { value: "auto", label: "Auto", icon: "🖥️" },
];

const isTheme = (v: unknown): v is Theme =>
  v === "claro" || v === "oscuro" || v === "auto";

/** Aplica el tema al documento. Debe coincidir con el script del layout. */
function apply(theme: Theme): void {
  const dark =
    theme === "oscuro" ||
    (theme === "auto" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

// La preferencia vive en localStorage (fuera de React): se lee con
// useSyncExternalStore para no tener que sincronizarla con un efecto.
function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange); // otra pestaña
  window.addEventListener(CHANGED, onChange); // esta pestaña
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

function getSnapshot(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    return isTheme(saved) ? saved : "claro";
  } catch {
    return "claro";
  }
}

// En el servidor no hay preferencia: se asume claro (el script del layout ya
// pintó el tema correcto antes de que React hidrate, así que no hay destello).
const getServerSnapshot = (): Theme => "claro";

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // En modo automático hay que reaccionar si el sistema cambia de tema.
  useEffect(() => {
    if (theme !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("auto");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const choose = (value: Theme) => {
    try {
      window.localStorage.setItem(THEME_KEY, value);
    } catch {
      // Navegación privada o almacenamiento bloqueado: se aplica igual, solo
      // que no se recordará la próxima vez.
    }
    apply(value);
    window.dispatchEvent(new Event(CHANGED));
  };

  return (
    <div className="mt-6 mb-4">
      <p className="px-3 pb-2 text-[0.7rem] font-semibold uppercase tracking-wider text-white/40">
        Apariencia
      </p>
      <div
        role="group"
        aria-label="Apariencia del sitio"
        className="flex gap-1 rounded-lg bg-white/5 p-1"
      >
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => choose(o.value)}
            aria-pressed={theme === o.value}
            title={`Apariencia: ${o.label}`}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              theme === o.value
                ? "bg-white text-brand shadow-sm"
                : "text-white/70 hover:bg-white/10 hover:text-white",
            )}
          >
            <span aria-hidden>{o.icon}</span>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
