"use client";

// Los horarios que usa la congregación para salir a predicar. El
// Administrador los escribe una vez y salen en la encuesta para que cada
// hermano elija los suyos.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  agregarHorario,
  borrarHorario,
  renombrarHorario,
  type Horario,
} from "@/server/capitanes-actions";
import { Alert, Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { FormState } from "@/server/actions-shared";

export function HorariosCapitanes({ horarios }: { horarios: Horario[] }) {
  const router = useRouter();
  const [nuevo, setNuevo] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState<FormState>({});
  const [borrar, setBorrar] = useState<Horario | null>(null);
  const [trabajando, startTransition] = useTransition();

  const hacer = (quien: () => Promise<FormState>, despues?: () => void) => {
    setAviso({});
    startTransition(async () => {
      const r = await quien();
      setAviso(r);
      if (r.success) {
        despues?.();
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Agregar */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          placeholder="Por ejemplo: 9:00 a 11:00"
          className="w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-base text-foreground outline-none focus:border-primary sm:flex-1"
        />
        <Button
          onClick={() =>
            hacer(
              () => agregarHorario(nuevo),
              () => setNuevo(""),
            )
          }
          disabled={trabajando || nuevo.trim().length < 2}
        >
          {trabajando ? "Guardando…" : "Agregar horario"}
        </Button>
      </div>

      {aviso.error ? <Alert tone="error">{aviso.error}</Alert> : null}
      {aviso.success ? <Alert tone="success">{aviso.success}</Alert> : null}

      {/* Lista */}
      {horarios.length === 0 ? (
        <p className="text-sm text-muted">
          Todavía no hay horarios. Agrega los que use tu congregación: saldrán
          en la encuesta para que cada hermano elija.
        </p>
      ) : (
        <ul className="space-y-2">
          {horarios.map((h) => (
            <li
              key={h.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-white px-3 py-2"
            >
              {editando === h.id ? (
                <>
                  <input
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={() =>
                        hacer(
                          () => renombrarHorario(h.id, texto),
                          () => setEditando(null),
                        )
                      }
                      disabled={trabajando}
                      className="px-3 py-1.5"
                    >
                      Guardar
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setEditando(null)}
                      className="px-3 py-1.5"
                    >
                      Cancelar
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <span className="font-medium text-foreground">{h.label}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditando(h.id);
                        setTexto(h.label);
                        setAviso({});
                      }}
                      className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium text-foreground hover:bg-slate-50"
                    >
                      ✏️ Cambiar
                    </button>
                    <button
                      type="button"
                      onClick={() => setBorrar(h)}
                      className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      🗑️ Quitar
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={borrar !== null}
        title={`¿Quitar el horario "${borrar?.label ?? ""}"?`}
        description="Dejará de salir en la encuesta. Lo que ya contestaron los hermanos no cambia: sus días conservan el horario que eligieron."
        confirmLabel="Quitar horario"
        pendingLabel="Quitando…"
        pending={trabajando}
        onCancel={() => setBorrar(null)}
        onConfirm={() => {
          const id = borrar?.id;
          if (!id) return;
          hacer(
            () => borrarHorario(id),
            () => setBorrar(null),
          );
        }}
      />
    </div>
  );
}
