// ============================================================================
//  Programas libres: las reglas, sin base de datos ni navegador.
//
//  Lo que de verdad puede salir mal es el cálculo de las fechas: que aparezcan
//  los días de reunión de ESA congregación, que el filtro de "solo entre
//  semana" o "solo fin de semana" haga lo suyo, y que varios meses salgan en
//  orden y agrupados.
//
//    npx tsx scripts/test-programa-libre.mts
// ============================================================================
import { congregationLabel } from "../src/lib/congregation-label.js";
import {
  columnaTieneDatos,
  conColumna,
  sinColumna,
  MAX_COLUMNAS,
  listaDeMeses,
  filasDelPrograma,
  etiquetasDeDias,
  periodoDelPrograma,
  nombreArchivo,
  queFalta,
  tablasDelPrograma,
  type Programa,
} from "../src/lib/programa-libre.js";

let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};
const titulo = (t: string) => console.log(`\n${t}`);

// Jueves (4) y sábado (6), como la configuración de siempre.
const JUE_SAB = { midweekDay: 4, weekendDay: 6 };
// Martes (2) y domingo (0): otra congregación con otros días.
const MAR_DOM = { midweekDay: 2, weekendDay: 0 };

const base = (cambios: Partial<Programa> = {}): Programa => ({
  titulo: "Programa de aseo",
  anio: 2026,
  meses: [10],
  queDias: "ambos",
  paleta: "azules",
  columnas: [
    { id: "a", titulo: "Responsable" },
    { id: "b", titulo: "Ayudante" },
  ],
  valores: {},
  ...cambios,
});

console.log("PROGRAMAS LIBRES · reglas\n");

titulo("1. Las fechas salen de los días de la congregación");
{
  // Octubre de 2026: jueves 1, 8, 15, 22, 29 · sábados 3, 10, 17, 24, 31.
  const filas = filasDelPrograma(2026, [10], "ambos", JUE_SAB);
  check(filas.length === 10, `octubre con jueves y sábados: 10 fechas (hay ${filas.length})`);
  check(
    filas.every((f) => f.iso.startsWith("2026-10-")),
    "todas son de octubre de 2026",
  );
  check(
    filas[0].iso === "2026-10-01" && filas[0].etiqueta === "Jueves 1",
    `la primera es el jueves 1 (es "${filas[0].etiqueta}")`,
  );
  check(
    filas[filas.length - 1].iso === "2026-10-31",
    "la última es el sábado 31",
  );
  const ordenadas = filas.every((f, i) => i === 0 || f.iso > filas[i - 1].iso);
  check(ordenadas, "salen en orden de fecha");

  // La MISMA congregación con otros días da otras fechas.
  const otras = filasDelPrograma(2026, [10], "ambos", MAR_DOM);
  check(
    otras.every((f) => [2, 0].includes(new Date(`${f.iso}T12:00:00`).getDay())),
    "con martes y domingo salen martes y domingos, no jueves ni sábados",
  );
  check(
    otras[0].etiqueta.startsWith("Martes") || otras[0].etiqueta.startsWith("Domingo"),
    `la etiqueta usa el día real ("${otras[0].etiqueta}")`,
  );
}

titulo("2. Incluir solo un tipo de reunión");
{
  const soloJue = filasDelPrograma(2026, [10], "entresemana", JUE_SAB);
  const soloSab = filasDelPrograma(2026, [10], "finsemana", JUE_SAB);
  const ambos = filasDelPrograma(2026, [10], "ambos", JUE_SAB);
  check(soloJue.length === 5, `solo entre semana: 5 jueves (hay ${soloJue.length})`);
  check(
    soloJue.every((f) => f.etiqueta.startsWith("Jueves")),
    "y todas son jueves",
  );
  check(soloSab.length === 5, `solo fin de semana: 5 sábados (hay ${soloSab.length})`);
  check(
    soloSab.every((f) => f.etiqueta.startsWith("Sábado")),
    "y todas son sábados",
  );
  check(
    soloJue.length + soloSab.length === ambos.length,
    "los dos filtros juntos suman lo mismo que 'ambos'",
  );
}

titulo("3. Varios meses");
{
  const filas = filasDelPrograma(2026, [12, 10, 11], "ambos", JUE_SAB);
  const meses = [...new Set(filas.map((f) => f.mes))];
  check(
    JSON.stringify(meses) === JSON.stringify([10, 11, 12]),
    `salen en orden aunque se elijan desordenados (${meses.join(", ")})`,
  );
  const repetido = filasDelPrograma(2026, [10, 10], "ambos", JUE_SAB);
  check(repetido.length === 10, "elegir el mismo mes dos veces no duplica fechas");
  check(
    filasDelPrograma(2026, [], "ambos", JUE_SAB).length === 0,
    "sin meses elegidos no hay fechas",
  );
  check(
    filasDelPrograma(2026, [13, 0], "ambos", JUE_SAB).length === 0,
    "un mes inventado se ignora",
  );
}

titulo("4. Cómo se nombra el período");
{
  check(
    periodoDelPrograma(2026, [10]) === "Octubre 2026",
    `un mes: "${periodoDelPrograma(2026, [10])}"`,
  );
  check(
    periodoDelPrograma(2026, [10, 11, 12]) === "Octubre – Diciembre 2026",
    `meses seguidos: "${periodoDelPrograma(2026, [10, 11, 12])}"`,
  );
  check(
    periodoDelPrograma(2026, [1, 6]) === "Enero, Junio 2026",
    `meses sueltos: "${periodoDelPrograma(2026, [1, 6])}"`,
  );
}

titulo("5. Las etiquetas de los días usan los de la congregación");
{
  const e = etiquetasDeDias(JUE_SAB);
  check(e.entresemana === "Solo jueves", `"${e.entresemana}"`);
  check(e.finsemana === "Solo sábado", `"${e.finsemana}"`);
  const o = etiquetasDeDias(MAR_DOM);
  check(o.entresemana === "Solo martes", `otra congregación: "${o.entresemana}"`);
  check(o.ambos === "Ambos (martes y domingo)", `"${o.ambos}"`);
}

titulo("6. Qué falta para poder descargar");
{
  const filas = filasDelPrograma(2026, [10], "ambos", JUE_SAB);
  check(queFalta(base(), filas) === null, "un programa completo no tiene pegas");
  check(
    queFalta(base({ titulo: "  " }), filas)?.includes("título") ?? false,
    "sin título avisa del título",
  );
  check(
    queFalta(base({ meses: [] }), [])?.includes("mes") ?? false,
    "sin meses avisa del mes",
  );
  check(
    queFalta(base({ columnas: [] }), filas)?.includes("columna") ?? false,
    "sin columnas avisa de las columnas",
  );
  check(
    (queFalta(base({ columnas: [{ id: "a", titulo: " " }] }), filas) ?? "").includes(
      "título a las columnas",
    ),
    "con columnas sin nombre avisa de los títulos",
  );
  // Caso real: febrero sin ningún domingo es imposible, pero un mes filtrado
  // a un día que no tiene sí puede quedarse vacío si el mes es corto.
  const vacias = filasDelPrograma(2026, [10], "finsemana", { midweekDay: 4, weekendDay: 6 });
  check(vacias.length > 0, "octubre sí tiene sábados (comprobación de cordura)");
}

titulo("7. La tabla que va al PDF");
{
  const filas = filasDelPrograma(2026, [10, 11], "entresemana", JUE_SAB);
  const p = base({
    meses: [10, 11],
    queDias: "entresemana",
    valores: {
      "2026-10-01": { a: "Juan Pérez", b: "Pedro Ruiz" },
    },
  });
  const tablas = tablasDelPrograma(p, filas);
  check(tablas.length === 2, `una tabla por mes (hay ${tablas.length})`);
  check(tablas[0].periodo === "OCTUBRE 2026", `la primera es "${tablas[0].periodo}"`);
  check(tablas[1].periodo === "NOVIEMBRE 2026", `la segunda es "${tablas[1].periodo}"`);
  check(
    JSON.stringify(tablas[0].cabecera) === JSON.stringify(["DÍA", "RESPONSABLE", "AYUDANTE"]),
    `la cabecera lleva los títulos puestos (${tablas[0].cabecera.join(" · ")})`,
  );
  check(
    JSON.stringify(tablas[0].cuerpo[0]) ===
      JSON.stringify(["Jueves 1", "Juan Pérez", "Pedro Ruiz"]),
    "la fila rellena sale con sus nombres",
  );
  check(
    tablas[0].cuerpo[1].slice(1).every((c) => c === ""),
    "las casillas sin rellenar salen vacías, no con 'undefined'",
  );
  check(
    tablas[0].cuerpo.every((f) => f.length === tablas[0].cabecera.length),
    "todas las filas tienen tantas celdas como columnas",
  );
}

titulo("8. El nombre del archivo");
{
  check(
    nombreArchivo(base()) === "programa-de-aseo_octubre_2026.pdf",
    `"${nombreArchivo(base())}"`,
  );
  check(
    nombreArchivo(base({ titulo: "Programa de Limpieza ¡2026!" })).startsWith(
      "programa-de-limpieza",
    ),
    "quita tildes y signos raros",
  );
  check(
    nombreArchivo(base({ titulo: "   " })).startsWith("programa_"),
    "sin título usa un nombre por defecto",
  );
  check(nombreArchivo(base()).endsWith(".pdf"), "y termina en .pdf");
}

titulo("9. El nombre de la congregación bajo el título");
{
  check(
    congregationLabel("Ocoa") === "Congregación Ocoa",
    `"Ocoa" se imprime como "${congregationLabel("Ocoa")}"`,
  );
  check(
    congregationLabel("Tornagaleones") === "Congregación Tornagaleones",
    `"Tornagaleones" se imprime como "${congregationLabel("Tornagaleones")}"`,
  );
  check(
    congregationLabel("Criollo Haitiano Talca") ===
      "Congregación Criollo Haitiano Talca",
    "un nombre de varias palabras",
  );
  check(
    congregationLabel("Congregación Ocoa") === "Congregación Ocoa",
    "si el nombre ya trae la palabra, no se repite",
  );
  check(
    congregationLabel("CONGREGACION OCOA") === "CONGREGACION OCOA",
    "tampoco en mayúsculas y sin tilde",
  );
  check(congregationLabel("") === "", "sin nombre no se inventa nada");
  check(congregationLabel(null) === "", "y con null tampoco");
  check(
    congregationLabel("  Ocoa  ") === "Congregación Ocoa",
    "se limpian los espacios de sobra",
  );
}

titulo("10. Cómo se enseña en pantalla qué meses se marcaron");
{
  check(listaDeMeses([11]) === "Noviembre", `uno solo: "${listaDeMeses([11])}"`);
  check(
    listaDeMeses([11, 12]) === "Noviembre y Diciembre",
    `dos: "${listaDeMeses([11, 12])}"`,
  );
  check(
    listaDeMeses([10, 11, 12]) === "Octubre, Noviembre y Diciembre",
    `tres: "${listaDeMeses([10, 11, 12])}"`,
  );
  check(
    listaDeMeses([12, 10, 11]) === "Octubre, Noviembre y Diciembre",
    "se ordenan aunque se marquen al revés",
  );
  check(listaDeMeses([]) === "", "sin meses no dice nada");
  check(
    listaDeMeses([11, 11]) === "Noviembre",
    "el mismo mes dos veces se nombra una",
  );
  check(
    listaDeMeses(Array.from({ length: 12 }, (_, i) => i + 1)).startsWith(
      "Enero, Febrero",
    ),
    "todo el año empieza por enero",
  );

  // Las fechas tienen que acompañar a lo que dice el texto.
  const dosMeses = filasDelPrograma(2026, [11, 12], "ambos", JUE_SAB);
  const mesesEnFilas = [...new Set(dosMeses.map((f) => f.mes))];
  check(
    JSON.stringify(mesesEnFilas) === JSON.stringify([11, 12]),
    `noviembre y diciembre juntos dan ${dosMeses.length} fechas de los dos meses`,
  );
  check(
    filasDelPrograma(2026, [11], "ambos", JUE_SAB).length < dosMeses.length,
    "y solo noviembre da menos que los dos juntos",
  );
}

titulo("11. Añadir y quitar columnas");
{
  const conTres = base({
    columnas: [
      { id: "a", titulo: "Responsable" },
      { id: "b", titulo: "Ayudante" },
      { id: "c", titulo: "Zona" },
    ],
    valores: {
      "2026-10-01": { a: "Juan", b: "Pedro", c: "Auditorio" },
      "2026-10-08": { b: "Andrés" },
    },
  });

  // El fallo de verdad: quitar la del MEDIO y que las otras sigan enteras.
  const sinB = sinColumna(conTres, "b");
  check(sinB.columnas.length === 2, `quedan dos columnas (quedan ${sinB.columnas.length})`);
  check(
    sinB.columnas.map((c) => c.id).join(",") === "a,c",
    "se fue la del medio y quedaron la primera y la tercera, en su orden",
  );
  check(
    sinB.valores["2026-10-01"].a === "Juan" && sinB.valores["2026-10-01"].c === "Auditorio",
    "lo escrito en las otras dos no se toca",
  );
  check(
    sinB.valores["2026-10-01"].b === undefined,
    "y lo de la quitada no se queda colgado en el borrador",
  );
  check(
    sinB.valores["2026-10-08"] === undefined,
    "una fecha que solo tenía esa columna desaparece entera",
  );

  // Nunca sin columnas.
  const unaSola = base({ columnas: [{ id: "a", titulo: "Responsable" }], valores: {} });
  check(
    sinColumna(unaSola, "a").columnas.length === 1,
    "con una sola columna, quitarla no la quita: la tabla quedaría vacía",
  );

  // Ni más de las que caben.
  let muchas = base({ columnas: [{ id: "a", titulo: "A" }], valores: {} });
  for (let i = 0; i < 20; i++) {
    muchas = conColumna(muchas, { id: `x${i}`, titulo: `X${i}` });
  }
  check(
    muchas.columnas.length === MAX_COLUMNAS,
    `por mucho que se pulse, se para en ${MAX_COLUMNAS} (quedaron ${muchas.columnas.length})`,
  );

  // Añadir no toca lo ya escrito.
  const masUna = conColumna(conTres, { id: "d", titulo: "Nueva" });
  check(masUna.columnas.length === 4, "añadir deja cuatro");
  check(
    masUna.valores["2026-10-01"].a === "Juan",
    "y no borra nada de lo escrito",
  );

  // El aviso solo salta cuando hay algo que perder.
  check(columnaTieneDatos(conTres, "c"), "una columna con nombres escritos se detecta");
  check(!columnaTieneDatos(conTres, "d"), "una columna vacía no");
  check(
    !columnaTieneDatos(base({ valores: { "2026-10-01": { a: "   " } } }), "a"),
    "y solo espacios cuenta como vacía",
  );
}

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
