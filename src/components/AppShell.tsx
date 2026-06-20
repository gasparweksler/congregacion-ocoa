"use client";

// ============================================================================
//  Estructura visual de la aplicación autenticada
//  - Barra lateral en escritorio, menú desplegable en móvil.
//  - Cabecera con nombre del usuario, rol y cierre de sesión.
//  Recibe los datos ya calculados desde el layout de servidor.
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
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setOpen(false)}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isActive(item.href)
              ? "bg-primary text-white"
              : "text-slate-200 hover:bg-white/10",
          )}
        >
          <span aria-hidden className="w-5 text-center">
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
      <aside className="hidden w-64 shrink-0 flex-col bg-slate-900 px-4 py-5 lg:flex">
        <Brand />
        <div className="mt-6 flex-1">{nav}</div>
        <UserBox user={user} />
      </aside>

      {/* --- Cabecera móvil --- */}
      <header className="flex items-center justify-between bg-slate-900 px-4 py-3 lg:hidden">
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
        <div className="bg-slate-900 px-4 pb-4 lg:hidden">
          {nav}
          <div className="mt-4">
            <UserBox user={user} />
          </div>
        </div>
      ) : null}

      {/* --- Contenido --- */}
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-lg font-bold text-white">
        O
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-white">Ocoa</p>
        <p className="text-xs text-slate-400">Actividad de Publicadores</p>
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
    <div className="rounded-lg bg-white/5 p-3">
      <p className="truncate text-sm font-medium text-white">{user.name}</p>
      <p className="text-xs text-slate-400">{user.roleLabel}</p>
      {user.groupName ? (
        <p className="text-xs text-slate-400">{user.groupName}</p>
      ) : null}
      <form action={logoutAction} className="mt-2">
        <button
          type="submit"
          className="w-full rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
