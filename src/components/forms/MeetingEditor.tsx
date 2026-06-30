"use client";

import { useState } from "react";
import { useActionState } from "react";
import {
  saveMeetingAction,
  deleteMeetingAction,
} from "@/server/meeting-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import {
  Card,
  CardHeader,
  CardBody,
  Label,
  Input,
  Alert,
  Badge,
} from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CONFIRM_STATUS } from "@/lib/constants";

type Row = {
  id: string;
  slotKey: string;
  section: string;
  label: string;
  allowTwo: boolean;
  equalPair: boolean;
  note: string;
  primaryName: string;
  primaryToken: string | null;
  primaryStatus: string;
  secondaryName: string;
  secondaryToken: string | null;
  secondaryStatus: string;
};

function StatusBadge({ status }: { status: string }) {
  if (status === CONFIRM_STATUS.CONFIRMADO)
    return <Badge tone="green">✅ Confirmado</Badge>;
  if (status === CONFIRM_STATUS.RECHAZADO)
    return <Badge tone="red">❌ Rechazado</Badge>;
  return <Badge tone="amber">⏳ Pendiente</Badge>;
}

export function MeetingEditor({
  meetingId,
  dayLabel,
  dateLabel,
  confirmadorName,
  currentUserName,
  rows,
  sectionOrder,
  sectionLabels,
  hermanos,
}: {
  meetingId: string;
  day: string;
  dayLabel: string;
  dateLabel: string;
  confirmadorName: string;
  currentUserName: string;
  rows: Row[];
  sectionOrder: string[];
  sectionLabels: Record<string, string>;
  hermanos: string[];
}) {
  const [state, action] = useActionState(saveMeetingAction, EMPTY_FORM_STATE);
  const [vals, setVals] = useState<
    Record<string, { p: string; s: string; n: string; l: string }>
  >(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.id,
        { p: r.primaryName, s: r.secondaryName, n: r.note, l: r.label },
      ]),
    ),
  );
  const [copied, setCopied] = useState<string | null>(null);

  const setField = (id: string, key: "p" | "s" | "n" | "l", value: string) =>
    setVals((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));

  const grouped = sectionOrder
    .map((sec) => ({
      sec,
      label: sectionLabels[sec] ?? sec,
      items: rows.filter((r) => r.section === sec),
    }))
    .filter((g) => g.items.length > 0);

  function buildMessage(name: string, label: string, token: string) {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const E = {
      hug: "\u{1F917}",
      cal: "\u{1F4C5}",
      clip: "\u{1F4CB}",
      pray: "\u{1F64F}",
      smile: "\u{1F60A}",
      point: "\u{1F449}",
    };
    return (
      `Hola querido Hermano/a *${name}* ${E.hug}\n\n` +
      `Le comento que para la reunión del día ${E.cal} *${dayLabel} ${dateLabel}* ` +
      `tiene la siguiente asignación: ${E.clip} *${label}*.\n\n` +
      `Por favor, haga click en el siguiente enlace para confirmar o rechazar ` +
      `la asignación. ¡Muchísimas gracias! ${E.pray}${E.smile}\n\n` +
      `${E.point} ${origin}/confirmar/${token}`
    );
  }

  async function copyMsg(key: string, msg: string) {
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      /* ignore */
    }
  }

  const renderPerson = ({
    rowId,
    who,
    label,
    name,
    token,
    status,
    roleLabel,
  }: {
    rowId: string;
    who: "p" | "s";
    label: string;
    name: string;
    token: string | null;
    status: string;
    roleLabel: string;
  }) => {
    const trimmed = name.trim();
    const canSend = trimmed.length > 0 && !!token;
    const key = `${rowId}_${who}`;
    const msg = canSend ? buildMessage(trimmed, label, token!) : "";
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted">{roleLabel}</span>
          {trimmed ? <StatusBadge status={status} /> : null}
        </div>
        <Input
          list="hermanos-lista"
          name={`${who}_${rowId}`}
          value={name}
          onChange={(e) => setField(rowId, who, e.target.value)}
          placeholder="Buscar hermano…"
          autoComplete="off"
        />
        {trimmed ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canSend}
              onClick={() =>
                window.open(
                  `https://wa.me/?text=${encodeURIComponent(msg)}`,
                  "_blank",
                )
              }
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              title={
                canSend
                  ? "Abrir WhatsApp con el mensaje"
                  : "Guarda la reunión para generar el enlace"
              }
            >
              📲 WhatsApp
            </button>
            <button
              type="button"
              disabled={!canSend}
              onClick={() => copyMsg(key, msg)}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copied === key ? "✓ Copiado" : "Copiar texto"}
            </button>
          </div>
        ) : null}
        {!token && trimmed ? (
          <p className="text-xs text-amber-600">
            Guarda la reunión para activar el enlace de confirmación.
          </p>
        ) : null}
      </div>
    );
  }

  const [tab, setTab] = useState<"asig" | "resp">("asig");
  const RESP_SECTIONS = ["RESPONSABILIDADES", "SAB_RESPONSABILIDADES"];
  const asigGroups = grouped.filter((g) => !RESP_SECTIONS.includes(g.sec));
  const respGroups = grouped.filter((g) => RESP_SECTIONS.includes(g.sec));

  const tabBtnClass = (active: boolean) =>
    "flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors " +
    (active
      ? "bg-primary text-white shadow-sm"
      : "border border-border bg-white text-foreground hover:bg-slate-50");

  const renderGroup = (g: { sec: string; label: string; items: Row[] }) => (
    <Card key={g.sec}>
      <CardHeader title={g.label} />
      <CardBody className="space-y-5">
        {g.items.map((r) => (
          <div
            key={r.id}
            className="rounded-xl border border-border p-3 sm:p-4"
          >
            <div className="mb-3">
              <span className="mb-1 block text-xs font-medium text-muted">
                Título de la asignación
              </span>
              <Input
                name={`l_${r.id}`}
                value={vals[r.id]?.l ?? ""}
                onChange={(e) => setField(r.id, "l", e.target.value)}
                className="font-semibold"
                placeholder="Título de la asignación"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {renderPerson({
                rowId: r.id,
                who: "p",
                label: vals[r.id]?.l ?? r.label,
                name: vals[r.id]?.p ?? "",
                token: r.primaryToken,
                status: r.primaryStatus,
                roleLabel: !r.allowTwo
                  ? "Hermano"
                  : r.equalPair
                    ? "Hermano 1"
                    : "Responsable",
              })}
              {r.allowTwo
                ? renderPerson({
                    rowId: r.id,
                    who: "s",
                    label: vals[r.id]?.l ?? r.label,
                    name: vals[r.id]?.s ?? "",
                    token: r.secondaryToken,
                    status: r.secondaryStatus,
                    roleLabel: r.equalPair ? "Hermano 2" : "Auxiliar",
                  })
                : null}
            </div>
            <div className="mt-3">
              <Label htmlFor={`n_${r.id}`}>Anotación (opcional)</Label>
              <Input
                id={`n_${r.id}`}
                name={`n_${r.id}`}
                value={vals[r.id]?.n ?? ""}
                onChange={(e) => setField(r.id, "n", e.target.value)}
                placeholder="Ej. tema, lección, detalle…"
              />
            </div>
          </div>
        ))}
      </CardBody>
    </Card>
  );

  return (
    <>
    <form action={action} className="space-y-5">
      <input type="hidden" name="meetingId" value={meetingId} />
      <datalist id="hermanos-lista">
        {hermanos.map((h) => (
          <option key={h} value={h} />
        ))}
      </datalist>

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="confirmadorName">Responsable de Confirmación</Label>
            <Input
              id="confirmadorName"
              name="confirmadorName"
              defaultValue={confirmadorName || currentUserName}
              placeholder="Nombre de quien confirma"
            />
          </div>
        </CardBody>
      </Card>

      {/* Pestañas: Asignaciones / Responsabilidades */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("asig")}
          className={tabBtnClass(tab === "asig")}
        >
          Asignaciones
        </button>
        <button
          type="button"
          onClick={() => setTab("resp")}
          className={tabBtnClass(tab === "resp")}
        >
          Responsabilidades
        </button>
      </div>

      {/* Ambos grupos quedan en el DOM (el inactivo oculto con CSS) para no
          perder datos al guardar; solo se ve la pestaña activa. */}
      <div className={tab === "asig" ? "space-y-5" : "hidden"}>
        {asigGroups.length ? (
          asigGroups.map(renderGroup)
        ) : (
          <p className="text-sm text-muted">No hay asignaciones.</p>
        )}
      </div>
      <div className={tab === "resp" ? "space-y-5" : "hidden"}>
        {respGroups.length ? (
          respGroups.map(renderGroup)
        ) : (
          <p className="text-sm text-muted">
            Esta reunión no tiene sección de responsabilidades.
          </p>
        )}
      </div>

      <div className="flex justify-end border-t border-border pt-4">
        <SubmitButton pendingText="Guardando…">Guardar reunión</SubmitButton>
      </div>
    </form>

    <div className="mt-4">
      <ConfirmButton
        action={deleteMeetingAction}
        hidden={{ id: meetingId }}
        confirmText="¿Eliminar esta reunión y todas sus asignaciones? No se puede deshacer."
      >
        Eliminar reunión
      </ConfirmButton>
    </div>
    </>
  );
}
