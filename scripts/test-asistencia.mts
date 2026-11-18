// ============================================================================
//  Asistencia a las reuniones (registro S-88).
//
//  A. Las reglas, sin base de datos: el año de servicio (septiembre a
//     agosto), qué entra en los promedios y qué se puede escribir en la
//     casilla de asistencia.
//  B. Contra la base REAL: cada congregación ve y borra SOLO lo suyo, el mes
//     y el año de servicio borran exactamente su período, y la misma fecha no
//     se puede anotar dos veces.
//
//  Todo ocurre dentro de una transacción que se revierte al terminar: no
//  queda ni una fila de prueba en la base.
//
//      npm run test:asistencia
// ============================================================================
import { PrismaClient, type Prisma } from "@prisma/client";
import {
  anioDeServicio,
  aniosDeServicioOpciones,
  etiquetaAnioDeServicio,
  filasDelMes,
  mesesDelAnioDeServicio,
  parseAsistencia,
  promedioDe,
  promediosDelMes,
  rangoDelAnioDeServicio,
  rangoDelMes,
  soloEnteros,
  type FilaAsistencia,
} from "../src/lib/asistencia.js";
import { MEETING_DAYS } from "../src/lib/constants.js";

const p = new PrismaClient();
let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};
const titulo = (t: string) => console.log(`\n${t}`);

/** Para revertir la transacción a propósito al final. */
class Rollback extends Error {}

const fila = (
  dateISO: string,
  day: "JUEVES" | "SABADO",
  count: number | null,
  held = true,
): FilaAsistencia => ({ dateISO, day, held, count, note: "" });

// ===========================================================================
//  A. LAS REGLAS, SIN BASE DE DATOS
// ===========================================================================
console.log("A. Reglas de la asistencia (módulo puro)");

titulo("A1. El año de servicio va de septiembre a agosto");
{
  check(anioDeServicio(2026, 9) === 2027, "septiembre de 2026 es del año de servicio 2027");
  check(anioDeServicio(2026, 12) === 2027, "diciembre de 2026 también");
  check(anioDeServicio(2027, 1) === 2027, "enero de 2027 sigue siendo 2027");
  check(anioDeServicio(2027, 8) === 2027, "agosto de 2027 lo cierra");
  check(anioDeServicio(2027, 9) === 2028, "y septiembre de 2027 ya es 2028");

  const meses = mesesDelAnioDeServicio(2027);
  check(meses.length === 12, `son 12 meses (${meses.length})`);
  check(
    meses[0].year === 2026 && meses[0].month === 9,
    "el primero es septiembre de 2026",
  );
  check(
    meses[11].year === 2027 && meses[11].month === 8,
    "y el último, agosto de 2027",
  );
  check(
    etiquetaAnioDeServicio(2027) === "Septiembre de 2026 a agosto de 2027",
    "la etiqueta lo dice con todas las letras",
  );

  const r = rangoDelAnioDeServicio(2027);
  check(
    r.gte.getFullYear() === 2026 && r.gte.getMonth() === 8 && r.gte.getDate() === 1,
    "el período empieza el 1 de septiembre de 2026",
  );
  check(
    r.lt.getFullYear() === 2027 && r.lt.getMonth() === 8 && r.lt.getDate() === 1,
    "y termina justo antes del 1 de septiembre de 2027",
  );

  const opciones = aniosDeServicioOpciones(new Date(2026, 10, 18));
  check(
    opciones[0] === 2028 && opciones.includes(2027),
    "el selector ofrece el año que viene y el actual",
  );
}

titulo("A2. La casilla de asistencia solo admite números enteros");
{
  check(soloEnteros("85") === "85", "un número pasa tal cual");
  check(soloEnteros("8a5") === "85", "las letras no entran");
  check(soloEnteros("-3") === "3", "el signo menos no entra");
  check(soloEnteros("8,5") === "85", "ni las comas ni los puntos");
  check(soloEnteros("1234567") === "12345", "y hay un tope de cinco cifras");

  check(parseAsistencia("") === null, "una casilla vacía queda sin anotar");
  check(parseAsistencia("  ") === null, "y unos espacios, también");
  check(parseAsistencia("85") === 85, "un entero se guarda como número");
  check(parseAsistencia("0") === 0, "el cero es un valor válido");
  check(parseAsistencia("8.5") === "mal", "un decimal se rechaza");
  check(parseAsistencia("-3") === "mal", "un negativo se rechaza");
  check(parseAsistencia("abc") === "mal", "y las letras, también");
}

titulo("A3. Los promedios dejan fuera lo que no cuenta");
{
  const filas = [
    fila("2026-11-05", "JUEVES", 100),
    fila("2026-11-12", "JUEVES", 110),
    fila("2026-11-19", "JUEVES", null), // sin anotar
    fila("2026-11-26", "JUEVES", 999, false), // suspendida
    fila("2026-11-07", "SABADO", 150),
    fila("2026-11-14", "SABADO", 160),
  ];
  const p = promediosDelMes(filas);
  check(
    p.entreSemana.reuniones === 2 && p.entreSemana.promedio === 105,
    `entre semana: 2 reuniones, promedio 105 (${p.entreSemana.reuniones}, ${p.entreSemana.promedio})`,
  );
  check(
    p.finDeSemana.reuniones === 2 && p.finDeSemana.promedio === 155,
    `fin de semana: 2 reuniones, promedio 155 (${p.finDeSemana.reuniones}, ${p.finDeSemana.promedio})`,
  );
  check(
    p.todas.reuniones === 4 && p.todas.promedio === 130,
    `todas: 4 reuniones, promedio 130 (${p.todas.reuniones}, ${p.todas.promedio})`,
  );
  check(
    !JSON.stringify(p).includes("999"),
    "una reunión suspendida no entra en ninguna cuenta",
  );

  const vacio = promedioDe([fila("2026-11-05", "JUEVES", null)]);
  check(
    vacio.promedio === null && vacio.reuniones === 0,
    "sin asistencias anotadas no hay promedio (ni se divide por cero)",
  );

  const redondeo = promedioDe([
    fila("2026-11-05", "JUEVES", 100),
    fila("2026-11-12", "JUEVES", 101),
  ]);
  check(redondeo.promedio === 101, `el promedio se redondea (${redondeo.promedio})`);
}

titulo("A4. Las fechas salen de los días de reunión configurados");
{
  // Miércoles (3) y sábado (6), noviembre de 2026.
  const filas = filasDelMes(2026, 11, { midweekDay: 3, weekendDay: 6 }, []);
  const miercoles = filas.filter((f) => f.day === MEETING_DAYS.JUEVES);
  const sabados = filas.filter((f) => f.day === MEETING_DAYS.SABADO);
  check(miercoles.length === 4, `cuatro miércoles en noviembre de 2026 (${miercoles.length})`);
  check(sabados.length === 4, `y cuatro sábados (${sabados.length})`);
  check(
    miercoles[0].dateISO === "2026-11-04",
    `el primer miércoles es el 4 (${miercoles[0].dateISO})`,
  );
  check(
    filas.every((f) => f.held && f.count === null),
    "todas nacen en «Sí» y sin asistencia anotada",
  );
  check(
    filas.map((f) => f.dateISO).join() ===
      [...filas].map((f) => f.dateISO).sort().join(),
    "y salen en orden de fecha",
  );

  // Cambiar el día de reunión no puede borrar lo ya anotado.
  const guardadas = [fila("2026-11-05", "JUEVES", 97)]; // un jueves de antes
  const conHistoria = filasDelMes(2026, 11, { midweekDay: 3, weekendDay: 6 }, guardadas);
  check(
    conHistoria.length === filas.length + 1,
    "lo anotado en un día que ya no toca sigue a la vista",
  );
  check(
    conHistoria.find((f) => f.dateISO === "2026-11-05")?.count === 97,
    "con su asistencia intacta",
  );

  // Lo guardado manda sobre la fila en blanco.
  const conDatos = filasDelMes(2026, 11, { midweekDay: 3, weekendDay: 6 }, [
    fila("2026-11-04", "JUEVES", 88, false),
  ]);
  const cuatro = conDatos.find((f) => f.dateISO === "2026-11-04");
  check(
    cuatro?.count === 88 && cuatro?.held === false,
    "y una fecha ya anotada no se pisa con una fila en blanco",
  );
}

// ===========================================================================
//  B. CONTRA LA BASE DE DATOS
// ===========================================================================
console.log("\n\nB. Contra la base de datos (y sin dejar rastro)");

async function anotar(
  tx: Prisma.TransactionClient,
  cong: string,
  dateISO: string,
  day: "JUEVES" | "SABADO",
  count: number | null,
  held = true,
) {
  const [y, m, d] = dateISO.split("-").map(Number);
  return tx.meetingAttendance.create({
    data: {
      congregationId: cong,
      date: new Date(y, m - 1, d, 12, 0, 0),
      day,
      held,
      count,
      note: "",
    },
    select: { id: true },
  });
}

try {
  await p.$transaction(
    async (tx) => {
      const sello = Date.now();
      const congA = await tx.congregation.create({
        data: { name: "Prueba Asistencia A", slug: `prueba-asis-a-${sello}` },
        select: { id: true },
      });
      const congB = await tx.congregation.create({
        data: { name: "Prueba Asistencia B", slug: `prueba-asis-b-${sello}` },
        select: { id: true },
      });

      // Congregación A: noviembre de 2026 (año de servicio 2027) y un mes de
      // fuera del año de servicio, para comprobar los bordes.
      await anotar(tx, congA.id, "2026-11-05", "JUEVES", 100);
      await anotar(tx, congA.id, "2026-11-12", "JUEVES", 110);
      await anotar(tx, congA.id, "2026-11-07", "SABADO", 150);
      await anotar(tx, congA.id, "2026-11-14", "SABADO", 160);
      await anotar(tx, congA.id, "2026-12-03", "JUEVES", 120);
      await anotar(tx, congA.id, "2026-08-06", "JUEVES", 90); // año de servicio 2026
      await anotar(tx, congA.id, "2027-09-02", "JUEVES", 95); // año de servicio 2028
      // Congregación B: las mismas fechas, otros números.
      await anotar(tx, congB.id, "2026-11-05", "JUEVES", 500);
      await anotar(tx, congB.id, "2026-11-07", "SABADO", 600);

      const delMes = async (cong: string, year: number, month: number) =>
        tx.meetingAttendance.findMany({
          where: { congregationId: cong, date: rangoDelMes(year, month) },
          select: { date: true, day: true, held: true, count: true, note: true },
          orderBy: { date: "asc" },
        });

      titulo("B1. Cada congregación ve solo lo suyo");
      const noviembreA = await delMes(congA.id, 2026, 11);
      const noviembreB = await delMes(congB.id, 2026, 11);
      check(noviembreA.length === 4, `la congregación A tiene 4 reuniones anotadas (${noviembreA.length})`);
      check(noviembreB.length === 2, `y la B, 2 (${noviembreB.length})`);
      check(
        !noviembreA.some((f) => (f.count ?? 0) >= 500),
        "ningún número de la B se cuela en la A",
      );

      titulo("B2. Los promedios se calculan solo con lo de cada una");
      const aFilas: FilaAsistencia[] = noviembreA.map((f) => ({
        dateISO: f.date.toISOString().slice(0, 10),
        day: f.day === "SABADO" ? "SABADO" : "JUEVES",
        held: f.held,
        count: f.count,
        note: f.note,
      }));
      const promA = promediosDelMes(aFilas);
      check(promA.entreSemana.promedio === 105, `A: entre semana 105 (${promA.entreSemana.promedio})`);
      check(promA.finDeSemana.promedio === 155, `A: fin de semana 155 (${promA.finDeSemana.promedio})`);
      check(promA.todas.promedio === 130, `A: todas 130 (${promA.todas.promedio})`);

      titulo("B3. La misma fecha no se puede anotar dos veces");
      const [y, m, d] = [2026, 11, 5];
      await tx.meetingAttendance.upsert({
        where: {
          congregationId_date_day: {
            congregationId: congA.id,
            date: new Date(y, m - 1, d, 12, 0, 0),
            day: "JUEVES",
          },
        },
        create: {
          congregationId: congA.id,
          date: new Date(y, m - 1, d, 12, 0, 0),
          day: "JUEVES",
          held: true,
          count: 101,
          note: "corregido",
        },
        update: { count: 101, note: "corregido" },
      });
      const tras = await delMes(congA.id, 2026, 11);
      check(tras.length === 4, `siguen siendo 4 filas, no 5 (${tras.length})`);
      check(
        tras.find((f) => f.date.getDate() === 5)?.count === 101,
        "y la corrección pisó el valor anterior",
      );

      titulo("B4. Borrar un mes borra ese mes y nada más");
      const borradoMes = await tx.meetingAttendance.deleteMany({
        where: { congregationId: congA.id, date: rangoDelMes(2026, 11) },
      });
      check(borradoMes.count === 4, `se borran las 4 de noviembre (${borradoMes.count})`);
      check(
        (await delMes(congA.id, 2026, 12)).length === 1,
        "diciembre de la A sigue entero",
      );
      check(
        (await delMes(congB.id, 2026, 11)).length === 2,
        "y noviembre de la congregación B, intacto",
      );

      titulo("B5. Borrar un año de servicio borra de septiembre a agosto");
      // Se vuelve a anotar noviembre para tener algo dentro del período.
      await anotar(tx, congA.id, "2026-11-05", "JUEVES", 100);
      const antes = await tx.meetingAttendance.count({
        where: { congregationId: congA.id },
      });
      const borradoAnio = await tx.meetingAttendance.deleteMany({
        where: { congregationId: congA.id, date: rangoDelAnioDeServicio(2027) },
      });
      check(
        borradoAnio.count === 2,
        `se borran las 2 del año de servicio 2027: noviembre y diciembre (${borradoAnio.count})`,
      );
      const quedan = await tx.meetingAttendance.findMany({
        where: { congregationId: congA.id },
        select: { date: true },
        orderBy: { date: "asc" },
      });
      check(
        quedan.length === antes - 2,
        `queda lo de fuera del período (${quedan.length} de ${antes})`,
      );
      check(
        quedan.some((f) => f.date.getFullYear() === 2026 && f.date.getMonth() === 7),
        "agosto de 2026 (año de servicio 2026) no se toca",
      );
      check(
        quedan.some((f) => f.date.getFullYear() === 2027 && f.date.getMonth() === 8),
        "y septiembre de 2027 (año de servicio 2028), tampoco",
      );
      check(
        (await tx.meetingAttendance.count({ where: { congregationId: congB.id } })) === 2,
        "la congregación B sigue con sus 2 anotaciones",
      );

      titulo("B6. Borrar la asistencia no toca nada más");
      check(
        (await tx.congregation.count({
          where: { id: { in: [congA.id, congB.id] } },
        })) === 2,
        "las dos congregaciones siguen ahí",
      );

      throw new Rollback();
    },
    { timeout: 60_000 },
  );
} catch (e) {
  if (!(e instanceof Rollback)) throw e;
}

titulo("C. No quedó nada en la base");
const sobrantes = await p.congregation.count({
  where: { name: { startsWith: "Prueba Asistencia " } },
});
check(sobrantes === 0, `ninguna congregación de prueba sobrevivió (${sobrantes})`);

await p.$disconnect();
console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
