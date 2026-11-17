"use client";

// Los nombres de las asignaciones que no coinciden con ningún hermano
// inscrito, con las dos maneras de arreglarlos: quitarlos del historial o
// fusionarlos con el hermano que de verdad es.
//
// Por qué aquí y no en la lista de abajo: estos textos no son hermanos, así
// que no tienen ficha ni gráfico propio. Antes solo se avisaba de que
// existían; ahora se pueden corregir sin tocar la base a mano.
//
// Las dos acciones piden confirmación con la ventana de siempre
// (ConfirmDialog) y dicen exactamente qué va a pasar y en cuántos registros.

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { EMPTY_FORM_STATE, type FormState } from "@/server/actions-shared";
import { Alert, Select } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export type NombreSuelto = { name: string; count: number };
export type HermanoInscrito = {
  id: string;
  fullName: string;
  groupName: string | null;
};

type Accion = (prev: FormState, formData: FormData) => Promise<FormState>;

/** El diálogo, dentro del formulario, para saber cuándo se está enviando. */
function DialogoDeAccion({
  open,
  title,
  description,
  confirmLabel,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <ConfirmDialog
      open={open}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      pendingLabel="Un momento…"
      pending={pending}
      onCancel={onCancel}
    />
  );
}

function Fila({
  item,
  hermanos,
  eliminar,
  fusionar,
}: {
  item: NombreSuelto;
  hermanos: HermanoInscrito[];
  eliminar: (formData: FormData) => void;
  fusionar: (formData: FormData) => void;
}) {
  const [elegido, setElegido] = useState("");
  const [abrirBorrar, setAbrirBorrar] = useState(false);
  const [abrirFusion, setAbrirFusion] = useState(false);
  const hermano = hermanos.find((h) => h.id === elegido);

  const cuantas = `${item.count} asignación(es)`;

  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="truncate font-semibold text-foreground">{item.name}</p>
        <p className="text-xs text-muted">{cuantas} en el historial</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {/* --- Fusionar con un hermano inscrito ------------------------- */}
        <form action={fusionar} className="flex flex-1 flex-wrap items-center gap-2">
          <input type="hidden" name="nombre" value={item.name} />
          <input type="hidden" name="publisherId" value={elegido} />
          <Select
            aria-label={`Fusionar "${item.name}" con un hermano`}
            value={elegido}
            onChange={(e) => setElegido(e.target.value)}
            className="min-w-0 flex-1 sm:w-56"
          >
            <option value="">Fusionar con…</option>
            {hermanos.map((h) => (
              <option key={h.id} value={h.id}>
                {h.fullName}
                {h.groupName ? ` · ${h.groupName}` : ""}
              </option>
            ))}
          </Select>
          <button
            type="button"
            disabled={!elegido}
            onClick={() => setAbrirFusion(true)}
            className="rounded-lg border border-primary/50 px-3 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Fusionar
          </button>
          <DialogoDeAccion
            open={abrirFusion}
            title={`¿Fusionar "${item.name}" con ${hermano?.fullName ?? ""}?`}
            description={
              `En las ${cuantas} donde aparece "${item.name}" se escribirá ` +
              `${hermano?.fullName ?? ""}, que es el hermano inscrito. A partir de ` +
              "ahí esas participaciones cuentan como suyas en las estadísticas y " +
              "en el gráfico. No se crea ningún registro nuevo ni se toca a " +
              "ningún otro hermano."
            }
            confirmLabel="Sí, fusionar"
            onCancel={() => setAbrirFusion(false)}
          />
        </form>

        {/* --- Eliminar el nombre del historial -------------------------- */}
        <form action={eliminar}>
          <input type="hidden" name="nombre" value={item.name} />
          <button
            type="button"
            onClick={() => setAbrirBorrar(true)}
            className="w-full rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 sm:w-auto"
          >
            🗑️ Eliminar del historial
          </button>
          <DialogoDeAccion
            open={abrirBorrar}
            title={`¿Quitar "${item.name}" del historial?`}
            description={
              `Se borrará ese nombre de las ${cuantas} donde aparece. Las ` +
              "asignaciones NO se borran: se quedan en su reunión sin hermano, " +
              "listas para escribir otro. Ningún hermano inscrito se ve " +
              "afectado. Esto no se puede deshacer."
            }
            confirmLabel="Sí, quitar del historial"
            onCancel={() => setAbrirBorrar(false)}
          />
        </form>
      </div>
    </li>
  );
}

export function NombresSinEmparejar({
  nombres,
  hermanos,
  eliminarAction,
  fusionarAction,
}: {
  nombres: NombreSuelto[];
  hermanos: HermanoInscrito[];
  eliminarAction: Accion;
  fusionarAction: Accion;
}) {
  // El aviso vive arriba, fuera de las filas: tras arreglar un nombre su fila
  // desaparece de la lista, y el mensaje tiene que seguir leyéndose.
  const [estadoBorrar, accionBorrar] = useActionState(
    eliminarAction,
    EMPTY_FORM_STATE,
  );
  const [estadoFusion, accionFusion] = useActionState(
    fusionarAction,
    EMPTY_FORM_STATE,
  );

  return (
    <div>
      {[estadoBorrar, estadoFusion].map((e, i) => (
        <div key={i}>
          {e.error ? (
            <div className="px-4 pt-3 sm:px-5">
              <Alert tone="error">{e.error}</Alert>
            </div>
          ) : null}
          {e.success ? (
            <div className="px-4 pt-3 sm:px-5">
              <Alert tone="success">{e.success}</Alert>
            </div>
          ) : null}
        </div>
      ))}

      {nombres.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted sm:px-5">
          Todos los nombres de las asignaciones coinciden con un hermano
          inscrito.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {nombres.map((n) => (
            <Fila
              key={n.name}
              item={n}
              hermanos={hermanos}
              eliminar={accionBorrar}
              fusionar={accionFusion}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
