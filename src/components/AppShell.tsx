"use client";

// ============================================================================
//  Estructura visual de la aplicación autenticada
//  - Barra lateral de marca (teal) en escritorio, menú desplegable en móvil.
//  - Cabecera con nombre del usuario, rol y cierre de sesión.
//  Estilo limpio y espacioso inspirado en jw.org (identidad propia en teal).
// ============================================================================

import { Fragment, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { logoutAction } from "@/server/auth-actions";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Encabezado bajo el que se agrupa en el menú (p. ej. "Reuniones"). */
  group?: string;
};

export function AppShell({
  user,
  navItems,
  children,
}: {
  user: {
    name: string;
    roleLabel: string;
    groupName?: string | null;
    /** Nombre de la congregación del usuario (nulo para el Superadmin). */
    congregationName?: string | null;
  };
  navItems: NavItem[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Sección a la que se está navegando (para mostrar su spinner de carga).
  const [navTarget, setNavTarget] = useState<string | null>(null);

  // Al terminar la transición de navegación, limpiar el indicador. Se ajusta
  // durante el render (no en un efecto) para no encadenar un repintado extra.
  if (!isPending && navTarget) setNavTarget(null);

  /**
   * Una sección está activa si es la ruta actual, o si la contiene y ninguna
   * otra entrada del menú encaja mejor. Sin esto, estando en
   * /reuniones/estadisticas se marcarían las dos entradas de Reuniones.
   */
  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (!pathname.startsWith(href + "/")) return false;
    return !navItems.some(
      (o) =>
        o.href !== href &&
        o.href.length > href.length &&
        (pathname === o.href || pathname.startsWith(o.href + "/")),
    );
  };

  const go = (href: string) => {
    setOpen(false);
    if (href === pathname) return;
    setNavTarget(href);
    startTransition(() => router.push(href));
  };

  const nav = (
    <nav className="flex flex-col gap-1">
      {navItems.map((item, i) => {
        const loading = navTarget === item.href;
        // Encabezado cuando empieza un grupo nuevo: con 13 entradas seguidas
        // cuesta encontrar nada, sobre todo en el móvil.
        const nuevoGrupo = item.group && item.group !== navItems[i - 1]?.group;
        return (
          <Fragment key={item.href}>
            {nuevoGrupo ? (
              <p
                className={cn(
                  "px-3 pb-1 text-[0.7rem] font-semibold uppercase tracking-wider text-white/40",
                  i === 0 ? "pt-1" : "pt-3",
                )}
              >
                {item.group}
              </p>
            ) : null}
          <button
            type="button"
            onClick={() => go(item.href)}
            aria-busy={loading}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
              isActive(item.href)
                ? "bg-white text-brand shadow-sm"
                : "text-white/75 hover:bg-white/10 hover:text-white",
            )}
          >
            <span aria-hidden className="flex w-5 items-center justify-center text-base">
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                item.icon
              )}
            </span>
            {item.label}
            {loading ? (
              <span className="ml-auto text-[0.7rem] font-normal opacity-70">
                Cargando…
              </span>
            ) : null}
          </button>
          </Fragment>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* --- Barra lateral (escritorio) --- */}
      <aside className="hidden w-64 shrink-0 flex-col bg-gradient-to-b from-brand to-brand-2 px-4 py-6 lg:flex">
        <Brand congregationName={user.congregationName} />
        {/* Apariencia y usuario van justo debajo del menú (antes quedaban
            pegados al fondo de la pantalla). El hueco sobrante va al final. */}
        <div className="mt-8">{nav}</div>
        <ThemeToggle />
        <UserBox user={user} />
        <div className="flex-1" />
      </aside>

      {/* --- Cabecera móvil --- */}
      <header className="sticky top-0 z-20 flex items-center justify-between bg-gradient-to-r from-brand to-brand-2 px-4 py-3 shadow-md lg:hidden">
        <Brand congregationName={user.congregationName} />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Abrir menú"
          className="rounded-lg p-2 text-white hover:bg-white/10"
        >
          <span className="text-xl">{open ? "✕" : "☰"}</span>
        </button>
      </header>

      {/* --- Menú móvil desplegable --- */}
      {open ? (
        <div className="bg-brand px-4 pb-5 pt-2 shadow-lg lg:hidden">
          {nav}
          <ThemeToggle />
          <div className="mt-4">
            <UserBox user={user} />
          </div>
        </div>
      ) : null}

      {/* --- Contenido --- */}
      <main className="flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

function Brand({ congregationName }: { congregationName?: string | null }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/95 text-brand shadow-sm">
        <BrandMark className="h-7 w-7" />
      </div>
      <div className="min-w-0 leading-tight">
        {/* Se muestra la congregación del usuario. El Superadmin no tiene una
            propia, así que para él dice "Plataforma". */}
        <p className="truncate text-sm font-semibold tracking-tight text-white">
          {congregationName ?? "Plataforma"}
        </p>
        <p className="text-xs text-white/60">Actividad de mi Congregación</p>
      </div>
    </div>
  );
}

/** Cerrar sesión avisa mientras tanto: el botón no se puede repulsar. */
function LogoutButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/20 disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? (
        <>
          <span
            aria-hidden
            className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          Cerrando sesión…
        </>
      ) : (
        "Cerrar sesión"
      )}
    </button>
  );
}

function UserBox({
  user,
}: {
  user: {
    name: string;
    roleLabel: string;
    groupName?: string | null;
    /** Nombre de la congregación del usuario (nulo para el Superadmin). */
    congregationName?: string | null;
  };
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3.5">
      <p className="truncate text-sm font-semibold text-white">{user.name}</p>
      <p className="text-xs text-white/60">{user.roleLabel}</p>
      {user.groupName ? (
        <p className="text-xs text-white/60">{user.groupName}</p>
      ) : null}
      <form action={logoutAction} className="mt-3">
        <LogoutButton />
      </form>
    </div>
  );
}
