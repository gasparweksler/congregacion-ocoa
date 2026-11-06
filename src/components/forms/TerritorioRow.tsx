"use client";

// Una fila de la lista de territorios: se edita ahí mismo, se sube y se baja
// de posición, y se entra a su detalle para ver el mapa y lo predicado.

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  updateTerritorioAction,
  deleteTerritorioAction,
  moverTerritorioAction,
} from "@/server/territorio-actions";
import { EMPTY_FORM_STATE, type FormState } from "@/server/actions-shared";
import { Input, Button, Badge, Td } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { formatDate } from "@/lib/dates";
import { tamanoLegible } from "@/lib/territorios";

export type TerritorioFilaDatos = {
  id: string;
  number: number;
  name: string;
  /** Si tiene mapa, lo que ocupa; si no, null. */
  mapaBytes: number | null;
  /** Última vez que se predicó, o null si nunca. */
  ultima: string | null;
  diasSinPredicar: number | null;
  veces: number;
  /** Para saber si se puede subir o bajar. */
  primero: boolean;
  ultimo: boolean;
};

/** Botón pequeño para subir o bajar el territorio. */
function BotonMover({
  id,
  direccion,
  disabled,
}: {
  id: string;
  direccion: "arriba" | "abajo";
  disabled: boolean;
}) {
  return (
    <form action={moverTerritorioAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="direccion" value={direccion} />
      <button
        type="submit"
        disabled={disabled}
        title={direccion === "arriba" ? "Subir" : "Bajar"}
        aria-label={direccion === "arriba" ? "Subir territorio" : "Bajar territorio"}
        className="rounded-md border border-border px-1.5 py-0.5 text-xs transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <span aria-hidden>{direccion === "arriba" ? "↑" : "↓"}</span>
      </button>
    </form>
  );
}

/** Cuánto tiempo lleva sin predicarse, dicho en palabras. */
function Antiguedad({
  dias,
  ultima,
}: {
  dias: number | null;
  ultima: string | null;
}) {
  if (dias === null || !ultima) {
    return <Badge tone="red">Nunca</Badge>;
  }
  const tono = dias >= 180 ? "red" : dias >= 90 ? "amber" : "green";
  const cuanto =
    dias === 0
      ? "hoy"
      : dias === 1
        ? "ayer"
        : dias < 60
          ? `hace ${dias} días`
          : `hace ${Math.round(dias / 30)} meses`;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm text-foreground">
        {formatDate(new Date(ultima))}
      </span>
      <Badge tone={tono}>{cuanto}</Badge>
    </div>
  );
}

export function TerritorioRow({ t }: { t: TerritorioFilaDatos }) {
  const [editando, setEditando] = useState(false);

  // Se cierra la edición dentro de la propia acción, al saber que guardó: así
  // no hace falta un efecto que vigile el resultado.
  const [state, action] = useActionState(
    async (previo: FormState, formData: FormData) => {
      const r = await updateTerritorioAction(previo, formData);
      if (r.success) setEditando(false);
      return r;
    },
    EMPTY_FORM_STATE,
  );

  if (editando) {
    return (
      <tr>
        <Td className="align-top" colSpan={6}>
          <form action={action} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={t.id} />
            <div>
              <label
                className="mb-1 block text-xs text-muted"
                htmlFor={`num-${t.id}`}
              >
                Número
              </label>
              <Input
                id={`num-${t.id}`}
                name="number"
                type="number"
                min={1}
                max={9999}
                defaultValue={t.number}
                required
                className="w-24"
                autoFocus
              />
            </div>
            <div className="min-w-[12rem] flex-1">
              <label
                className="mb-1 block text-xs text-muted"
                htmlFor={`nom-${t.id}`}
              >
                Nombre
              </label>
              <Input
                id={`nom-${t.id}`}
                name="name"
                defaultValue={t.name}
                required
                maxLength={120}
              />
            </div>
            <div className="flex gap-2">
              <SubmitButton pendingText="Guardando…">Guardar</SubmitButton>
              <Button variant="secondary" onClick={() => setEditando(false)}>
                Cancelar
              </Button>
            </div>
            {state.error ? (
              <p className="w-full text-xs text-red-600">{state.error}</p>
            ) : null}
          </form>
        </Td>
      </tr>
    );
  }

  return (
    <tr>
      <Td className="w-16 tabular-nums font-semibold text-foreground">
        {t.number}
      </Td>
      <Td className="font-medium">
        <Link
          href={`/territorios/${t.id}`}
          className="text-foreground underline-offset-2 hover:text-primary hover:underline"
        >
          {t.name}
        </Link>
      </Td>
      <Td>
        {t.mapaBytes === null ? (
          <Badge tone="slate">Sin mapa</Badge>
        ) : (
          <span className="text-xs text-muted">
            🗺️ {tamanoLegible(t.mapaBytes)}
          </span>
        )}
      </Td>
      <Td>
        <Antiguedad dias={t.diasSinPredicar} ultima={t.ultima} />
      </Td>
      <Td className="tabular-nums text-muted">{t.veces}</Td>
      <Td>
        <div className="flex items-center justify-end gap-1">
          <div className="mr-1 flex flex-col gap-0.5">
            <BotonMover id={t.id} direccion="arriba" disabled={t.primero} />
            <BotonMover id={t.id} direccion="abajo" disabled={t.ultimo} />
          </div>
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="rounded-md px-2.5 py-1 text-sm font-medium text-primary hover:bg-indigo-50"
          >
            Editar
          </button>
          <ConfirmButton
            action={deleteTerritorioAction}
            hidden={{ id: t.id }}
            confirmText={
              t.veces > 0
                ? `¿Eliminar el territorio "${t.number} - ${t.name}"? Se borrará también su mapa y sus ${t.veces} registro(s) de predicación.`
                : `¿Eliminar el territorio "${t.number} - ${t.name}"? Se borrará también su mapa.`
            }
          >
            Eliminar
          </ConfirmButton>
        </div>
      </Td>
    </tr>
  );
}
