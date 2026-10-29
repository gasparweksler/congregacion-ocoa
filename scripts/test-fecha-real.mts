// ============================================================================
//  La fecha que se enseña como "última asignación".
//
//  El fallo: una reunión importada de la planilla guarda el LUNES de su semana
//  (la fila "26 de Octubre a 1 de Noviembre" se guarda como 2026-10-26), así
//  que las estadísticas decían "26 de octubre", un día en que no hubo reunión.
//  La buena es el día configurado de esa semana: el jueves 29.
//
//    npx tsx scripts/test-fecha-real.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";
import { realMeetingDate, weekKey } from "../src/lib/meeting-week.js";
import { weekdayName, weekdayOfMeetingDay } from "../src/lib/constants.js";

let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};
const titulo = (t: string) => console.log(`\n${t}`);
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const JUE_SAB = { midweekDay: 4, weekendDay: 6 };
const MAR_DOM = { midweekDay: 2, weekendDay: 0 };

const real = (stored: Date, day: string, weekLabel: string | null, days = JUE_SAB) =>
  realMeetingDate(stored, day, {
    weekLabel,
    weekday: weekdayOfMeetingDay(day, days),
  });

console.log("LA FECHA REAL DE UNA REUNIÓN\n");

titulo("1. El caso reportado: la semana del 26 de octubre de 2026");
{
  // Lunes 26 de octubre de 2026 con rango: la reunión fue el jueves 29.
  const guardada = new Date(2026, 9, 26, 12, 0, 0);
  check(guardada.getDay() === 1, "la fecha guardada cae en lunes (es el inicio del rango)");
  const r = real(guardada, "JUEVES", "26 de Octubre a 1 de Noviembre");
  check(iso(r) === "2026-10-29", `la real es el jueves 29 (dio ${iso(r)})`);
  check(
    weekdayName(r.getDay()) === "Jueves",
    `y cae en jueves (cae en ${weekdayName(r.getDay())})`,
  );
  check(
    weekKey(r) === weekKey(guardada),
    "sigue siendo la misma semana, no se va a otra",
  );
  check(r.getHours() === 12, "conserva la hora de mediodía con la que se guarda");
}

titulo("2. Las reuniones creadas a mano no se mueven");
{
  // Sin weekLabel la fecha guardada ya es el día exacto.
  const jueves = new Date(2026, 9, 1, 12, 0, 0); // jueves 1 de octubre
  check(
    iso(real(jueves, "JUEVES", null)) === "2026-10-01",
    "un jueves guardado sin rango se queda en su jueves",
  );
  const sabado = new Date(2026, 9, 3, 12, 0, 0);
  check(
    iso(real(sabado, "SABADO", null)) === "2026-10-03",
    "y un sábado en su sábado",
  );
  // Aunque la congregación cambie de días después, lo creado a mano no se toca.
  check(
    iso(real(jueves, "JUEVES", null, MAR_DOM)) === "2026-10-01",
    "ni siquiera si la congregación cambiara sus días",
  );
}

titulo("3. Cada congregación, su propio día");
{
  const lunes = new Date(2026, 9, 26, 12, 0, 0);
  const ocoa = real(lunes, "JUEVES", "26 de Octubre a 1 de Noviembre", JUE_SAB);
  const otra = real(lunes, "JUEVES", "26 de Octubre a 1 de Noviembre", MAR_DOM);
  check(iso(ocoa) === "2026-10-29", `con jueves: ${iso(ocoa)} (${weekdayName(ocoa.getDay())})`);
  check(iso(otra) === "2026-10-27", `con martes: ${iso(otra)} (${weekdayName(otra.getDay())})`);
}

titulo("4. El domingo es el final de la semana, no el principio");
{
  // Semana del lunes 26: su domingo es el 1 de noviembre, no el 25 de octubre.
  const lunes = new Date(2026, 9, 26, 12, 0, 0);
  const dom = real(lunes, "SABADO", "26 de Octubre a 1 de Noviembre", MAR_DOM);
  check(
    iso(dom) === "2026-11-01",
    `el domingo de esa semana es el 1 de noviembre (dio ${iso(dom)})`,
  );
  check(dom > lunes, "y cae después del lunes, no antes");
  const sab = real(lunes, "SABADO", "26 de Octubre a 1 de Noviembre", JUE_SAB);
  check(iso(sab) === "2026-10-31", `el sábado de esa semana es el 31 (dio ${iso(sab)})`);
}

titulo("5. Contra los datos reales de la congregación");
{
  const p = new PrismaClient();
  const cong = await p.congregation.findFirst({
    where: { name: "Ocoa" },
    select: { id: true, midweekDay: true, weekendDay: true },
  });
  if (!cong) {
    console.log("  (no está la congregación Ocoa: se omite)");
  } else {
    const days = { midweekDay: cong.midweekDay, weekendDay: cong.weekendDay };
    const ms = await p.meeting.findMany({
      where: { congregationId: cong.id },
      select: { date: true, day: true, weekLabel: true },
    });
    console.log(`  ${ms.length} reunión(es) guardadas`);

    // Ninguna fecha corregida puede caer en un día que no sea de reunión.
    const malas = ms
      .map((m) => ({
        m,
        r: realMeetingDate(m.date, m.day, {
          weekLabel: m.weekLabel,
          weekday: weekdayOfMeetingDay(m.day, days),
        }),
      }))
      .filter(
        ({ r }) => r.getDay() !== days.midweekDay && r.getDay() !== days.weekendDay,
      );
    check(
      malas.length === 0,
      `todas caen en jueves o sábado tras corregirlas (${malas.length} fuera)`,
    );
    for (const { m, r } of malas.slice(0, 3)) {
      console.log(`     ✗ guardada ${iso(m.date)} -> ${iso(r)} (${weekdayName(r.getDay())})`);
    }

    // Y las que venían de la planilla sí se movieron.
    const conRango = ms.filter((m) => m.weekLabel);
    const moved = conRango.filter(({ date, day, weekLabel }) => {
      const r = realMeetingDate(date, day, {
        weekLabel,
        weekday: weekdayOfMeetingDay(day, days),
      });
      return iso(r) !== iso(date);
    });
    check(
      conRango.length === 0 || moved.length > 0,
      `${moved.length} de ${conRango.length} reunión(es) con rango se corrigieron de día`,
    );
    // El lunes nunca es día de reunión aquí: no debe quedar ninguno.
    const lunes = ms.filter((m) => {
      const r = realMeetingDate(m.date, m.day, {
        weekLabel: m.weekLabel,
        weekday: weekdayOfMeetingDay(m.day, days),
      });
      return r.getDay() === 1;
    });
    check(lunes.length === 0, `ninguna queda en lunes (quedaron ${lunes.length})`);
  }
  await p.$disconnect();
}

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
