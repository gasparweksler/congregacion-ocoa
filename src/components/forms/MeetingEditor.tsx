"use client";

import { useEffect, useState, useTransition } from "react";
import { useActionState } from "react";
import {
  saveMeetingAction,
  deleteMeetingAction,
  resetConfirmationAction,
  confirmAssignmentAction,
  reorderAssignmentsAction,
} from "@/server/meeting-actions";
import { EMPTY_FORM_STATE } from "@/server/actions-shared";
import { appOrigin } from "@/lib/app-url";
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
import { DeleteMeetingButton } from "@/components/DeleteMeetingButton";
import { CONFIRM_STATUS, sectionAllowsSecondary } from "@/lib/constants";
import {
  MeetingResponsibilities,
  type RespItem,
} from "@/components/forms/MeetingResponsibilities";

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

/**
 * Lo que la reunión de FIN DE SEMANA guarda fuera de las asignaciones: el
 * orador del discurso público, su número y tema, y quién atiende la
 * hospitalidad. Se editan aquí (en sus tarjetas) pero viven en la reunión,
 * que es de donde los lee el PDF del programa.
 */
export type ProgramaFinde = {
  speakerName: string;
  talkNumber: string;
  talkTitle: string;
  hospitalityGroup: string;
};

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

// Opciones fijas del desplegable "Responsabilidad" (pestaña Responsabilidades).
const RESPONSIBILITY_OPTIONS = [
  "Acomodador de Entrada",
  "Acomodador de Auditorio",
  "Pasa Micrófono",
  "Acomodador de Plataforma",
  "Audio",
  "Video",
];

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
  responsibilities,
  respMonthHref,
  programa,
  esFinde,
  loadedAt,
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
  responsibilities: RespItem[];
  /** Atajo a "Todas las Responsabilidades del mes" en el mes de la reunión. */
  respMonthHref: string;
  /** Datos del discurso público y la hospitalidad (solo fin de semana). */
  programa: ProgramaFinde;
  /** ¿Es una reunión de fin de semana? */
  esFinde: boolean;
  /** Marca de tiempo de la reunión al abrir la pantalla. Se envía al guardar
   *  para avisar si otra persona guardó mientras tanto. */
  loadedAt: string;
}) {
  const [state, action] = useActionState(saveMeetingAction, EMPTY_FORM_STATE);
  const [tab, setTab] = useState<"asig" | "resp">("asig");
  const [copied, setCopied] = useState<string | null>(null);
  const [counter, setCounter] = useState(0);
  const [, startTransition] = useTransition();
  const [dragKey, setDragKey] = useState<string | null>(null);
  // Asignaciones que el usuario quitó en pantalla. Se envían explícitamente:
  // el servidor borra SOLO estas, nunca "lo que no vino en el formulario".
  // Así, si otra persona agrega algo mientras editas, tu guardado no se lo
  // lleva por delante.
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  // Discurso público y hospitalidad: se guardan con el resto de la reunión.
  const [prog, setProg] = useState<ProgramaFinde>(programa);
  const ponProg = (patch: Partial<ProgramaFinde>) =>
    setProg((p) => ({ ...p, ...patch }));

  const [items, setItems] = useState<Item[]>(() =>
    rows.map((r) => {
      const isResp = RESP_SECTIONS.includes(r.section);
      // Responsabilidades: un solo hermano. "Nuestra Vida Cristiana": sin
      // Auxiliar (también en reuniones antiguas creadas con Auxiliar).
      const noSecondary = isResp || !sectionAllowsSecondary(r.section);
      return {
        ...r,
        key: r.id,
        tab: (isResp ? "resp" : "asig") as "asig" | "resp",
        ...(noSecondary
          ? { allowTwo: false, equalPair: false, secondaryName: "" }
          : {}),
      };
    }),
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
  const remove = (key: string) => {
    const it = items.find((i) => i.key === key);
    // Solo las que ya existen en la base hay que borrarlas al guardar.
    if (it?.id) setRemovedIds((prev) => [...new Set([...prev, it.id])]);
    setItems((prev) => prev.filter((i) => i.key !== key));
  };
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
        // Responsabilidad nueva: primera opción por defecto; asignación: vacío.
        label: t === "resp" ? RESPONSIBILITY_OPTIONS[0] : "",
        // Responsabilidades: un solo hermano. Asignaciones: permiten dos.
        allowTwo: t === "resp" ? false : true,
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

  // Confirmar manualmente una asignación pendiente (el propio Responsable).
  const confirmNow = (it: Item, who: "p" | "s") => {
    if (!it.id) return;
    update(
      it.key,
      who === "p"
        ? { primaryStatus: CONFIRM_STATUS.CONFIRMADO }
        : { secondaryStatus: CONFIRM_STATUS.CONFIRMADO },
    );
    startTransition(() => {
      void confirmAssignmentAction(it.id, who);
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
    // "Nuestra Vida Cristiana" no lleva Auxiliar: se quita al cambiar a VC.
    const patch: Partial<Item> = sectionAllowsSecondary(section)
      ? { section }
      : { section, allowTwo: false, equalPair: false, secondaryName: "" };
    update(it.key, patch);
  };

  // Auxiliar manual (solo "Seamos Mejores Maestros").
  const addAuxiliar = (it: Item) =>
    update(it.key, { allowTwo: true, equalPair: false });
  const removeAuxiliar = (it: Item) => {
    if (
      it.secondaryName.trim() &&
      !window.confirm(
        `¿Eliminar al Auxiliar "${it.secondaryName.trim()}" de esta asignación?`,
      )
    )
      return;
    update(it.key, { allowTwo: false, equalPair: false, secondaryName: "" });
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

  // F3 (móvil) · Subir/bajar con botones ▲▼ (el arrastre no funciona en táctil).
  const moveItem = (key: string, dir: "up" | "down") => {
    const idx = items.findIndex((i) => i.key === key);
    if (idx < 0) return;
    const tabOf = items[idx].tab;
    const step = dir === "up" ? -1 : 1;
    let j = idx + step;
    // Busca el vecino más cercano de la MISMA pestaña.
    while (j >= 0 && j < items.length && items[j].tab !== tabOf) j += step;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[idx], next[j]] = [next[j], next[idx]];
    setItems(next);
    const ids = next.filter((i) => i.id).map((i) => i.id);
    startTransition(() => {
      void reorderAssignmentsAction(meetingId, ids);
    });
  };

  function buildMessage(name: string, label: string, token: string) {
    const origin = appOrigin();
    const cp = String.fromCodePoint;
    // Los emojis se arman por código (no literales) para que el empaquetado
    // no los rompa al enviarse desde el teléfono.
    const E = {
      hug: cp(0x1f917), cal: cp(0x1f4c5), clip: cp(0x1f4cb),
      pray: cp(0x1f64f), smile: cp(0x1f60a), point: cp(0x1f449),
      tie: cp(0x1f454), dress: cp(0x1f457), check: cp(0x2705),
    };
    return (
      `Hola querido Hermano/a *${name}* ${E.hug}\n\n` +
      `Le comento que para la reunión del día ${E.cal} *${dayLabel} ${dateLabel}* ` +
      `tiene la siguiente asignación: ${E.clip} *${label}*.\n\n` +
      // WhatsApp no tiene subrayado: solo *negrita*, _cursiva_ y ~tachado~.
      // Se usan negrita + cursiva para destacar el recordatorio. Los marcadores
      // deben pegar al texto, así que los emojis van fuera.
      `${E.tie} *_Recuerde que para su asignación la vestimenta debe ser con ` +
      `chaqueta (vestón) y corbata (varones) y falda o vestido (mujeres)_* ` +
      `${E.dress}\n\n` +
      `${E.check} Por favor, haga click en el siguiente enlace para confirmar o ` +
      `rechazar la asignación. ¡Muchísimas gracias! ${E.pray}${E.smile}\n\n` +
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
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={status} />
              {it.id && status === CONFIRM_STATUS.PENDIENTE ? (
                <button
                  type="button"
                  onClick={() => confirmNow(it, who)}
                  title="Confirmar esta asignación"
                  aria-label="Confirmar esta asignación"
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-600 bg-emerald-50 px-2 py-0.5 text-[0.7rem] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  ✅ Confirmar
                </button>
              ) : null}
              {it.id && status !== CONFIRM_STATUS.PENDIENTE ? (
                <button
                  type="button"
                  onClick={() => resetConfirm(it, who)}
                  title="Resetear el estado de confirmación a Pendiente"
                  aria-label="Resetear a Pendiente"
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
            {canSend ? (
              // Enlace directo (no window.open): en el teléfono el sistema abre
              // WhatsApp nativamente y conserva mejor los emojis del mensaje.
              <a
                href={`https://wa.me/?text=${encodeURIComponent(msg)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                📲 WhatsApp
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white opacity-50"
              >
                📲 WhatsApp
              </button>
            )}
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
        <input type="hidden" name="removed" value={removedIds.join(",")} />
        <input type="hidden" name="loadedAt" value={loadedAt} />
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
            {/* La nota no se edita en pantalla: viaja siempre para no perderla. */}
            <input type="hidden" name={`n_${it.key}`} value={it.note} />
            {/* Lo de la otra pestaña no está pintado: va oculto con su valor,
                para que guardar no lo deje en blanco. */}
            {it.tab !== tab ? (
              <>
                <input type="hidden" name={`lbl_${it.key}`} value={it.label} />
                <input
                  type="hidden"
                  name={`p_${it.key}`}
                  value={it.primaryName}
                />
                <input
                  type="hidden"
                  name={`s_${it.key}`}
                  value={it.secondaryName}
                />
              </>
            ) : null}
          </span>
        ))}
        {/* Fin de semana: si se guarda desde la pestaña de responsabilidades,
            el discurso público y la hospitalidad viajan igual. */}
        {esFinde && tab !== "asig" ? (
          <span>
            <input type="hidden" name="speakerName" value={prog.speakerName} />
            <input type="hidden" name="talkNumber" value={prog.talkNumber} />
            <input type="hidden" name="talkTitle" value={prog.talkTitle} />
            <input
              type="hidden"
              name="hospitalityGroup"
              value={prog.hospitalityGroup}
            />
          </span>
        ) : null}
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

        {tab === "resp" ? (
          <MeetingResponsibilities
            meetingId={meetingId}
            dayLabel={dayLabel}
            dateLabel={dateLabel}
            respMonthHref={respMonthHref}
            items={responsibilities}
          />
        ) : (
        <div className="space-y-4">
          {visible.length === 0 ? (
            <p className="text-sm text-muted">
              No hay asignaciones en esta sección. Usa “Agregar asignación”.
            </p>
          ) : (
            visible.map((it, vidx) => (
              <div
                key={it.key}
                onDragOver={(e) => {
                  if (dragKey && dragKey !== it.key) e.preventDefault();
                }}
                onDrop={() => onDropOn(it.key)}
                className={
                  "rounded-xl border border-border p-3 transition-shadow sm:p-4 " +
                  // Con color de sección, o borde izquierdo gris neutro para "Otro".
                  (SECTION_STYLE[it.section]?.card ??
                    "border-l-4 border-l-slate-400") +
                  (dragKey === it.key ? " opacity-50" : "") +
                  (dragKey && dragKey !== it.key
                    ? " ring-1 ring-dashed ring-primary/40"
                    : "")
                }
              >
                {/* Encabezado: reordenar (botones ▲▼ + mango) + chip + categoría */}
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveItem(it.key, "up")}
                      disabled={vidx === 0}
                      title="Subir"
                      aria-label="Subir asignación"
                      className="rounded-md border border-border px-1.5 py-1 text-sm leading-none text-muted transition-colors hover:bg-slate-50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveItem(it.key, "down")}
                      disabled={vidx === visible.length - 1}
                      title="Bajar"
                      aria-label="Bajar asignación"
                      className="rounded-md border border-border px-1.5 py-1 text-sm leading-none text-muted transition-colors hover:bg-slate-50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </div>
                  <span
                    draggable
                    onDragStart={() => setDragKey(it.key)}
                    onDragEnd={() => setDragKey(null)}
                    title="Arrastra para reordenar (en computadora)"
                    aria-label="Arrastrar para reordenar"
                    className="hidden cursor-grab select-none rounded-md px-1 text-lg leading-none text-muted active:cursor-grabbing sm:inline"
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
                  {it.tab !== "resp" ? (
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
                  ) : null}
                </div>
                <div className="mb-3 flex items-start gap-2">
                  <div className="flex-1">
                    <span className="mb-1 block text-xs font-medium text-muted">
                      {it.tab === "resp"
                        ? "Responsabilidad"
                        : "Título de la asignación"}
                    </span>
                    {it.tab === "resp" ? (
                      <Select
                        name={`lbl_${it.key}`}
                        value={it.label}
                        onChange={(e) =>
                          update(it.key, { label: e.target.value })
                        }
                        className="font-semibold"
                      >
                        {/* Si el valor guardado no está en la lista, se conserva. */}
                        {!RESPONSIBILITY_OPTIONS.includes(it.label) &&
                        it.label ? (
                          <option value={it.label}>{it.label}</option>
                        ) : null}
                        {RESPONSIBILITY_OPTIONS.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Input
                        name={`lbl_${it.key}`}
                        value={it.label}
                        onChange={(e) =>
                          update(it.key, { label: e.target.value })
                        }
                        className="font-semibold"
                        placeholder="Título de la asignación"
                      />
                    )}
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
                    aria-label="Eliminar esta asignación"
                    className="mt-6 rounded-lg border border-border px-2.5 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
                  >
                    <span aria-hidden>🗑️</span>
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {renderPerson(
                    it,
                    "p",
                    it.tab === "resp"
                      ? "Responsable"
                      : !it.allowTwo
                        ? "Hermano"
                        : it.equalPair
                          ? "Hermano 1"
                          : "Responsable",
                  )}
                  {it.allowTwo
                    ? renderPerson(it, "s", it.equalPair ? "Hermano 2" : "Auxiliar")
                    : null}
                </div>

                {/* Auxiliar manual: solo en "Seamos Mejores Maestros". */}
                {it.section === "SMM" ? (
                  <div className="mt-3">
                    {it.allowTwo ? (
                      <button
                        type="button"
                        onClick={() => removeAuxiliar(it)}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                      >
                        ➖ Eliminar Auxiliar
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => addAuxiliar(it)}
                        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-primary/50 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/5"
                      >
                        ➕ Agregar Auxiliar
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            ))
          )}

          {/* --- Fin de semana: discurso público y hospitalidad ---------
              No son asignaciones de la congregación (el orador suele venir de
              otra, y la hospitalidad es quien recibe), así que no llevan
              enlace de confirmación ni cuentan en las estadísticas. Se
              guardan con el botón "Guardar reunión", como todo lo demás, y
              salen en el PDF del programa de fin de semana. */}
          {esFinde ? (
            <>
              <div className="rounded-xl border border-border border-l-4 border-l-[#1f3864] bg-[#1f3864]/[0.05] p-3 sm:p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="inline-block rounded-full bg-[#1f3864] px-2.5 py-0.5 text-[0.7rem] font-semibold text-white">
                    Fin de semana
                  </span>
                  <span className="text-sm font-bold text-foreground">
                    Discurso Público
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="speakerName">Orador</Label>
                    <Input
                      id="speakerName"
                      name="speakerName"
                      list="hermanos-lista"
                      value={prog.speakerName}
                      onChange={(e) => ponProg({ speakerName: e.target.value })}
                      placeholder="Ej.: Raúl Aguilera - Cabildo"
                      maxLength={120}
                      autoComplete="off"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[5.5rem_1fr]">
                    <div>
                      <Label htmlFor="talkNumber">Nº del tema</Label>
                      <Input
                        id="talkNumber"
                        name="talkNumber"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={999}
                        value={prog.talkNumber}
                        onChange={(e) => ponProg({ talkNumber: e.target.value })}
                        placeholder="Nº"
                      />
                    </div>
                    <div>
                      <Label htmlFor="talkTitle">Tema</Label>
                      <Input
                        id="talkTitle"
                        name="talkTitle"
                        value={prog.talkTitle}
                        onChange={(e) => ponProg({ talkTitle: e.target.value })}
                        placeholder="Ej.: Seamos honrados en todo"
                        maxLength={160}
                      />
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted">
                  El orador y el tema salen en el PDF del programa de fin de
                  semana. Deja un campo vacío para borrarlo.
                </p>
              </div>

              <div className="rounded-xl border border-border border-l-4 border-l-[#1f3864] bg-[#1f3864]/[0.05] p-3 sm:p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="inline-block rounded-full bg-[#1f3864] px-2.5 py-0.5 text-[0.7rem] font-semibold text-white">
                    Fin de semana
                  </span>
                  <span className="text-sm font-bold text-foreground">
                    Hospitalidad
                  </span>
                </div>
                <Label htmlFor="hospitalityGroup">
                  Hermano (o grupo) encargado
                </Label>
                <Input
                  id="hospitalityGroup"
                  name="hospitalityGroup"
                  list="hermanos-lista"
                  value={prog.hospitalityGroup}
                  onChange={(e) =>
                    ponProg({ hospitalityGroup: e.target.value })
                  }
                  placeholder="Nombre del hermano, o Grupo Nro 04"
                  maxLength={120}
                  autoComplete="off"
                />
                <p className="mt-2 text-xs text-muted">
                  Aparece en el PDF del programa de fin de semana.
                </p>
              </div>
            </>
          ) : null}

          <button
            type="button"
            onClick={() => add("asig")}
            className="w-full rounded-xl border border-dashed border-primary/50 px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/5"
          >
            ➕ Agregar asignación
          </button>
        </div>
        )}

        <div className="flex justify-end border-t border-border pt-4">
          <SubmitButton pendingText="Guardando…">Guardar reunión</SubmitButton>
        </div>
      </form>

      <div className="mt-4">
        <DeleteMeetingButton
          action={deleteMeetingAction}
          hidden={{ id: meetingId }}
          title="Eliminar reunión"
          description="Se eliminará esta reunión con todas sus asignaciones y sus enlaces de confirmación. La reunión no se puede recuperar."
        >
          Eliminar reunión
        </DeleteMeetingButton>
      </div>
    </>
  );
}
