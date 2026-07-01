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

type Item = Row & { key: string; tab: "asig" | "resp" };

const RESP_SECTIONS = ["RESPONSABILIDADES", "SAB_RESPONSABILIDADES"];

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
  weekLabel,
  dateInput,
  rows,
  hermanos,
}: {
  meetingId: string;
  day: string;
  dayLabel: string;
  dateLabel: string;
  confirmadorName: string;
  currentUserName: string;
  weekLabel: string;
  dateInput: string;
  rows: Row[];
  sectionOrder: string[];
  sectionLabels: Record<string, string>;
  hermanos: string[];
}) {
  const [state, action] = useActionState(saveMeetingAction, EMPTY_FORM_STATE);
  const [tab, setTab] = useState<"asig" | "resp">("asig");
  const [copied, setCopied] = useState<string | null>(null);
  const [counter, setCounter] = useState(0);

  const [items, setItems] = useState<Item[]>(() =>
    rows.map((r) => ({
      ...r,
      key: r.id,
      tab: RESP_SECTIONS.includes(r.section) ? "resp" : "asig",
    })),
  );

  const update = (key: string, patch: Partial<Item>) =>
    setItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, ...patch } : it)),
    );
  const remove = (key: string) =>
    setItems((prev) => prev.filter((it) => it.key !== key));
  const add = (t: "asig" | "resp") => {
    const key = `new_${counter}`;
    setCounter((c) => c + 1);
    setItems((prev) => [
      ...prev,
      {
        key,
        id: "",
        slotKey: "",
        section: t === "resp" ? "RESPONSABILIDADES" : "ASIGNACIONES",
        label: "",
        allowTwo: true,
        equalPair: false,
        note: "",
        primaryName: "",
        primaryToken: null,
        primaryStatus: CONFIRM_STATUS.PENDIENTE,
        secondaryName: "",
        secondaryToken: null,
        secondaryStatus: CONFIRM_STATUS.PENDIENTE,
        tab: t,
      },
    ]);
    setTab(t);
  };

  function buildMessage(name: string, label: string, token: string) {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const cp = String.fromCodePoint;
    const E = {
      hug: cp(0x1f917), cal: cp(0x1f4c5), clip: cp(0x1f4cb),
      pray: cp(0x1f64f), smile: cp(0x1f60a), point: cp(0x1f449),
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

  const renderPerson = (
    it: Item,
    who: "p" | "s",
    roleLabel: string,
  ) => {
    const name = who === "p" ? it.primaryName : it.secondaryName;
    const token = who === "p" ? it.primaryToken : it.secondaryToken;
    const status = who === "p" ? it.primaryStatus : it.secondaryStatus;
    const trimmed = name.trim();
    const canSend = trimmed.length > 0 && !!token;
    const ckey = `${it.key}_${who}`;
    const msg = canSend ? buildMessage(trimmed, it.label, token!) : "";
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted">{roleLabel}</span>
          {trimmed ? <StatusBadge status={status} /> : null}
        </div>
        <Input
          list="hermanos-lista"
          name={`${who}_${it.key}`}
          value={name}
          onChange={(e) =>
            update(
              it.key,
              who === "p"
                ? { primaryName: e.target.value }
                : { secondaryName: e.target.value },
            )
          }
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
            >
              📲 WhatsApp
            </button>
            <button
              type="button"
              disabled={!canSend}
              onClick={() => copyMsg(ckey, msg)}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copied === ckey ? "✓ Copiado" : "Copiar texto"}
            </button>
          </div>
        ) : null}
        {!token && trimmed ? (
          <p className="text-xs text-amber-600">
            Guarda la reunión para activar el enlace.
          </p>
        ) : null}
      </div>
    );
  };

  const tabBtn = (active: boolean) =>
    "flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors " +
    (active
      ? "bg-primary text-white shadow-sm"
      : "border border-border bg-white text-foreground hover:bg-slate-50");

  const visible = items.filter((it) => it.tab === tab);

  return (
    <>
      <form action={action} className="space-y-5">
        <input type="hidden" name="meetingId" value={meetingId} />
        <input type="hidden" name="keys" value={items.map((i) => i.key).join(",")} />
        {items.map((it) => (
          <span key={`h_${it.key}`}>
            <input type="hidden" name={`id_${it.key}`} value={it.id} />
            <input type="hidden" name={`sec_${it.key}`} value={it.section} />
            <input
              type="hidden"
              name={`two_${it.key}`}
              value={it.allowTwo ? "1" : "0"}
            />
            <input
              type="hidden"
              name={`eq_${it.key}`}
              value={it.equalPair ? "1" : "0"}
            />
          </span>
        ))}
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
              <Label htmlFor="weekLabel">Semana de la reunión</Label>
              <Input
                id="weekLabel"
                name="weekLabel"
                defaultValue={weekLabel}
                placeholder="Ej. 20-26 de Julio"
              />
            </div>
            <div>
              <Label htmlFor="date">Fecha (para ordenar)</Label>
              <Input id="date" name="date" type="date" defaultValue={dateInput} />
            </div>
            <div className="sm:col-span-2">
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

        {/* Pestañas */}
        <div className="flex gap-2">
          <button type="button" onClick={() => setTab("asig")} className={tabBtn(tab === "asig")}>
            Asignaciones
          </button>
          <button type="button" onClick={() => setTab("resp")} className={tabBtn(tab === "resp")}>
            Responsabilidades
          </button>
        </div>

        <div className="space-y-4">
          {visible.length === 0 ? (
            <p className="text-sm text-muted">
              No hay asignaciones en esta sección. Usa “Agregar asignación”.
            </p>
          ) : (
            visible.map((it) => (
              <div key={it.key} className="rounded-xl border border-border p-3 sm:p-4">
                <div className="mb-3 flex items-start gap-2">
                  <div className="flex-1">
                    <span className="mb-1 block text-xs font-medium text-muted">
                      Título de la asignación
                    </span>
                    <Input
                      name={`lbl_${it.key}`}
                      value={it.label}
                      onChange={(e) => update(it.key, { label: e.target.value })}
                      className="font-semibold"
                      placeholder="Título de la asignación"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(it.key)}
                    title="Eliminar esta asignación"
                    className="mt-6 rounded-lg border border-border px-2.5 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
                  >
                    🗑️
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {renderPerson(
                    it,
                    "p",
                    !it.allowTwo ? "Hermano" : it.equalPair ? "Hermano 1" : "Responsable",
                  )}
                  {it.allowTwo
                    ? renderPerson(it, "s", it.equalPair ? "Hermano 2" : "Auxiliar")
                    : null}
                </div>
                <div className="mt-3">
                  <Label htmlFor={`n_${it.key}`}>Anotación (opcional)</Label>
                  <Input
                    id={`n_${it.key}`}
                    name={`n_${it.key}`}
                    value={it.note}
                    onChange={(e) => update(it.key, { note: e.target.value })}
                    placeholder="Ej. tema, lección, detalle…"
                  />
                </div>
              </div>
            ))
          )}

          <button
            type="button"
            onClick={() => add(tab)}
            className="w-full rounded-xl border border-dashed border-primary/50 px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/5"
          >
            ➕ Agregar asignación
          </button>
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
