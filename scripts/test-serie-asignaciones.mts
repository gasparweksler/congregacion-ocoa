// ============================================================================
//  Prueba del gráfico de líneas de "Estadísticas de Asignaciones".
//
//  El gráfico se dibuja con serieMensual(rows), y `rows` son las MISMAS
//  participaciones ya filtradas que enseña la lista de abajo. Así que probar
//  que la serie cuenta exactamente lo que se le da equivale a probar que el
//  gráfico respeta los filtros: si un filtro quita participaciones, al
//  gráfico le llegan menos y dibuja menos.
//    npm run test:serie
// ============================================================================
import {
  serieMensual,
  type HermanoDeLaSerie,
} from "../src/lib/assignment-series.js";

let ok = 0;
let bad = 0;
const check = (cond: boolean, texto: string, detalle = "") => {
  if (cond) {
    ok++;
    console.log(`  ✅ ${texto}`);
  } else {
    bad++;
    console.log(`  ❌ ${texto}${detalle ? ` — ${detalle}` : ""}`);
  }
};

const p = (date: string, done: "confirmada" | "rechazada" | "pendiente" = "pendiente") =>
  ({ date, done }) as HermanoDeLaSerie["participations"][number];

// Tres hermanos, con asignaciones repartidas entre marzo y junio de 2026.
const TODOS: HermanoDeLaSerie[] = [
  {
    name: "Hermano Uno",
    participations: [
      p("2026-03-05", "confirmada"),
      p("2026-03-19", "rechazada"),
      p("2026-06-04", "confirmada"),
    ],
  },
  {
    name: "Hermano Dos",
    participations: [p("2026-03-12"), p("2026-06-18", "confirmada")],
  },
  { name: "Hermano Tres", participations: [p("2026-06-25", "rechazada")] },
];

const suma = (s: { total: number }[]) => s.reduce((n, m) => n + m.total, 0);
const total = (h: HermanoDeLaSerie[]) =>
  h.reduce((n, x) => n + x.participations.length, 0);

// ---------------------------------------------------------------------------
console.log("\n--- 1. La serie cuenta justo lo que se le da ---");

const serie = serieMensual(TODOS);
check(suma(serie) === total(TODOS), "el total del gráfico = el total de la lista", `${suma(serie)} vs ${total(TODOS)}`);
check(serie.length === 4, "de marzo a junio son 4 puntos", `${serie.length}`);
check(
  serie.map((m) => m.clave).join(",") === "2026-03,2026-04,2026-05,2026-06",
  "los meses salen en orden y sin saltarse ninguno",
  serie.map((m) => m.clave).join(","),
);
check(
  serie[1].total === 0 && serie[2].total === 0,
  "abril y mayo, sin asignaciones, salen con cero (no como hueco)",
);
check(
  serie[0].etiqueta === "Mar 2026" && serie[0].etiquetaLarga === "Marzo de 2026",
  "cada mes trae su nombre entendible",
  `${serie[0].etiqueta} / ${serie[0].etiquetaLarga}`,
);
check(
  serie[0].total === 3 && serie[0].confirmadas === 1 && serie[0].rechazadas === 1 &&
    serie[0].sinRespuesta === 1,
  "marzo: 3 asignaciones, 1 confirmada, 1 rechazada, 1 sin respuesta",
  JSON.stringify(serie[0]),
);
check(serie[0].hermanos === 2, "y participaron 2 hermanos distintos", `${serie[0].hermanos}`);
check(
  serie.every((m) => m.total === m.confirmadas + m.rechazadas + m.sinRespuesta),
  "en todos los meses, las tres cifras suman el total",
);

// ---------------------------------------------------------------------------
console.log("\n--- 2. Al filtrar, el gráfico se achica con la lista ---");

// Filtrar por nombre es quedarse con un hermano: así llega al gráfico.
const soloUno = TODOS.filter((h) => h.name === "Hermano Uno");
const serieUno = serieMensual(soloUno);
check(
  suma(serieUno) === 3,
  "filtrando por un hermano, el gráfico muestra solo sus 3 asignaciones",
  `${suma(serieUno)}`,
);
check(
  suma(serieUno) < suma(serie),
  "y queda por debajo del gráfico sin filtrar",
);

// Filtrar por fechas es quedarse con unas participaciones.
const soloJunio = TODOS.map((h) => ({
  ...h,
  participations: h.participations.filter((x) => x.date.startsWith("2026-06")),
})).filter((h) => h.participations.length > 0);
const serieJunio = serieMensual(soloJunio);
check(
  serieJunio.length === 1 && serieJunio[0].clave === "2026-06",
  "filtrando a junio, el gráfico enseña un solo mes",
  serieJunio.map((m) => m.clave).join(","),
);
check(
  serieJunio[0].total === 3 && serieJunio[0].hermanos === 3,
  "junio: 3 asignaciones de 3 hermanos",
  JSON.stringify(serieJunio[0]),
);

// Un filtro que no deja nada: el gráfico no se dibuja (la página enseña un
// aviso en su lugar).
check(serieMensual([]).length === 0, "si el filtro no deja nada, no hay serie");
check(
  serieMensual([{ name: "Nadie", participations: [] }]).length === 0,
  "un hermano sin participaciones tampoco dibuja nada",
);

// ---------------------------------------------------------------------------
console.log("\n--- 3. Casos raros ---");

const conFechaMala = serieMensual([
  { name: "X", participations: [p("2026-03-05"), p("fecha mala")] },
]);
check(
  suma(conFechaMala) === 1,
  "una fecha ilegible se descarta en vez de romper el gráfico",
  `${suma(conFechaMala)}`,
);

const largo = serieMensual(
  [
    {
      name: "Veterano",
      participations: [p("2020-01-05"), p("2026-06-05")],
    },
  ],
  36,
);
check(largo.length === 36, "un historial larguísimo se recorta a 36 meses", `${largo.length}`);
check(
  largo[largo.length - 1].clave === "2026-06",
  "y se queda con los más recientes",
  largo[largo.length - 1].clave,
);

console.log(`\n=== ${ok} bien, ${bad} mal ===`);
process.exit(bad === 0 ? 0 : 1);
