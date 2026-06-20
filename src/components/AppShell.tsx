"use client";

// ============================================================================
//  Estructura visual de la aplicación autenticada
//  - Barra lateral de marca (teal) en escritorio, menú desplegable en móvil.
//  - Cabecera con nombre del usuario, rol y cierre de sesión.
//  Estilo limpio y espacioso inspirado en jw.org (identidad propia en teal).
// ============================================================================

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { logoutAction } from "@/server/auth-actions";

export type NavItem = { href: string; label: string; icon: string };

export function AppShell({
  user,
  navItems,
  children,
}: {
  user: { name: string; roleLabel: string; groupName?: string | null };
  navItems: NavItem[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const nav = (
    <nav className="flex flex-col gap-1">
      <p className="px-3 pb-2 pt-1 text-[0.7rem] font-semibold uppercase tracking-wider text-white/40">
        Menú
      </p>
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setOpen(false)}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            isActive(item.href)
              ? "bg-white text-brand shadow-sm"
              : "text-white/75 hover:bg-white/10 hover:text-white",
          )}
        >
          <span aria-hidden className="w-5 text-center text-base">
            {item.icon}
          </span>
          {item.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* --- Barra lateral (escritorio) --- */}
      <aside className="hidden w-64 shrink-0 flex-col bg-gradient-to-b from-brand to-brand-2 px-4 py-6 lg:flex">
        <Brand />
        <div className="mt-8 flex-1">{nav}</div>
        <UserBox user={user} />
      </aside>

      {/* --- Cabecera móvil --- */}
      <header className="sticky top-0 z-20 flex items-center justify-between bg-gradient-to-r from-brand to-brand-2 px-4 py-3 shadow-md lg:hidden">
        <Brand />
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

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/95 text-lg font-bold text-brand shadow-sm">
        O
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold tracking-tight text-white">
          Congregación Ocoa
        </p>
        <p className="text-xs text-white/60">Actividad de Publicadores</p>
      </div>
    </div>
  );
}

function UserBox({
  user,
}: {
  user: { name: string; roleLabel: string; groupName?: string | null };
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3.5">
      <p className="truncate text-sm font-semibold text-white">{user.name}</p>
      <p className="text-xs text-white/60">{user.roleLabel}</p>
      {user.groupName ? (
        <p className="text-xs text-white/60">{user.groupName}</p>
      ) : null}
      <form action={logoutAction} className="mt-3">
        <button
          type="submit"
          className="w-full rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/20"
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
