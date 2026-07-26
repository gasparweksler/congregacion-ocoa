"use client";

import { useEffect, useState, useTransition } from "react";
import { useActionState } from "react";
import {
  saveMeetingAction,
  deleteMeetingAction,
  resetConfirmationAction,
  reorderAssignmentsAction,
} from "@/server/meeting-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { Select } from "@/components/ui";
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

// Colores por sección, como en el programa impreso (Excel).
const SECTION_STYLE: Record<string, { card: string; chip: string }> = {
  TESOROS: {
    card: "border-l-4 border-l-[#4f7a86] bg-[#4f7a86]/[0.06]",
    chip: "bg-[#4f7a86] text-white",
  },
  SMM: {
    card: "border-l-4 border-l-[#b58a2e] bg-[#b58a2e]/[0.06]",
    chip: "bg-[#b58a2e] text-white",
  },
  VC: {
    card: "border-l-4 border-l-[#9d3b33] bg-[#9d3b33]/[0.06]",
    chip: "bg-[#9d3b33] text-white",
  },
};

// Categoría de la asignación -> sección (que determina el color). "Otro" deja
// la asignación con estilo neutro (sin color), como oraciones/presidencia.
const CATEGORY_OPTIONS = [
  { value: "TESOROS", label: "Tesoros de la Biblia" },
  { value: "SMM", label: "Seamos Mejores Maestros" },
  { value: "VC", label: "Nuestra Vida Cristiana" },
  { value: "OTRO", label: "Otro (sin color)" },
];

// Dada una sección guardada, devuelve el valor de categoría a mostrar.
function categoryOf(section: string): string {
  if (section === "TESOROS" || section === "SMM" || section === "VC")
    return section;
  return "OTRO";
}

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
  sectionLabels,
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
  const [, startTransition] = useTransition();
  const [dragKey, setDragKey] = useState<string | null>(null);

  const [items, setItems] = useState<Item[]>(() =>
    rows.map((r) => ({
      ...r,
      key: r.id,
      tab: RESP_SECTIONS.includes(r.section) ? "resp" : "asig",
    })),
  );

  // Tiempo real: cuando el servidor trae datos frescos (auto-refresco), sincroniza
  // SOLO los estados de confirmación (por id), sin tocar nombres/títulos/notas que
  // el administrador pueda estar editando en ese momento.
  useEffect(() => {
    setItems((prev) => {
      const byId = new Map(rows.map((r) => [r.id, r]));
      let changed = false;
      const next = prev.map((it) => {
        const fresh = it.id ? byId.get(it.id) : undefined;
        if (
          fresh &&
          (fresh.primaryStatus !== it.primaryStatus ||
            fresh.secondaryStatus !== it.secondaryStatus)
        ) {
          changed = true;
          return {
            ...it,
            primaryStatus: fresh.primaryStatus,
            secondaryStatus: fresh.secondaryStatus,
          };
        }
        return it;
      });
      return changed ? next : prev;
    });
  }, [rows]);

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

  // F1 · Resetear confirmación a Pendiente (corrige errores). Persiste y refleja.
  const resetConfirm = (it: Item, who: "p" | "s") => {
    if (!it.id) return;
    if (!window.confirm("¿Resetear esta confirmación a Pendiente?")) return;
    update(
      it.key,
      who === "p"
        ? { primaryStatus: CONFIRM_STATUS.PENDIENTE }
        : { secondaryStatus: CONFIRM_STATUS.PENDIENTE },
    );
    startTransition(() => {
      void resetConfirmationAction(it.id, who);
    });
  };

  // F2 · Cambiar categoría -> cambia la sección (y por tanto el color).
  const changeCategory = (it: Item, category: string) => {
    let section: string;
    if (category === "OTRO") {
      section = it.tab === "resp" ? "RESPONSABILIDADES" : "ASIGNACIONES";
    } else {
      section = category; // TESOROS | SMM | VC
    }
    update(it.key, { section });
  };

  // F3 · Reordenar por arrastrar y soltar. Al soltar, persiste el nuevo orden.
  const onDropOn = (targetKey: string) => {
    const dk = dragKey;
    setDragKey(null);
    if (!dk || dk === targetKey) return;
    const dragItem = items.find((i) => i.key === dk);
    const targetItem = items.find((i) => i.key === targetKey);
    if (!dragItem || !targetItem || dragItem.tab !== targetItem.tab) return;
    const without = items.filter((i) => i.key !== dk);
    const ti = without.findIndex((i) => i.key === targetKey);
    without.splice(ti, 0, dragItem);
    setItems(without);
    const ids = without.filter((i) => i.id).map((i) => i.id);
    startTransition(() => {
      void reorderAssignmentsAction(meetingId, ids);
    });
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted">{roleLabel}</span>
          {trimmed ? (
            <div className="flex items-center gap-1.5">
              <StatusBadge status={status} />
              {it.id && status !== CONFIRM_STATUS.PENDIENTE ? (
                <button
                  type="button"
                  onClick={() => resetConfirm(it, who)}
                  title="Resetear el estado de confirmación a Pendiente"
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 text-[0.7rem] font-medium text-muted transition-colors hover:bg-slate-50 hover:text-foreground"
                >
                  ↺ Resetear
                </button>
              ) : null}
            </div>
          ) : null}
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
              <div
                key={it.key}
                onDragOver={(e) => {
                  if (dragKey && dragKey !== it.key) e.preventDefault();
                }}
                onDrop={() => onDropOn(it.key)}
                className={
                  "rounded-xl border border-border p-3 transition-shadow sm:p-4 " +
                  (SECTION_STYLE[it.section]?.card ?? "") +
                  (dragKey === it.key ? " opacity-50" : "") +
                  (dragKey && dragKey !== it.key
                    ? " ring-1 ring-dashed ring-primary/40"
                    : "")
                }
              >
                {/* Encabezado: mango de arrastre + chip de sección + categoría */}
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    draggable
                    onDragStart={() => setDragKey(it.key)}
                    onDragEnd={() => setDragKey(null)}
                    title="Arrastra para reordenar la asignación"
                    aria-label="Arrastrar para reordenar"
                    className="cursor-grab select-none rounded-md px-1 text-lg leading-none text-muted active:cursor-grabbing"
                  >
                    ⠿
                  </span>
                  {sectionLabels[it.section] ? (
                    <span
                      className={
                        "inline-block rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold " +
                        (SECTION_STYLE[it.section]?.chip ??
                          "bg-slate-200 text-slate-700")
                      }
                    >
                      {sectionLabels[it.section]}
                    </span>
                  ) : null}
                  <label className="ml-auto flex items-center gap-1.5 text-[0.7rem] text-muted">
                    Categoría
                    <Select
                      value={categoryOf(it.section)}
                      onChange={(e) => changeCategory(it, e.target.value)}
                      className="w-auto min-w-0 px-2 py-1 text-xs"
                    >
                      {CATEGORY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                </div>
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
                    onClick={() => {
                      if (
                        window.confirm(
                          `¿Eliminar la asignación "${
                            it.label.trim() || "(sin título)"
                          }"?`,
                        )
                      )
                        remove(it.key);
                    }}
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
