// ============================================================================
//  Capitanes de predicación.
//
//  Dos partes:
//    A. Las reglas solas (calendario, horarios, filtros, permisos). Sin base
//       de datos: son las mismas funciones que usan las tres pantallas.
//    B. La base de datos de verdad, con DOS congregaciones a la vez, para
//       comprobar que ninguna ve ni toca lo de la otra, que no se duplican
//       encuestas ni respuestas y que los borrados no se llevan por delante
//       nada más.
//
//  Todo ocurre dentro de una transacción que se revierte al terminar: no
//  queda ni una fila de prueba en la base.
//
//      npm run test:capitanes
// ============================================================================
import { PrismaClient } from "@prisma/client";
import { canUploadCaptain, type SessionUser } from "../src/lib/access.js";
import {
  claveDeHorario,
  claveDeNombre,
  cuentasDelDia,
  diaPasaFiltro,
  errorDeRespuesta,
  esDelMes,
  etiquetaDeDia,
  etiquetaModalidad,
  faltanPorResponder,
  fechaDeISO,
  filtrarRespuestas,
  horarioRepetido,
  isoDeFecha,
  leerSlots,
  limpiarHorario,
  porDia,
  puedePisarDesdeElEnlace,
  rangoDelMes,
  resumenDeDias,
  semanasDelMes,
  serializarSlots,
  type DiaDisponible,
  type RespuestaResumen,
} from "../src/lib/capitanes.js";

const p = new PrismaClient();
let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};
const titulo = (t: string) => console.log(`\n${t}`);
class Rollback extends Error {}

const dia = (
  dateISO: string,
  slots: string[] = ["9:00 a 11:00"],
  houseToHouse = true,
  zoom = false,
): DiaDisponible => ({ dateISO, slots, houseToHouse, zoom });

/**
 * Prueba que una escritura la RECHAZA la base.
 *
 * En Postgres, un error dentro de una transacción la deja inservible, así que
 * el intento se hace dentro de un punto de guardado: si falla (que es lo que
 * se espera), se vuelve a ese punto y la prueba sigue como si nada.
 */
async function laBaseLoRechaza(
  tx: { $executeRawUnsafe: (q: string) => Promise<number> },
  punto: string,
  sentencia: string,
): Promise<boolean> {
  await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
  try {
    await tx.$executeRawUnsafe(sentencia);
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${punto}`);
    return false; // entró: justo lo que NO debía pasar
  } catch {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
    return true;
  }
}

// ===========================================================================
//  A. LAS REGLAS, SIN BASE DE DATOS
// ===========================================================================
console.log("A. Las reglas (módulo puro)");

titulo("A1. El calendario del mes");
{
  // Diciembre de 2026 empieza en martes y tiene 31 días.
  const semanas = semanasDelMes(2026, 12);
  const casillas = semanas.flat();
  const conDia = casillas.filter((c) => c.dia !== null);
  check(conDia.length === 31, `diciembre tiene 31 días (${conDia.length})`);
  check(
    casillas.length % 7 === 0,
    `las semanas están completas (${casillas.length} casillas)`,
  );
  check(
    casillas[0].dia === null && casillas[1].dia === 1,
    "el 1 cae en martes, así que la primera casilla queda en blanco",
  );
  check(
    conDia[0].dateISO === "2026-12-01" && conDia[30].dateISO === "2026-12-31",
    "del 1 al 31, en orden",
  );
  check(
    semanasDelMes(2028, 2).flat().filter((c) => c.dia !== null).length === 29,
    "y febrero de 2028, que es bisiesto, tiene 29",
  );
}

titulo("A2. Un día solo vale si es del mes de la encuesta");
{
  check(esDelMes("2026-12-08", 2026, 12), "el 8 de diciembre, sí");
  check(!esDelMes("2026-11-30", 2026, 12), "el 30 de noviembre, no");
  check(!esDelMes("2027-01-01", 2026, 12), "ni el 1 de enero");
  check(!esDelMes("2026-12-32", 2026, 12), "una fecha inventada tampoco");
  check(!esDelMes("vaya día", 2026, 12), "ni un texto cualquiera");
  check(
    isoDeFecha(fechaDeISO("2026-12-08")) === "2026-12-08",
    "la fecha va y vuelve sin moverse de día",
  );
  check(
    fechaDeISO("2026-12-08").getHours() === 12,
    "se guarda a mediodía, para que ningún huso la cambie de día",
  );

  const r = rangoDelMes(2026, 12);
  check(
    r.gte.getFullYear() === 2026 && r.gte.getMonth() === 11 && r.gte.getDate() === 1,
    "el mes empieza el 1 de diciembre",
  );
  check(
    r.lt.getFullYear() === 2027 && r.lt.getMonth() === 0,
    "y termina justo antes del 1 de enero",
  );
}

titulo("A3. El resumen en palabras");
{
  check(
    resumenDeDias(
      ["2026-12-03", "2026-12-08", "2026-12-12", "2026-12-19"],
      2026,
      12,
    ) === "3, 8, 12 y 19 de diciembre",
    "«3, 8, 12 y 19 de diciembre»",
  );
  check(
    resumenDeDias(["2026-12-05"], 2026, 12) === "5 de diciembre",
    "un solo día no lleva «y»",
  );
  check(
    resumenDeDias(["2026-12-19", "2026-12-03"], 2026, 12) === "3 y 19 de diciembre",
    "y salen ordenados aunque se marquen al revés",
  );
  check(resumenDeDias([], 2026, 12) === "", "sin días, no dice nada");
  check(
    etiquetaDeDia("2026-12-08") === "martes 8",
    `cada día se nombra por su día de la semana (${etiquetaDeDia("2026-12-08")})`,
  );
}

titulo("A4. Los horarios no se repiten");
{
  check(limpiarHorario("  9:00   a 11:00 ") === "9:00 a 11:00", "se limpian los espacios");
  check(
    claveDeHorario("9:00 A 11:00") === claveDeHorario("9:00 a 11:00"),
    "mayúsculas y minúsculas son el mismo horario",
  );
  check(
    horarioRepetido("9:00 a 11:00", ["9:00 A 11:00", "15:00 a 17:00"]),
    "no deja agregar uno que ya está",
  );
  check(
    !horarioRepetido("10:00 a 12:00", ["9:00 a 11:00"]),
    "pero sí uno nuevo",
  );
  check(
    serializarSlots(["9:00 a 11:00", "9:00 a 11:00", " 15:00 a 17:00 "]) ===
      "9:00 a 11:00|15:00 a 17:00",
    "al guardar un día, sus horarios van sin repetir",
  );
  check(
    leerSlots("9:00 a 11:00|15:00 a 17:00").length === 2,
    "y se leen igual que se guardaron",
  );
  check(leerSlots("").length === 0, "un día sin horario no inventa ninguno");
}

titulo("A5. Qué respuestas se aceptan");
{
  check(
    errorDeRespuesta("Jo", [dia("2026-12-08")], 2026, 12) !== null,
    "hace falta un nombre de verdad",
  );
  check(
    errorDeRespuesta("Juan Pérez", [], 2026, 12) !== null,
    "y al menos un día marcado",
  );
  check(
    errorDeRespuesta("Juan Pérez", [dia("2026-11-30")], 2026, 12) !== null,
    "un día de otro mes no entra",
  );
  check(
    errorDeRespuesta(
      "Juan Pérez",
      [dia("2026-12-08"), dia("2026-12-08")],
      2026,
      12,
    ) !== null,
    "ni el mismo día dos veces",
  );
  check(
    errorDeRespuesta(
      "Juan Pérez",
      [dia("2026-12-08", [], false, false)],
      2026,
      12,
    ) !== null,
    "ni un día sin modalidad",
  );
  check(
    errorDeRespuesta("Juan Pérez", [dia("2026-12-08")], 2026, 12) === null,
    "una respuesta normal sí",
  );
  check(
    errorDeRespuesta(
      "Juan Pérez",
      [dia("2026-12-08", [], false, true)],
      2026,
      12,
    ) === null,
    "y solo por Zoom también vale",
  );
  check(
    claveDeNombre("  JUAN  Pérez ") === claveDeNombre("juan perez"),
    "el mismo hermano escrito de dos formas es uno solo",
  );
}

titulo("A6. La modalidad se dice en palabras");
{
  check(
    etiquetaModalidad({ houseToHouse: true, zoom: false }) === "Casa en casa",
    "casa en casa",
  );
  check(
    etiquetaModalidad({ houseToHouse: false, zoom: true }) === "Por Zoom",
    "por Zoom",
  );
  check(
    etiquetaModalidad({ houseToHouse: true, zoom: true }) === "Casa en casa y Zoom",
    "las dos",
  );
}

titulo("A7. Los filtros del Administrador");
{
  const respuestas: RespuestaResumen[] = [
    {
      id: "1",
      name: "Ana",
      userId: null,
      actualizada: new Date(),
      dias: [
        dia("2026-12-08", ["9:00 a 11:00"], true, false),
        dia("2026-12-15", ["15:00 a 17:00"], false, true),
      ],
    },
    {
      id: "2",
      name: "Beto",
      userId: "u2",
      actualizada: new Date(),
      dias: [dia("2026-12-08", ["15:00 a 17:00"], true, true)],
    },
  ];

  check(
    filtrarRespuestas(respuestas, {}).length === 2,
    "sin filtro salen todas",
  );
  check(
    filtrarRespuestas(respuestas, { dateISO: "2026-12-15" }).length === 1,
    "por día, solo quien puede ese día",
  );
  const porHorario = filtrarRespuestas(respuestas, { slot: "9:00 a 11:00" });
  check(
    porHorario.length === 1 && porHorario[0].name === "Ana",
    "por horario, solo quien lo eligió",
  );
  check(
    filtrarRespuestas(respuestas, { modalidad: "zoom" }).length === 2,
    "por Zoom, los dos (Ana un día y Beto otro)",
  );
  const soloZoomDeAna = filtrarRespuestas(respuestas, { modalidad: "zoom" }).find(
    (r) => r.name === "Ana",
  );
  check(
    soloZoomDeAna?.dias.length === 1 && soloZoomDeAna.dias[0].dateISO === "2026-12-15",
    "y de cada hermano se enseñan solo los días que cumplen",
  );
  check(
    !diaPasaFiltro(dia("2026-12-08", ["9:00 a 11:00"], true, false), {
      modalidad: "zoom",
    }),
    "un día de casa en casa no aparece al filtrar por Zoom",
  );

  const agenda = porDia(respuestas);
  check(
    (agenda.get("2026-12-08") ?? []).length === 2,
    "el calendario junta a los dos el día 8",
  );
  check(
    (agenda.get("2026-12-08") ?? [])[0].name === "Ana",
    "y los ordena por nombre",
  );

  const capitanes = [
    { id: "u2", name: "Beto" },
    { id: "u3", name: "Ana" },
    { id: "u4", name: "Carlos" },
  ];
  const faltan = faltanPorResponder(capitanes, respuestas);
  check(
    faltan.length === 1 && faltan[0].name === "Carlos",
    `solo falta Carlos (${faltan.map((f) => f.name).join(", ") || "nadie"})`,
  );
}

titulo("A8. Quién puede subir disponibilidad");
{
  const base: SessionUser = {
    id: "u1",
    username: "hermano",
    name: "Hermano",
    role: "SUPERINTENDENTE",
    groupId: "g1",
    congregationId: "c1",
    congregationName: "Prueba",
    mustChangePassword: false,
    alsoConfirmador: false,
    alsoTerritorios: false,
    alsoCapitan: false,
  };
  check(!canUploadCaptain(base), "sin la casilla, no");
  check(canUploadCaptain({ ...base, alsoCapitan: true }), "con la casilla, sí");
  check(
    canUploadCaptain({ ...base, role: "SECRETARIO" }),
    "y el Administrador siempre",
  );
  check(
    canUploadCaptain({ ...base, role: "RESPONSABLE_CONFIRMACIONES", alsoCapitan: true }),
    "la casilla vale para cualquier rol",
  );
}

titulo("A9. El enlace público no pisa lo que se firmó con la cuenta");
{
  check(puedePisarDesdeElEnlace(null), "si nadie respondió, se guarda");
  check(
    puedePisarDesdeElEnlace({ userId: null }),
    "una respuesta dejada por el enlace sí se puede corregir por el enlace",
  );
  check(
    !puedePisarDesdeElEnlace({ userId: "u9" }),
    "pero una firmada con el usuario, no",
  );
}

titulo("A10. Las cuentas de un día suelto (la ventana del calendario)");
{
  const horarios = ["9:00 a 11:00", "15:00 a 17:00", "19:00 a 20:30"];
  const gente = [
    { name: "Ana", dia: dia("2026-12-08", ["9:00 a 11:00"], true, false) },
    {
      name: "Beto",
      dia: dia("2026-12-08", ["9:00 a 11:00", "19:00 a 20:30"], true, true),
    },
    { name: "Carlos", dia: dia("2026-12-08", [], false, true) },
  ];
  const c = cuentasDelDia(gente, horarios);

  check(c.total === 3, `cuenta los tres hermanos (${c.total})`);
  check(c.casa === 2, `dos van de casa en casa (${c.casa})`);
  check(c.zoom === 2, `dos por Zoom (${c.zoom})`);
  check(c.sinHorario === 1, `uno no puso horario (${c.sinHorario})`);
  check(
    c.porHorario.length === 2,
    "solo salen los horarios que alguien eligió",
  );
  check(
    c.porHorario[0].horario === "9:00 a 11:00" && c.porHorario[0].cuantos === 2,
    "el primero es el de la lista del Administrador, con sus dos hermanos",
  );
  check(
    c.porHorario[1].horario === "19:00 a 20:30" && c.porHorario[1].cuantos === 1,
    "y después el otro, con uno",
  );

  // Un horario que el Administrador quitó después no puede desaparecer de lo
  // que contestó el hermano.
  const viejo = cuentasDelDia(
    [{ name: "Ana", dia: dia("2026-12-08", ["7:00 a 8:00"], true, false) }],
    horarios,
  );
  check(
    viejo.porHorario.length === 1 && viejo.porHorario[0].horario === "7:00 a 8:00",
    "un horario ya borrado de la lista se sigue viendo",
  );

  const vacio = cuentasDelDia([], horarios);
  check(
    vacio.total === 0 && vacio.porHorario.length === 0 && vacio.casa === 0,
    "un día sin nadie no inventa cuentas",
  );
}

// ===========================================================================
//  B. LA BASE DE DATOS, CON DOS CONGREGACIONES
// ===========================================================================
console.log("\n\nB. La base de datos (dos congregaciones a la vez)");

try {
  await p.$transaction(
    async (tx) => {
      const sello = Date.now();
      const congA = await tx.congregation.create({
        data: { name: "Prueba Capitanes A", slug: `prueba-cap-a-${sello}` },
        select: { id: true },
      });
      const congB = await tx.congregation.create({
        data: { name: "Prueba Capitanes B", slug: `prueba-cap-b-${sello}` },
        select: { id: true },
      });

      // --- Horarios ------------------------------------------------------
      titulo("B1. Los horarios son de cada congregación");
      await tx.captainTimeSlot.createMany({
        data: [
          { congregationId: congA.id, label: "9:00 a 11:00", order: 0 },
          { congregationId: congA.id, label: "15:00 a 17:00", order: 1 },
          { congregationId: congB.id, label: "10:00 a 12:00", order: 0 },
        ],
      });
      const horariosA = await tx.captainTimeSlot.findMany({
        where: { congregationId: congA.id },
        select: { label: true },
      });
      check(horariosA.length === 2, `la A tiene sus 2 horarios (${horariosA.length})`);
      check(
        !horariosA.some((h) => h.label === "10:00 a 12:00"),
        "y no ve el de la B",
      );

      const repetido = await laBaseLoRechaza(
        tx,
        "sp_horario",
        `INSERT INTO "CaptainTimeSlot" ("id","congregationId","label","order","createdAt","updatedAt")
           VALUES ('dup-${sello}', '${congA.id}', '9:00 a 11:00', 5, NOW(), NOW())`,
      );
      check(repetido, "la base impide dos horarios iguales en la misma congregación");

      // --- Encuestas -----------------------------------------------------
      titulo("B2. Una encuesta por mes, con su propio enlace");
      const encA = await tx.captainSurvey.create({
        data: {
          congregationId: congA.id,
          year: 2026,
          month: 12,
          token: `tokena${sello}`,
        },
        select: { id: true, token: true },
      });
      const encB = await tx.captainSurvey.create({
        data: {
          congregationId: congB.id,
          year: 2026,
          month: 12,
          token: `tokenb${sello}`,
        },
        select: { id: true, token: true },
      });
      check(
        encA.token !== encB.token,
        "dos congregaciones pueden tener el mismo mes con enlaces distintos",
      );

      const dosVeces = await laBaseLoRechaza(
        tx,
        "sp_encuesta",
        `INSERT INTO "CaptainSurvey" ("id","congregationId","year","month","token","open","createdAt","updatedAt")
           VALUES ('dup2-${sello}', '${congA.id}', 2026, 12, 'otro${sello}', true, NOW(), NOW())`,
      );
      check(dosVeces, "pero la misma congregación no abre dos veces el mismo mes");

      // Buscar por el enlace solo encuentra la suya.
      const porToken = await tx.captainSurvey.findUnique({
        where: { token: encB.token },
        select: { congregationId: true },
      });
      check(
        porToken?.congregationId === congB.id,
        "el enlace lleva exactamente a la encuesta de su congregación",
      );

      // --- Respuestas ----------------------------------------------------
      titulo("B3. Las respuestas, con sus días, horarios y modalidad");
      const guardar = async (
        surveyId: string,
        congregationId: string,
        name: string,
        dias: DiaDisponible[],
        userId: string | null = null,
      ) => {
        const r = await tx.captainResponse.create({
          data: {
            surveyId,
            congregationId,
            name,
            nameKey: claveDeNombre(name),
            userId,
          },
          select: { id: true },
        });
        await tx.captainResponseDay.createMany({
          data: dias.map((d) => ({
            responseId: r.id,
            date: fechaDeISO(d.dateISO),
            slots: serializarSlots(d.slots),
            houseToHouse: d.houseToHouse,
            zoom: d.zoom,
          })),
        });
        return r.id;
      };

      const ana = await guardar(encA.id, congA.id, "Ana Torres", [
        dia("2026-12-08", ["9:00 a 11:00"], true, false),
        dia("2026-12-15", ["15:00 a 17:00"], false, true),
      ]);
      await guardar(
        encA.id,
        congA.id,
        "Beto Ruiz",
        [dia("2026-12-08", ["15:00 a 17:00"], true, true)],
        null,
      );
      await guardar(encB.id, congB.id, "Carla Soto", [
        dia("2026-12-08", ["10:00 a 12:00"], true, false),
      ]);

      const deA = await tx.captainResponse.findMany({
        where: { surveyId: encA.id, congregationId: congA.id },
        select: {
          name: true,
          days: { select: { date: true, slots: true, houseToHouse: true, zoom: true } },
        },
      });
      check(deA.length === 2, `la A recibe 2 respuestas (${deA.length})`);
      check(
        !deA.some((r) => r.name === "Carla Soto"),
        "y ninguna de la congregación B se cuela",
      );

      const anaLeida = deA.find((r) => r.name === "Ana Torres");
      const dia15 = anaLeida?.days.find((d) => isoDeFecha(d.date) === "2026-12-15");
      check(
        dia15?.zoom === true && dia15?.houseToHouse === false,
        "cada día guarda su propia modalidad",
      );
      check(
        leerSlots(dia15?.slots ?? "")[0] === "15:00 a 17:00",
        "y su propio horario",
      );
      const dia8 = anaLeida?.days.find((d) => isoDeFecha(d.date) === "2026-12-08");
      check(
        leerSlots(dia8?.slots ?? "")[0] === "9:00 a 11:00",
        "distinto del de otro día del mismo hermano",
      );

      titulo("B4. El mismo hermano no se guarda dos veces");
      const duplicada = await laBaseLoRechaza(
        tx,
        "sp_respuesta",
        `INSERT INTO "CaptainResponse" ("id","surveyId","congregationId","name","nameKey","createdAt","updatedAt")
           VALUES ('dup3-${sello}', '${encA.id}', '${congA.id}', 'ANA TORRES', '${claveDeNombre("Ana Torres")}', NOW(), NOW())`,
      );
      check(duplicada, "la base rechaza una segunda respuesta del mismo nombre");
      check(
        (await tx.captainResponse.count({ where: { surveyId: encA.id } })) === 2,
        "siguen siendo 2 respuestas",
      );

      titulo("B5. Corregir una respuesta cambia solo sus días");
      await tx.captainResponseDay.deleteMany({ where: { responseId: ana } });
      await tx.captainResponseDay.createMany({
        data: [
          {
            responseId: ana,
            date: fechaDeISO("2026-12-22"),
            slots: serializarSlots(["9:00 a 11:00"]),
            houseToHouse: true,
            zoom: false,
          },
        ],
      });
      const anaAhora = await tx.captainResponseDay.findMany({
        where: { responseId: ana },
        select: { date: true },
      });
      check(
        anaAhora.length === 1 && isoDeFecha(anaAhora[0].date) === "2026-12-22",
        "Ana queda con el día nuevo y sin los viejos",
      );
      check(
        (await tx.captainResponse.count({ where: { surveyId: encA.id } })) === 2,
        "y Beto sigue ahí",
      );

      titulo("B6. Borrar una respuesta no toca nada más");
      const beto = await tx.captainResponse.findFirst({
        where: { surveyId: encA.id, name: "Beto Ruiz" },
        select: { id: true },
      });
      await tx.captainResponse.delete({ where: { id: beto!.id } });
      check(
        (await tx.captainResponseDay.count({ where: { responseId: beto!.id } })) === 0,
        "se van también sus días",
      );
      check(
        (await tx.captainResponse.count({ where: { surveyId: encA.id } })) === 1,
        "queda la de Ana",
      );
      check(
        (await tx.captainResponse.count({ where: { surveyId: encB.id } })) === 1,
        "y la congregación B, intacta",
      );

      titulo("B7. Borrar la encuesta se lleva solo lo suyo");
      await tx.captainSurvey.delete({ where: { id: encA.id } });
      check(
        (await tx.captainResponse.count({ where: { congregationId: congA.id } })) === 0,
        "sus respuestas se van con ella",
      );
      check(
        (await tx.captainResponseDay.count({ where: { responseId: ana } })) === 0,
        "y los días de esas respuestas",
      );
      check(
        (await tx.captainTimeSlot.count({ where: { congregationId: congA.id } })) === 2,
        "los horarios de la congregación NO se tocan",
      );
      check(
        (await tx.captainSurvey.count({ where: { congregationId: congB.id } })) === 1,
        "ni la encuesta de la otra congregación",
      );
      check(
        (await tx.captainResponse.count({ where: { congregationId: congB.id } })) === 1,
        "ni sus respuestas",
      );
      check(
        (await tx.user.count({ where: { congregationId: congA.id } })) === 0 &&
          (await tx.congregation.count({ where: { id: congA.id } })) === 1,
        "ni los usuarios ni la congregación",
      );

      throw new Rollback();
    },
    { timeout: 30000 },
  );
} catch (e) {
  if (!(e instanceof Rollback)) throw e;
}

titulo("C. No quedó nada en la base");
{
  const sobras = await p.congregation.count({
    where: { slug: { startsWith: "prueba-cap-" } },
  });
  check(sobras === 0, `ninguna congregación de prueba sobrevivió (${sobras})`);
}

await p.$disconnect();
console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
