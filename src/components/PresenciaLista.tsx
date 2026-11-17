// ============================================================================
//  Tarjeta de "quién está conectado" de UNA congregación: su luz (verde o
//  roja) y la lista de todos sus usuarios, con los conectados arriba.
//
//  Solo pinta: quién está conectado lo decide src/lib/presencia.ts.
// ============================================================================

import { roleLabel } from "@/lib/constants";
import { desdeCuando, estaConectado } from "@/lib/presencia";
import { Badge } from "@/components/ui";

export type UsuarioEnLista = {
  id: string;
  name: string | null;
  username: string;
  role: string;
  active: boolean;
  lastSeenAt: Date | string | null;
  lastActiveAt: Date | string | null;
};

export function PresenciaLista({
  titulo,
  subtitulo,
  enLinea,
  usuarios,
  ahora,
}: {
  titulo: string;
  subtitulo: string;
  enLinea: boolean;
  usuarios: UsuarioEnLista[];
  /** Una sola foto del reloj para toda la página. */
  ahora: Date;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-slate-800">{titulo}</p>
        <Badge tone={enLinea ? "green" : "red"}>
          {enLinea ? "🟢 En línea" : "🔴 Desconectada"}
        </Badge>
      </div>
      <p className="mt-0.5 text-xs text-muted">{subtitulo}</p>

      {usuarios.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No tiene usuarios todavía.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {usuarios.map((u) => {
            const conectado = u.active && estaConectado(u.lastSeenAt, ahora);
            return (
              <li
                key={u.id}
                className="flex items-start justify-between gap-3 py-1.5 text-sm"
              >
                <span className="min-w-0">
                  <span aria-hidden="true">{conectado ? "🟢" : "🔴"}</span>{" "}
                  <span className={conectado ? "font-medium" : ""}>
                    {u.name ?? u.username}
                  </span>
                  <span className="block text-xs text-muted">
                    {roleLabel(u.role)}
                    {u.active ? "" : " · usuario inactivo"}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs text-muted">
                  {conectado ? (
                    <span className="text-emerald-600">Conectado ahora</span>
                  ) : (
                    desdeCuando(u.lastActiveAt, ahora)
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
