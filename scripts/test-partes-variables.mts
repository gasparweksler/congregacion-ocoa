// ============================================================================
//  El número de asignaciones de "Seamos Mejores Maestros" y "Nuestra Vida
//  Cristiana" cambia cada semana. Esta prueba comprueba que la carga masiva se
//  ajuste sola y que NO pierda ninguna parte del programa, ni aunque la semana
//  traiga más de las previstas.
//  No toca la base de datos.
//    npx tsx scripts/test-partes-variables.mts
// ============================================================================
import { buildSlotData, type Week } from "../src/lib/vymc-parser.js";
import { JUEVES_SLOTS } from "../src/lib/constants.js";

let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};

const parte = (label: string, name: string, name2 = "") => ({ label, name, name2, c5: "" });
const semana = (over: Partial<Week>): Week => ({
  date: new Date(2026, 6, 6, 12),
  label: "prueba",
  pres: "Presidente",
  orac: "Oración",
  clos: "Final",
  // Datos del programa impreso: esta prueba solo mira las partes variables.
  reading: "",
  songStart: "",
  songMiddle: "",
  songEnd: "",
  tesoros: [],
  smm: [],
  vc: [],
  ...over,
});

/** Cuenta las casillas con contenido de una sección (fijas + añadidas). */
const colocadas = (data: Record<string, { extra?: { section: string } }>, section: string) =>
  Object.entries(data).filter(([k, d]) => {
    const fija = JUEVES_SLOTS.find((s) => s.key === k);
    return fija ? fija.section === section : d.extra?.section === section;
  }).length;

console.log("Seamos Mejores Maestros (varía entre semanas)");
for (const n of [3, 4, 5, 6, 7]) {
  const data = buildSlotData(
    semana({
      smm: Array.from({ length: n }, (_, i) =>
        parte(`${i + 1}. Parte ${i + 1}`, `Hermano ${i + 1}`, `Auxiliar ${i + 1}`),
      ),
    }),
  );
  const c = colocadas(data, "SMM");
  check(c === n, `${n} parte(s) → ${c} colocada(s), ninguna perdida`);
}

console.log("\nNuestra Vida Cristiana (discursos + Estudio bíblico)");
for (const n of [1, 2, 3, 4]) {
  const data = buildSlotData(
    semana({
      vc: [
        ...Array.from({ length: n }, (_, i) => parte(`Discurso ${i + 1}`, `Hermano ${i + 1}`)),
        { label: "Estudio bíblico de la congregación", name: "Lector", name2: "", c5: "Conductor" },
      ],
    }),
  );
  // n discursos + conductor + lector
  const c = colocadas(data, "VC");
  check(c === n + 2, `${n} discurso(s) + estudio → ${c} de ${n + 2}, ninguna perdida`);
}

console.log("\nLos nombres de las partes añadidas llegan completos");
{
  const data = buildSlotData(
    semana({
      smm: Array.from({ length: 7 }, (_, i) =>
        parte(`${i + 1}. Parte ${i + 1}`, `Hermano ${i + 1}`, `Auxiliar ${i + 1}`),
      ),
    }),
  );
  const extras = Object.entries(data).filter(([, d]) => d.extra);
  check(extras.length === 2, `se añadieron 2 casillas (${extras.length})`);
  check(
    extras.every(([, d]) => (d as { p?: string }).p && (d as { s?: string }).s),
    "las añadidas conservan responsable y auxiliar",
  );
  check(
    extras.every(([, d]) => (d as { label?: string }).label),
    "las añadidas conservan el título de la parte",
  );
}

console.log("\nUna semana normal no añade nada de más");
{
  const data = buildSlotData(
    semana({
      smm: [parte("1. Empiece conversaciones", "A"), parte("2. Haga revisitas", "B")],
      vc: [
        parte("Discurso", "C"),
        { label: "Estudio bíblico de la congregación", name: "D", name2: "", c5: "E" },
      ],
    }),
  );
  const extras = Object.entries(data).filter(([, d]) => d.extra);
  check(extras.length === 0, `sin casillas añadidas (${extras.length})`);
}

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
