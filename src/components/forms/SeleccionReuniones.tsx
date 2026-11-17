"use client";

// Selección múltiple de reuniones: una casilla a la izquierda de cada una y,
// arriba, un botón que elimina SOLO las marcadas.
//
// Cómo encaja con el resto: la lista la sigue pintando el servidor (con sus
// enlaces, su desplegable de responsable y su botón de eliminar una sola).
// Aquí solo se envuelve: este componente lleva la cuenta de lo marcado y pone
// la casilla delante de cada fila, que llega como children. Así no hubo que
// convertir la lista entera en código de navegador.
//
// La confirmación es la de siempre (DeleteMeetingButton), con su casilla de
// "guardar el historial": eliminar varias a la vez no cambia esa decisión.

import { createContext, useContext, useMemo, useState } from "react";
import { DeleteMeetingButton } from "@/components/DeleteMeetingButton";

type Seleccion = {
  marcadas: Set<string>;
  alternar: (id: string) => void;
};

const Contexto = createContext<Seleccion | null>(null);

export function SeleccionReuniones({
  ids,
  dia,
  action,
  children,
}: {
  /** Todas las reuniones que se están viendo, en el orden en que se pintan. */
  ids: string[];
  /** La vista actual, para volver a ella después de borrar. */
  dia: string;
  action: (formData: FormData) => void | Promise<void>;
  children: React.ReactNode;
}) {
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());

  // Si cambia la lista (otra vista, o se borró algo), se olvidan las marcas
  // que ya no existen: nunca se envía el id de algo que no se está viendo.
  const visibles = useMemo(() => new Set(ids), [ids]);
  const elegidas = useMemo(
    () => ids.filter((id) => marcadas.has(id)),
    [ids, marcadas],
  );

  const valor = useMemo<Seleccion>(
    () => ({
      marcadas,
      alternar: (id: string) =>
        setMarcadas((previas) => {
          const nuevas = new Set(previas);
          if (nuevas.has(id)) nuevas.delete(id);
          else nuevas.add(id);
          // De paso se limpian las que ya no están a la vista.
          for (const x of nuevas) if (!visibles.has(x)) nuevas.delete(x);
          return nuevas;
        }),
    }),
    [marcadas, visibles],
  );

  const todas = elegidas.length > 0 && elegidas.length === ids.length;

  return (
    <Contexto.Provider value={valor}>
      {/* La barra solo aparece cuando hay algo marcado: con la lista limpia
          no estorba ni invita a borrar sin querer. */}
      {elegidas.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-amber-50/60 px-4 py-2.5 sm:px-5">
          <p className="text-sm font-medium text-foreground">
            {elegidas.length} reunión(es) seleccionada(s)
            <button
              type="button"
              onClick={() => setMarcadas(new Set())}
              className="ml-2 rounded-md px-2 py-0.5 text-xs font-semibold text-primary transition-colors hover:bg-indigo-50"
            >
              Quitar selección
            </button>
            {!todas ? (
              <button
                type="button"
                onClick={() => setMarcadas(new Set(ids))}
                className="ml-1 rounded-md px-2 py-0.5 text-xs font-semibold text-primary transition-colors hover:bg-indigo-50"
              >
                Seleccionar las {ids.length}
              </button>
            ) : null}
          </p>
          <DeleteMeetingButton
            action={action}
            hidden={{ ids: elegidas.join(","), dia }}
            title={`Eliminar ${elegidas.length} reunión(es) seleccionada(s)`}
            description={`Se eliminarán únicamente las ${elegidas.length} reunión(es) que marcaste, con sus asignaciones y sus enlaces de confirmación. Las demás no se tocan. Las reuniones no se pueden recuperar.`}
            className="border border-red-200 bg-white"
          >
            🗑️ Eliminar reuniones seleccionadas ({elegidas.length})
          </DeleteMeetingButton>
        </div>
      ) : null}

      {children}
    </Contexto.Provider>
  );
}

/** Una fila de la lista, con su casilla delante. */
export function ReunionSeleccionable({
  id,
  etiqueta,
  children,
}: {
  id: string;
  /** Para que el lector de pantalla diga qué reunión se marca. */
  etiqueta: string;
  children: React.ReactNode;
}) {
  const ctx = useContext(Contexto);
  if (!ctx) return <>{children}</>;
  const marcada = ctx.marcadas.has(id);

  return (
    <div
      className={
        "flex items-start gap-1 transition-colors " +
        (marcada ? "bg-indigo-50/60" : "")
      }
    >
      {/* Zona de pulsación amplia: en el teléfono una casilla suelta es
          difícil de acertar. */}
      <label className="flex shrink-0 cursor-pointer items-center self-stretch py-4 pl-4 pr-1 sm:pl-5">
        <input
          type="checkbox"
          checked={marcada}
          onChange={() => ctx.alternar(id)}
          aria-label={`Seleccionar ${etiqueta}`}
          className="h-4 w-4 accent-primary"
        />
      </label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
