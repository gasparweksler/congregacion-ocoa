// ============================================================================
//  Página pública (sin sesión): el hermano abre el enlace que le mandaron por
//  WhatsApp y deja su disponibilidad como capitán de predicación.
//
//  El enlace solo sirve para eso. De aquí no se llega a ninguna pantalla de
//  administración, y no se enseña lo que han contestado los demás: la página
//  únicamente sabe de qué congregación y de qué mes es la encuesta.
// ============================================================================

import { BrandMark } from "@/components/BrandMark";
import { etiquetaDelMes } from "@/lib/capitanes";
import { getEncuestaPorToken } from "@/server/capitanes-actions";
import { RespuestaPublica } from "@/components/forms/RespuestaPublica";

export const dynamic = "force-dynamic";

function Shell({
  children,
  congregacion,
}: {
  children: React.ReactNode;
  congregacion?: string | null;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 text-white shadow">
            <BrandMark className="h-7 w-7" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate font-semibold tracking-tight text-foreground">
              {congregacion ?? "Mi Congregación"}
            </p>
            <p className="text-xs text-muted">Capitanes de predicación</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}

export default async function EncuestaCapitanesPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const encuesta = await getEncuestaPorToken(token);

  if (!encuesta) {
    return (
      <Shell>
        <h1 className="mb-2 text-lg font-semibold text-foreground">
          Este enlace no es válido
        </h1>
        <p className="text-sm text-muted">
          Puede que la encuesta se haya eliminado o que el enlace esté
          incompleto. Pide al Administrador que te envíe uno nuevo.
        </p>
      </Shell>
    );
  }

  if (!encuesta.open) {
    return (
      <Shell congregacion={encuesta.congregacion}>
        <h1 className="mb-2 text-lg font-semibold text-foreground">
          La encuesta de {etiquetaDelMes(encuesta.year, encuesta.month)} ya
          está cerrada
        </h1>
        <p className="text-sm text-muted">
          Ya no admite respuestas nuevas. Si necesitas cambiar tu
          disponibilidad, avisa al Administrador.
        </p>
      </Shell>
    );
  }

  return (
    <Shell congregacion={encuesta.congregacion}>
      <h1 className="text-lg font-semibold text-foreground">
        Disponibilidad para ser capitán
      </h1>
      <p className="mb-5 text-sm text-muted">
        Marca los días de {etiquetaDelMes(encuesta.year, encuesta.month)} en
        que puedes acompañar la predicación. Puedes volver a abrir este enlace
        más adelante para cambiar lo que pusiste.
      </p>
      <RespuestaPublica
        token={token}
        year={encuesta.year}
        month={encuesta.month}
        horarios={encuesta.horarios}
      />
    </Shell>
  );
}
