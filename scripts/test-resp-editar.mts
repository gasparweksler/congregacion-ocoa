// ============================================================================
//  Editar y guardar el programa del mes, y vaciar las responsabilidades de
//  UNA reunión.
//
//  A. Las reglas, sin base: qué casillas se mandan al guardar (lo demás no
//     viaja) y qué casillas cuentan como "responsabilidad del mes".
//  B. Contra la base REAL: vaciar las responsabilidades de una reunión no
//     toca las otras reuniones, ni el programa de esa misma reunión, ni otra
//     congregación.
//  C. Contra la base REAL: al guardar el mes, las reuniones que ya existen se
//     actualizan por su fecha, las que faltan se crean, y guardar dos veces
//     lo mismo no duplica nada.
//
//  Todo ocurre dentro de una transacción que se revierte al terminar: no
//  queda ni una fila de prueba en la base.
//
//      npm run test:resp-editar
// ============================================================================
import { PrismaClient, type Prisma } from "@prisma/client";
import crypto from "node:crypto";
import {
  MEETING_DAYS,
  MONTHLY_RESPONSIBILITIES,
  MONTHLY_RESP_KEYS,
  slotsForDay,
} from "../src/lib/constants.js";
import {
  casillasCambiadas,
  filtroResponsabilidadesDeReunion,
  claveFecha,
  fechasQueFaltan,
  planearEscrituras,
  type CasillaPrevia,
  type RespEntry,
} from "../src/lib/monthly-resp-plan.js";
import { findWeekMeeting } from "../src/lib/meeting-week.js";

const p = new PrismaClient();
let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};
const titulo = (t: string) => console.log(`\n${t}`);

/** Para revertir la transacción a propósito al final. */
class Rollback extends Error {}

const newToken = () => crypto.randomUUID().replace(/-/g, "");
const fechaDe = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
};

// ===========================================================================
//  A. LAS REGLAS, SIN BASE DE DATOS
// ===========================================================================
console.log("A. Reglas de la edición (módulo puro)");

titulo("A1. Qué casillas se mandan al guardar");
{
  const base = {
    dateISO: "2026-11-05",
    day: "JUEVES" as const,
    slotKey: "r_audio",
  };
  const vacio = casillasCambiadas([
    { ...base, valor: "Juan Pérez", guardado: "Juan Pérez" },
  ]);
  check(vacio.length === 0, "lo que no cambió no viaja al servidor");

  const espacios = casillasCambiadas([
    { ...base, valor: "  Juan Pérez  ", guardado: "Juan Pérez" },
  ]);
  check(
    espacios.length === 0,
    "unos espacios de más no cuentan como un cambio",
  );

  const cambiada = casillasCambiadas([
    { ...base, valor: "  Pedro Gómez ", guardado: "Juan Pérez" },
  ]);
  check(cambiada.length === 1, "un nombre distinto sí viaja");
  check(cambiada[0]?.value === "Pedro Gómez", "y viaja ya sin espacios de más");
  check(
    cambiada[0]?.dateISO === "2026-11-05" &&
      cambiada[0]?.day === "JUEVES" &&
      cambiada[0]?.slotKey === "r_audio",
    "con su fecha, su tipo de reunión y su casilla",
  );

  const vaciada = casillasCambiadas([
    { ...base, valor: "   ", guardado: "Juan Pérez" },
  ]);
  check(vaciada.length === 1, "borrar un nombre también es un cambio");
  check(
    vaciada[0]?.value === "",
    "y llega vacío (así se quita al hermano de la responsabilidad)",
  );

  const apagada = casillasCambiadas([
    { ...base, valor: "Otro", guardado: "Juan Pérez", editable: false },
  ]);
  check(
    apagada.length === 0,
    "una casilla que la congregación ya no reparte no se toca",
  );

  const varias = casillasCambiadas([
    { ...base, valor: "Juan Pérez", guardado: "Juan Pérez" },
    { ...base, slotKey: "r_video", valor: "Ana", guardado: "" },
    {
      ...base,
      dateISO: "2026-11-07",
      day: "SABADO",
      slotKey: "r_audio",
      valor: "Luis",
      guardado: "",
    },
  ]);
  check(
    varias.length === 2,
    `de tres casillas solo viajan las dos que cambiaron (${varias.length})`,
  );
  check(
    varias.some((v) => v.day === "SABADO" && v.dateISO === "2026-11-07"),
    "cada una conserva su fecha y su tipo de reunión",
  );
}

titulo("A2. Qué cuenta como «responsabilidad del mes»");
{
  const f = filtroResponsabilidadesDeReunion("m-1");
  check(f.meetingId === "m-1", "el filtro va atado a UNA reunión");
  const secciones = f.OR.flatMap((o) =>
    "section" in o && typeof o.section === "string" ? [o.section] : [],
  );
  check(
    secciones.includes("RESPONSABILIDADES") &&
      secciones.includes("SAB_RESPONSABILIDADES"),
    "cubre las dos secciones: las de siempre y las antiguas del sábado",
  );
  const claves = f.OR.flatMap((o) =>
    "slotKey" in o && o.slotKey ? o.slotKey.in : [],
  );
  check(
    MONTHLY_RESP_KEYS.every((k) => claves.includes(k)),
    `cubre las ${MONTHLY_RESP_KEYS.length} casillas del reparto mensual`,
  );
}

// ===========================================================================
//  B y C. CONTRA LA BASE DE DATOS
// ===========================================================================
console.log("\n\nB y C. Contra la base de datos (y sin dejar rastro)");

/** Una reunión como las que crea la aplicación: programa + responsabilidades. */
async function crearReunion(
  tx: Prisma.TransactionClient,
  cong: string,
  day: "JUEVES" | "SABADO",
  dateISO: string,
  etiqueta: string,
) {
  const programa = slotsForDay(day).map((s, i) => ({
    slotKey: s.key,
    section: s.section,
    label: s.label,
    order: i,
    allowTwo: s.allowTwo,
    equalPair: !!s.equalPair,
    primaryName: `Hermano ${s.key}`,
  }));
  // Las responsabilidades del mes, como las crea createMeetingForDate.
  const resp = MONTHLY_RESPONSIBILITIES.map((r, i) => ({
    slotKey: r.key,
    section: "RESPONSABILIDADES",
    label: r.label,
    order: 100 + i,
    allowTwo: false,
    equalPair: false,
    primaryName: `Encargado ${r.key}`,
  }));
  // slotsForDay ya trae las responsabilidades viejas del sábado; no se
  // repiten las que coincidan de clave.
  const yaEstan = new Set(programa.map((a) => a.slotKey));
  return tx.meeting.create({
    data: {
      congregationId: cong,
      date: fechaDe(dateISO),
      day,
      weekLabel: etiqueta,
      songStart: "100",
      assignments: { create: [...programa, ...resp.filter((r) => !yaEstan.has(r.slotKey))] },
    },
    select: { id: true },
  });
}

try {
  await p.$transaction(
    async (tx) => {
      const sello = Date.now();
      const congA = await tx.congregation.create({
        data: { name: "Prueba RespEditar A", slug: `prueba-respeditar-a-${sello}` },
        select: { id: true },
      });
      const congB = await tx.congregation.create({
        data: { name: "Prueba RespEditar B", slug: `prueba-respeditar-b-${sello}` },
        select: { id: true },
      });

      // -----------------------------------------------------------------
      //  B. Vaciar las responsabilidades de UNA reunión
      // -----------------------------------------------------------------
      const r1 = await crearReunion(tx, congA.id, MEETING_DAYS.SABADO, "2099-03-07", "Semana 1");
      const r2 = await crearReunion(tx, congA.id, MEETING_DAYS.JUEVES, "2099-03-12", "Semana 2");
      const rB = await crearReunion(tx, congB.id, MEETING_DAYS.SABADO, "2099-03-07", "Semana 1");

      const esResp = (a: { section: string; slotKey: string }) =>
        a.section.includes("RESPONSABILIDADES") ||
        MONTHLY_RESP_KEYS.includes(a.slotKey);

      const casillasDe = async (meetingId: string) =>
        tx.meetingAssignment.findMany({
          where: { meetingId },
          select: { slotKey: true, section: true, primaryName: true },
        });

      titulo("B1. Punto de partida");
      const antes1 = await casillasDe(r1.id);
      const respAntes = antes1.filter(esResp).length;
      const programaAntes = antes1.length - respAntes;
      check(respAntes > 0, `la reunión tiene ${respAntes} responsabilidades`);
      check(programaAntes > 0, `y ${programaAntes} casillas de programa`);

      titulo("B2. «Eliminar todas las responsabilidades de esta reunión»");
      const borradas = await tx.meetingAssignment.deleteMany({
        where: filtroResponsabilidadesDeReunion(r1.id),
      });
      check(
        borradas.count === respAntes,
        `borra las ${respAntes} responsabilidades (${borradas.count})`,
      );

      const despues1 = await casillasDe(r1.id);
      check(
        despues1.filter(esResp).length === 0,
        "no queda ninguna responsabilidad en esa reunión",
      );
      check(
        despues1.length === programaAntes,
        `el programa de la reunión sigue entero (${despues1.length} de ${programaAntes})`,
      );
      check(
        despues1.every((a) => (a.primaryName ?? "").startsWith("Hermano ")),
        "y con los mismos hermanos que tenía",
      );

      const sigue = await tx.meeting.findUnique({
        where: { id: r1.id },
        select: { weekLabel: true, songStart: true, day: true },
      });
      check(
        sigue?.weekLabel === "Semana 1" && sigue?.songStart === "100",
        "la reunión no se borra: conserva su semana y sus canciones",
      );

      titulo("B3. Las demás reuniones no se tocan");
      const otra = await casillasDe(r2.id);
      check(
        otra.filter(esResp).length === respAntes,
        `la otra reunión del mes conserva sus ${respAntes} responsabilidades`,
      );
      check(
        otra.filter(esResp).every((a) => (a.primaryName ?? "").startsWith("Encargado ")),
        "con sus encargados intactos",
      );
      const deB = await casillasDe(rB.id);
      check(
        deB.filter(esResp).length === respAntes,
        "y la reunión de OTRA congregación, en la misma fecha, también",
      );

      // -----------------------------------------------------------------
      //  C. Guardar el mes: sincronización con las reuniones
      // -----------------------------------------------------------------
      //  Se repiten los pasos exactos del guardado en lote
      //  (setMonthlyResponsibilities): leer el mes, emparejar por fecha,
      //  crear lo que falte y escribir el plan.
      const clave = MONTHLY_RESPONSIBILITIES[0].key;
      const etiqueta = MONTHLY_RESPONSIBILITIES[0].label;
      const esGrupo = MONTHLY_RESPONSIBILITIES[0].kind === "group";

      const guardarMes = async (entries: RespEntry[]) => {
        const tareas = entries.map((e) => ({
          ...e,
          value: e.value.trim(),
          label: etiqueta,
          esGrupo,
        }));
        const meetings = await tx.meeting.findMany({
          where: { congregationId: congA.id },
          select: {
            id: true,
            date: true,
            day: true,
            weekLabel: true,
            assignments: {
              select: {
                id: true,
                meetingId: true,
                slotKey: true,
                primaryName: true,
                primaryToken: true,
                primaryStatus: true,
              },
            },
          },
        });
        const idPorFecha = new Map<string, string>();
        for (const t of tareas) {
          const k = claveFecha(t.dateISO, t.day);
          if (idPorFecha.has(k)) continue;
          const hallada = findWeekMeeting(meetings, fechaDe(t.dateISO), t.day);
          if (hallada) idPorFecha.set(k, hallada.id);
        }
        const previas: CasillaPrevia[] = meetings.flatMap((m) => m.assignments);
        const faltan = fechasQueFaltan(tareas, idPorFecha);
        const creadas: string[] = [];
        for (const f of faltan) {
          const nueva = await crearReunion(
            tx,
            congA.id,
            f.day,
            f.dateISO,
            `Creada ${f.dateISO}`,
          );
          // Una reunión recién creada nace con las casillas vacías.
          await tx.meetingAssignment.updateMany({
            where: { meetingId: nueva.id },
            data: { primaryName: null },
          });
          idPorFecha.set(claveFecha(f.dateISO, f.day), nueva.id);
          creadas.push(nueva.id);
          previas.push(
            ...(await tx.meetingAssignment.findMany({
              where: { meetingId: nueva.id },
              select: {
                id: true,
                meetingId: true,
                slotKey: true,
                primaryName: true,
                primaryToken: true,
                primaryStatus: true,
              },
            })),
          );
        }
        const plan = planearEscrituras(tareas, idPorFecha, previas, newToken);
        for (const w of plan) {
          const data = {
            section: "RESPONSABILIDADES",
            label: w.label,
            allowTwo: false,
            equalPair: false,
            primaryName: w.primaryName,
            primaryToken: w.primaryToken,
            primaryStatus: w.primaryStatus,
          };
          if (w.assignmentId)
            await tx.meetingAssignment.update({ where: { id: w.assignmentId }, data });
          else
            await tx.meetingAssignment.create({
              data: { ...data, meetingId: w.meetingId, slotKey: w.slotKey, order: 100 },
            });
        }
        return { guardadas: plan.length, creadas };
      };

      titulo("C1. Las reuniones que ya existen se actualizan por su fecha");
      const reunionesAntes = await tx.meeting.count({
        where: { congregationId: congA.id },
      });
      const g1 = await guardarMes([
        { dateISO: "2099-03-12", day: "JUEVES", slotKey: clave, value: "Mario Díaz" },
      ]);
      check(g1.creadas.length === 0, "no se inventa ninguna reunión nueva");
      check(g1.guardadas === 1, `se escribe 1 casilla (${g1.guardadas})`);
      const puesta = await tx.meetingAssignment.findFirst({
        where: { meetingId: r2.id, slotKey: clave },
        select: { primaryName: true, meetingId: true },
      });
      check(
        puesta?.primaryName === "Mario Díaz",
        "el nombre va a la reunión de esa fecha, no a otra",
      );
      check(
        (await tx.meeting.count({ where: { congregationId: congA.id } })) ===
          reunionesAntes,
        "y el número de reuniones no cambia",
      );

      titulo("C2. Las reuniones que faltan se crean");
      const g2 = await guardarMes([
        { dateISO: "2099-03-19", day: "JUEVES", slotKey: clave, value: "Ana Soto" },
        // Una casilla vacía en una fecha sin reunión NO crea nada.
        { dateISO: "2099-03-26", day: "JUEVES", slotKey: clave, value: "   " },
      ]);
      check(g2.creadas.length === 1, `se crea solo 1 reunión (${g2.creadas.length})`);
      const creada = await tx.meeting.findFirst({
        where: { congregationId: congA.id, date: fechaDe("2099-03-19") },
        select: { id: true, day: true, assignments: { select: { slotKey: true, primaryName: true } } },
      });
      check(creada?.day === MEETING_DAYS.JUEVES, "con su tipo de reunión correcto");
      check(
        creada?.assignments.find((a) => a.slotKey === clave)?.primaryName === "Ana Soto",
        "y con el nombre que se escribió",
      );
      check(
        (creada?.assignments.length ?? 0) > MONTHLY_RESP_KEYS.length,
        "la reunión nueva nace con su programa completo, no solo con la casilla",
      );
      check(
        (await tx.meeting.count({
          where: { congregationId: congA.id, date: fechaDe("2099-03-26") },
        })) === 0,
        "una casilla vacía no inventa una reunión que nadie pidió",
      );

      titulo("C3. Guardar dos veces lo mismo no duplica nada");
      const reunionesC3 = await tx.meeting.count({ where: { congregationId: congA.id } });
      const casillasC3 = await tx.meetingAssignment.count({
        where: { meeting: { congregationId: congA.id } },
      });
      // Los enlaces de confirmación de antes: volver a guardar lo mismo no
      // debe emitir unos nuevos (los que ya se enviaron por WhatsApp seguirían
      // funcionando) ni resetear lo que el hermano ya confirmó.
      const enlacesAntes = await tx.meetingAssignment.findMany({
        where: { meeting: { congregationId: congA.id }, slotKey: clave },
        select: { id: true, primaryName: true, primaryToken: true, primaryStatus: true },
        orderBy: { id: "asc" },
      });
      const g3 = await guardarMes([
        { dateISO: "2099-03-12", day: "JUEVES", slotKey: clave, value: "Mario Díaz" },
        { dateISO: "2099-03-19", day: "JUEVES", slotKey: clave, value: "Ana Soto" },
      ]);
      check(g3.creadas.length === 0, "no se crea ninguna reunión repetida");
      const enlacesDespues = await tx.meetingAssignment.findMany({
        where: { meeting: { congregationId: congA.id }, slotKey: clave },
        select: { id: true, primaryName: true, primaryToken: true, primaryStatus: true },
        orderBy: { id: "asc" },
      });
      check(
        JSON.stringify(enlacesAntes) === JSON.stringify(enlacesDespues),
        "los nombres, los enlaces de confirmación y los estados quedan igual",
      );
      check(
        (await tx.meeting.count({ where: { congregationId: congA.id } })) === reunionesC3,
        "el número de reuniones es el mismo",
      );
      check(
        (await tx.meetingAssignment.count({
          where: { meeting: { congregationId: congA.id } },
        })) === casillasC3,
        "y el número de casillas también",
      );

      titulo("C4. Otra congregación nunca se ve afectada");
      const casillasB = await tx.meetingAssignment.findMany({
        where: { meeting: { congregationId: congB.id } },
        select: { slotKey: true, primaryName: true },
      });
      check(
        casillasB.every(
          (a) =>
            (a.primaryName ?? "").startsWith("Hermano ") ||
            (a.primaryName ?? "").startsWith("Encargado "),
        ),
        "ningún nombre de la congregación B cambió",
      );
      check(
        (await tx.meeting.count({ where: { congregationId: congB.id } })) === 1,
        "y sigue teniendo su única reunión",
      );

      titulo("C5. Vaciar una casilla quita al hermano");
      const g4 = await guardarMes([
        { dateISO: "2099-03-12", day: "JUEVES", slotKey: clave, value: "" },
      ]);
      check(g4.guardadas === 1, "se escribe el cambio");
      const vacia = await tx.meetingAssignment.findFirst({
        where: { meetingId: r2.id, slotKey: clave },
        select: { primaryName: true },
      });
      check(
        (vacia?.primaryName ?? null) === null,
        "y la casilla queda sin nadie, sin borrar la fila",
      );

      throw new Rollback();
    },
    { timeout: 60_000 },
  );
} catch (e) {
  if (!(e instanceof Rollback)) throw e;
}

titulo("D. No quedó nada en la base");
const sobrantes = await p.congregation.count({
  where: { name: { startsWith: "Prueba RespEditar " } },
});
check(sobrantes === 0, `ninguna congregación de prueba sobrevivió (${sobrantes})`);

await p.$disconnect();
console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
