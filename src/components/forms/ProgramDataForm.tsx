"use client";

// Datos del programa de la reunión que NO son asignación de nadie.
//
// En la de entre semana son las canciones y la lectura semanal; en la de fin
// de semana, las canciones.
//
// El orador del discurso público, su tema y quién atiende la hospitalidad se
// muestran aquí para tener el programa de un vistazo, pero se escriben en sus
// asignaciones ("Discurso Público" y "Hospitalidad"), que es donde la
// congregación los busca. El dato vive en un solo sitio: la reunión.
//
// Normalmente llegan de la planilla al importarla; aquí se pueden corregir o
// escribir a mano sin volver a subir el Excel. Se muestran como texto hasta
// que se pulsa "Editar", para que no parezca un formulario que hay que
// rellenar.

import { useActionState, useState } from "react";
import { setProgramDataAction } from "@/server/meeting-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Label, Input, Alert, Button } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { MEETING_DAYS } from "@/lib/constants";

export type ProgramData = {
  weeklyReading: string;
  songStart: string;
  songMiddle: string;
  songEnd: string;
  /** Solo fin de semana. */
  speakerName: string;
  talkNumber: string;
  talkTitle: string;
  hospitalityGroup: string;
};

export function ProgramDataForm({
  meetingId,
  day,
  data,
}: {
  meetingId: string;
  /** JUEVES | SABADO: decide qué datos se piden. */
  day: string;
  data: ProgramData;
}) {
  const [state, action] = useActionState(setProgramDataAction, EMPTY_FORM_STATE);
  const [editing, setEditing] = useState(false);
  const esFinde = day === MEETING_DAYS.SABADO;

  // Tras guardar se vuelve a la vista de lectura (ajuste en render, no en
  // efecto: así no hay un parpadeo con el formulario todavía abierto).
  if (state.success && editing) setEditing(false);

  const vista = esFinde
    ? [
        { label: "Orador", valor: data.speakerName },
        {
          label: "Tema",
          valor: [data.talkNumber && `Nº ${data.talkNumber}`, data.talkTitle]
            .filter(Boolean)
            .join(" · "),
        },
        { label: "Hospitalidad", valor: data.hospitalityGroup },
        {
          label: "Canción de inicio",
          valor: data.songStart ? `Canción ${data.songStart}` : "",
        },
        {
          label: "Canción final",
          valor: data.songEnd ? `Canción ${data.songEnd}` : "",
        },
      ]
    : [
        { label: "Lectura semanal de la Biblia", valor: data.weeklyReading },
        {
          label: "Canción de inicio",
          valor: data.songStart ? `Canción ${data.songStart}` : "",
        },
        {
          label: "Canción de Nuestra Vida Cristiana",
          valor: data.songMiddle ? `Canción ${data.songMiddle}` : "",
        },
        {
          label: "Canción final",
          valor: data.songEnd ? `Canción ${data.songEnd}` : "",
        },
      ];
  const hayAlgo = vista.some((v) => v.valor);

  if (!editing) {
    return (
      <div className="space-y-3">
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}

        {hayAlgo ? (
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {vista.map((v) => (
              <div
                key={v.label}
                className="rounded-xl border border-border bg-surface px-3 py-2"
              >
                <dt className="text-xs text-muted">{v.label}</dt>
                <dd className="mt-0.5 font-semibold text-foreground">
                  {v.valor || <span className="text-muted">—</span>}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted">
            {esFinde
              ? "Esta reunión no tiene todavía canciones guardadas. Escríbelas aquí con "
              : "Esta reunión no tiene canciones ni lectura semanal guardadas. Se toman del Excel al importarlo, o puedes escribirlas aquí con "}
            <strong>Editar</strong>.
          </p>
        )}

        <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
          ✏️ Editar
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="meetingId" value={meetingId} />
      {/* El día viaja con el formulario para que la acción sepa qué campos
          esperar: así editar una reunión de fin de semana no borra la lectura
          semanal de otra, ni al revés. */}
      <input type="hidden" name="day" value={day} />
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      {esFinde ? (
        <>
          <p className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-muted">
            El <strong>orador</strong>, el <strong>tema</strong> y la{" "}
            <strong>hospitalidad</strong> se escriben más abajo, en las
            asignaciones «Discurso Público» y «Hospitalidad», y se guardan con
            el botón <strong>Guardar reunión</strong>.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { name: "songStart", label: "Canción de inicio", valor: data.songStart },
              { name: "songEnd", label: "Canción final", valor: data.songEnd },
            ].map((c) => (
              <div key={c.name}>
                <Label htmlFor={c.name}>{c.label}</Label>
                <Input
                  id={c.name}
                  name={c.name}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={999}
                  defaultValue={c.valor}
                  placeholder="Nº"
                />
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div>
            <Label htmlFor="weeklyReading">Lectura semanal de la Biblia</Label>
            <Input
              id="weeklyReading"
              name="weeklyReading"
              defaultValue={data.weeklyReading}
              placeholder="Ej.: JEREMÍAS 40, 41"
              maxLength={120}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { name: "songStart", label: "Canción de inicio", valor: data.songStart },
              {
                name: "songMiddle",
                label: "Canción de Nuestra Vida Cristiana",
                valor: data.songMiddle,
              },
              { name: "songEnd", label: "Canción final", valor: data.songEnd },
            ].map((c) => (
              <div key={c.name}>
                <Label htmlFor={c.name}>{c.label}</Label>
                <Input
                  id={c.name}
                  name={c.name}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={999}
                  defaultValue={c.valor}
                  placeholder="Nº"
                />
              </div>
            ))}
          </div>
        </>
      )}

      <p className="text-xs text-muted">
        Deja un campo vacío para borrarlo: queda sin dato y no se imprime, en vez
        de aparecer con un número o un nombre inventado.
      </p>

      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingText="Guardando…">Guardar</SubmitButton>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setEditing(false)}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
