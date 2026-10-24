// ============================================================================
//  Reparto automático de responsabilidades: los escenarios que importan.
//
//   1. Caso normal: se cubre todo, sin conflictos y repartido.
//   2. Nadie hace dos cosas en la misma reunión (regla que no se incumple).
//   3. Quien ya tiene una PARTE no recibe responsabilidad... salvo que no haya
//      más remedio, y entonces se informa del conflicto con su parte.
//   4. Sin nadie registrado, el puesto queda sin cubrir y se dice por qué.
//   5. Disponibilidad escasa: se cubre lo que se puede y se informa del resto.
//   6. Quien está en varias categorías: su carga suma todas.
//   7. Se respeta la carga previa del mes.
//   8. El azar varía el reparto, pero con la misma semilla sale igual.
//
//  No toca la base de datos.
//    npx tsx scripts/test-asignacion-automatica.mts
// ============================================================================
import {
  autoAssign,
  makeRandom,
  type Candidate,
  type MeetingContext,
  type Position,
} from "../src/lib/resp-auto-assign.js";

let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};

const FECHAS = ["2026-11-05", "2026-11-12", "2026-11-19", "2026-11-26"];

/** Las 6 casillas de publicador de una fecha. */
function posiciones(fechas: string[]): Position[] {
  const slots: [string, string, string][] = [
    ["r_acom_entrada", "Acomodador de Entrada", "ACOMODADORES"],
    ["r_acom_auditorio", "Acomodador de Auditorio", "ACOMODADORES"],
    ["r_microfono", "Pasa Micrófono 1", "MICROFONO"],
    ["r_microfono_2", "Pasa Micrófono 2", "MICROFONO"],
    ["r_acom_plataforma", "Acomodador de Plataforma", "PLATAFORMA"],
    ["r_audio", "Audio", "AUDIO"],
    ["r_video", "Video", "VIDEO"],
  ];
  return fechas.flatMap((dateISO) =>
    slots.map(([slotKey, slotLabel, category]) => ({
      dateISO,
      day: "JUEVES" as const,
      slotKey,
      slotLabel,
      category,
    })),
  );
}

function reuniones(
  fechas: string[],
  partes: Record<string, Record<string, string>> = {},
): MeetingContext[] {
  return fechas.map((dateISO) => {
    const p = partes[dateISO] ?? {};
    return {
      dateISO,
      label: dateISO,
      partNames: Object.keys(p),
      respNames: [],
      partLabelByName: Object.fromEntries(
        Object.entries(p).map(([n, etiqueta]) => [
          n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim(),
          etiqueta,
        ]),
      ),
    };
  });
}

function hermano(
  name: string,
  categories: string[],
  loadBefore = 0,
): Candidate {
  return { publisherId: name.toLowerCase().replace(/\s+/g, "-"), name, categories, loadBefore };
}

// --- 1. Caso normal -------------------------------------------------------
console.log("1. Caso normal: gente de sobra");
{
  const cands = [
    ...["Ana", "Beto", "Caro", "Dani", "Eva", "Fito"].map((n) => hermano(n, ["ACOMODADORES"])),
    ...["Gabi", "Hugo", "Iván", "Juli"].map((n) => hermano(n, ["MICROFONO"])),
    ...["Keti", "Luis"].map((n) => hermano(n, ["PLATAFORMA"])),
    ...["Mara", "Nico"].map((n) => hermano(n, ["AUDIO"])),
    ...["Olga", "Pepe"].map((n) => hermano(n, ["VIDEO"])),
  ];
  const r = autoAssign(posiciones(FECHAS), reuniones(FECHAS), cands, makeRandom(7));
  check(r.uncovered.length === 0, `no queda nada sin cubrir (${r.uncovered.length})`);
  check(r.proposals.length === 28, `se cubren las 28 casillas (${r.proposals.length})`);
  check(r.proposals.every((p) => !p.conflict), "sin conflictos");
  // Equidad: entre los de una misma categoría, la diferencia no pasa de 1.
  const acom = r.loads.filter((l) => ["Ana","Beto","Caro","Dani","Eva","Fito"].includes(l.name));
  const dif = Math.max(...acom.map((a) => a.total)) - Math.min(...acom.map((a) => a.total));
  check(dif <= 1, `reparto equilibrado entre acomodadores (diferencia ${dif})`);
}

// --- 2. Nadie hace dos cosas en la misma reunión ---------------------------
console.log("\n2. Nadie dos veces en la misma reunión");
{
  // Solo dos acomodadores para dos casillas: uno en cada una, nunca repetido.
  const cands = [
    ...["Ana", "Beto"].map((n) => hermano(n, ["ACOMODADORES"])),
    ...["Gabi", "Hugo"].map((n) => hermano(n, ["MICROFONO"])),
    hermano("Keti", ["PLATAFORMA"]),
    hermano("Mara", ["AUDIO"]),
    hermano("Olga", ["VIDEO"]),
  ];
  const r = autoAssign(posiciones(FECHAS), reuniones(FECHAS), cands, makeRandom(3));
  let repetidos = 0;
  for (const f of FECHAS) {
    const nombres = r.proposals.filter((p) => p.dateISO === f).map((p) => p.name);
    if (new Set(nombres).size !== nombres.length) repetidos++;
  }
  check(repetidos === 0, `ninguna reunión repite a un hermano (${repetidos})`);
}

// --- 3. Conflicto con una parte -------------------------------------------
console.log("\n3. Conflicto con una parte de la reunión");
{
  // Un solo hermano de audio, y justo tiene una parte esa semana.
  const partes = { "2026-11-05": { Mara: "3. Lectura de la Biblia (4 mins.)" } };
  const cands = [
    ...["Ana", "Beto"].map((n) => hermano(n, ["ACOMODADORES"])),
    ...["Gabi", "Hugo"].map((n) => hermano(n, ["MICROFONO"])),
    hermano("Keti", ["PLATAFORMA"]),
    hermano("Mara", ["AUDIO"]),
    hermano("Olga", ["VIDEO"]),
  ];
  const r = autoAssign(
    posiciones(["2026-11-05"]),
    reuniones(["2026-11-05"], partes),
    cands,
    makeRandom(11),
  );
  const audio = r.proposals.find((p) => p.slotKey === "r_audio");
  check(audio?.name === "Mara", "se asigna igualmente (no se deja el puesto vacío)");
  check(audio?.conflict === true, "pero se marca como conflicto");
  check(
    audio?.conflictWith === "3. Lectura de la Biblia (4 mins.)",
    `y se dice con qué parte choca: «${audio?.conflictWith}»`,
  );

  // Con otro hermano de audio libre, se prefiere al que no tiene parte.
  const r2 = autoAssign(
    posiciones(["2026-11-05"]),
    reuniones(["2026-11-05"], partes),
    [...cands, hermano("Nico", ["AUDIO"])],
    makeRandom(11),
  );
  const audio2 = r2.proposals.find((p) => p.slotKey === "r_audio");
  check(audio2?.name === "Nico", "con alternativa libre, se elige a quien no tiene parte");
  check(audio2?.conflict === false, "y no hay conflicto");
}

// --- 4. Categoría sin nadie -----------------------------------------------
console.log("\n4. Una categoría sin hermanos registrados");
{
  const cands = [
    ...["Ana", "Beto"].map((n) => hermano(n, ["ACOMODADORES"])),
    hermano("Gabi", ["MICROFONO"]),
  ];
  const r = autoAssign(posiciones(["2026-11-05"]), reuniones(["2026-11-05"]), cands, makeRandom(5));
  const sinCubrir = r.uncovered.map((u) => u.slotKey).sort();
  check(
    sinCubrir.includes("r_audio") && sinCubrir.includes("r_video") && sinCubrir.includes("r_acom_plataforma"),
    `quedan sin cubrir audio, vídeo y plataforma (${sinCubrir.join(", ")})`,
  );
  check(
    ["r_audio", "r_video", "r_acom_plataforma"].every((s) =>
      r.uncovered.find((u) => u.slotKey === s)?.reason.includes("No hay ningún hermano registrado"),
    ),
    "y en esas tres se explica que no hay nadie registrado",
  );
  // Micrófono 2 también: solo hay un hermano y ya está en Micrófono 1.
  check(
    sinCubrir.includes("r_microfono_2"),
    "con un solo hermano de micrófono, la segunda casilla queda libre",
  );
  check(
    !!r.uncovered
      .find((u) => u.slotKey === "r_microfono_2")
      ?.reason.includes("ya tienen algo"),
    "explicando que ya tiene algo en esa reunión",
  );
}

// --- 5. Disponibilidad escasa ---------------------------------------------
console.log("\n5. Disponibilidad escasa: se cubre lo posible");
{
  const cands = [hermano("Ana", ["ACOMODADORES", "MICROFONO", "AUDIO", "VIDEO", "PLATAFORMA"])];
  const r = autoAssign(posiciones(FECHAS), reuniones(FECHAS), cands, makeRandom(9));
  check(r.proposals.length === FECHAS.length, `una casilla por reunión (${r.proposals.length})`);
  check(
    r.uncovered.length === FECHAS.length * 6,
    `y el resto se informa sin cubrir (${r.uncovered.length})`,
  );
  check(r.loads[0].total === FECHAS.length, `su carga total suma ${r.loads[0].total}`);
}

// --- 6. Funciones múltiples -----------------------------------------------
console.log("\n6. Un hermano en varias categorías");
{
  const cands = [
    hermano("Ana", ["ACOMODADORES", "AUDIO"]),
    hermano("Beto", ["ACOMODADORES"]),
    hermano("Caro", ["ACOMODADORES"]),
    hermano("Nico", ["AUDIO"]),
    ...["Gabi", "Hugo"].map((n) => hermano(n, ["MICROFONO"])),
    hermano("Keti", ["PLATAFORMA"]),
    hermano("Olga", ["VIDEO"]),
  ];
  const r = autoAssign(posiciones(FECHAS), reuniones(FECHAS), cands, makeRandom(21));
  const ana = r.loads.find((l) => l.name === "Ana")!;
  const beto = r.loads.find((l) => l.name === "Beto")!;
  const nico = r.loads.find((l) => l.name === "Nico")!;
  console.log(`  carga -> Ana ${ana.total} · Beto ${beto.total} · Nico ${nico.total}`);
  check(
    Math.abs(ana.total - beto.total) <= 2,
    "su carga cuenta las dos categorías, no se le llena de trabajo",
  );
  check(r.uncovered.length === 0, "y aun así se cubre todo");
}

// --- 7. Carga previa del mes ----------------------------------------------
console.log("\n7. Se tiene en cuenta lo que ya tenían");
{
  const cands = [
    hermano("Ana", ["AUDIO"], 4), // ya lleva 4
    hermano("Nico", ["AUDIO"], 0), // no lleva ninguna
    ...["Beto", "Caro"].map((n) => hermano(n, ["ACOMODADORES"])),
    ...["Gabi", "Hugo"].map((n) => hermano(n, ["MICROFONO"])),
    hermano("Keti", ["PLATAFORMA"]),
    hermano("Olga", ["VIDEO"]),
  ];
  const r = autoAssign(posiciones(FECHAS), reuniones(FECHAS), cands, makeRandom(13));
  const deAna = r.proposals.filter((p) => p.name === "Ana").length;
  const deNico = r.proposals.filter((p) => p.name === "Nico").length;
  console.log(`  audio -> Ana ${deAna} · Nico ${deNico} (Ana ya llevaba 4)`);
  check(deNico > deAna, "se empieza por quien menos lleva");
}

// --- 8. Aleatoriedad reproducible -----------------------------------------
console.log("\n8. Varía entre repartos, pero es reproducible");
{
  const cands = [
    ...["Ana", "Beto", "Caro", "Dani"].map((n) => hermano(n, ["ACOMODADORES"])),
    ...["Gabi", "Hugo", "Iván"].map((n) => hermano(n, ["MICROFONO"])),
    ...["Keti", "Luis"].map((n) => hermano(n, ["PLATAFORMA"])),
    ...["Mara", "Nico"].map((n) => hermano(n, ["AUDIO"])),
    ...["Olga", "Pepe"].map((n) => hermano(n, ["VIDEO"])),
  ];
  const firma = (semilla: number) =>
    autoAssign(posiciones(FECHAS), reuniones(FECHAS), cands, makeRandom(semilla))
      .proposals.map((p) => `${p.dateISO}${p.slotKey}${p.name}`)
      .join("|");
  check(firma(1) === firma(1), "con la misma semilla, el mismo reparto");
  const distintas = new Set([firma(1), firma(2), firma(3), firma(4), firma(5)]);
  check(distintas.size > 1, `con semillas distintas, repartos distintos (${distintas.size}/5)`);
}

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
