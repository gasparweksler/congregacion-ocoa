// ============================================================================
//  El lector de TARJETAS DE TERRITORIO no depende de ningún PDF concreto.
//
//  Todas las pruebas usan tarjetas INVENTADAS, con nombres y números que no
//  existen en ninguna congregación: es la única forma de comprobar que el
//  lector se adapta al formato en vez de reconocer un archivo en particular.
//  No hace falta ningún PDF.
//
//  Se comprueba:
//   1. Tarjeta oficial (S-12): una por página, leída por sus rótulos.
//   2. El nombre del encabezado gana al que está dibujado en el mapa.
//   3. Tarjeta sin el rótulo del número: se avisa y se deja sin número.
//   4. Hoja con cuatro tarjetas: emparejar número y nombre por renglón.
//   5. Lista escrita ("1 - Camino al Túnel").
//   6. Los rótulos impresos nunca pasan por nombre de territorio.
//   7. Nombres que acaban en número ("La Febre 1") no se parten.
//   8. Números repetidos y páginas sin tarjeta: avisos.
//   9. PDF sin nada legible: no inventa nada.
//  10. Limpieza del nombre: espacios, puntuación y largo máximo.
//
//    npx tsx scripts/test-importar-tarjetas.mts
// ============================================================================
import type { Fragmento } from "../src/lib/pdf-lines.js";
import {
  leerTarjetasDePdf,
  limpiarNombre,
  type TarjetaLeida,
} from "../src/lib/tarjetas-territorio.js";

let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};
const titulo = (t: string) => console.log(`\n${t}`);

// ---------------------------------------------------------------------------
//  Utilidades para montar PDFs inventados
// ---------------------------------------------------------------------------

/** Un trozo de texto, como los que entrega el PDF. */
function frag(
  text: string,
  x: number,
  y: number,
  page: number,
  height: number,
): Fragmento {
  return {
    text,
    x,
    y,
    // Ancho aproximado de la letra: no hace falta que sea exacto, pero sí
    // que crezca con el texto, porque de ahí salen los huecos.
    width: text.length * height * 0.5,
    height,
    page,
    font: `f${Math.round(height)}`,
  };
}

/**
 * Una tarjeta oficial, con los mismos rótulos y posiciones que trae la S-12.
 * `enElMapa` es el nombre dibujado dentro del plano, que a veces no coincide
 * con el del encabezado.
 */
function tarjetaOficial(opciones: {
  page: number;
  nombre: string;
  numero: number | null;
  enElMapa?: string;
  calles?: string;
}): Fragmento[] {
  const { page, nombre, numero } = opciones;
  const out: Fragmento[] = [
    frag("TARJETA DEL MAPA DEL TERRITORIO", 42, 549, page, 10),
    frag(nombre, 42, 511, page, 30),
    frag("Localidad", 42, 489, page, 10),
    frag("CALLES", 42, 158, page, 8.5),
    frag(opciones.calles ?? "Calle Larga · Pasaje Corto", 90, 158, page, 10.5),
    frag(
      "Sírvase mantener esta tarjeta en el sobre. No la manche, marque, ni doble.",
      42,
      47,
      page,
      9,
    ),
    frag("S-12-S", 42, 14, page, 8),
    frag(`${page} / 9`, 740, 14, page, 8),
  ];
  if (numero !== null) {
    out.push(frag("TERR. NÚM.", 727, 553, page, 8.5));
    out.push(frag(String(numero), 739, 499, page, 40));
    // Dentro del plano se repiten, en grande, el nombre y el número.
    out.push(frag(opciones.enElMapa ?? nombre, 219, 463, page, 39.5));
    out.push(frag(String(numero), 694, 463, page, 45.4));
  }
  return out;
}

/** Una hoja con cuatro tarjetas (2x2), sin ningún rótulo. */
function hojaDeCuatro(
  page: number,
  tarjetas: { numero: number; nombre: string }[],
): Fragmento[] {
  // Esquinas de cada tarjeta: nombre a la izquierda, número a la derecha.
  const sitios = [
    { xNombre: 128, xNumero: 345, y: 527 },
    { xNombre: 522, xNumero: 762, y: 528 },
    { xNombre: 128, xNumero: 343, y: 228 },
    { xNombre: 556, xNumero: 762, y: 228 },
  ];
  const out: Fragmento[] = [];
  tarjetas.forEach((t, i) => {
    const s = sitios[i];
    out.push(frag(t.nombre, s.xNombre, s.y, page, 20));
    out.push(frag(String(t.numero), s.xNumero, s.y, page, 23));
    // Nombres de calles sueltos por el plano, en letra chica.
    out.push(frag("Av. Los Aromos", s.xNombre + 40, s.y - 100, page, 8));
    out.push(frag("F-300", s.xNombre + 90, s.y - 130, page, 8));
  });
  return out;
}

const resumen = (t: TarjetaLeida[]) =>
  t.map((x) => `${x.numero ?? "—"}:${x.nombre}`).join(" | ");

// ---------------------------------------------------------------------------
//  1. Tarjeta oficial: una por página
// ---------------------------------------------------------------------------
titulo("1. Tarjetas oficiales, una por página");
{
  const nombres = [
    "Camino del Sauce",
    "Los Aromos 1",
    "Quebrada Honda",
    "El Peral 2",
    "Puente Viejo",
  ];
  const frags = nombres.flatMap((nombre, i) =>
    tarjetaOficial({ page: i + 1, nombre, numero: i + 1 }),
  );
  const r = leerTarjetasDePdf(frags, 5);

  check(r.formato === "oficial", `formato reconocido: ${r.formato}`);
  check(r.tarjetas.length === 5, `salen las 5 tarjetas (${r.tarjetas.length})`);
  check(
    r.tarjetas.every((t, i) => t.numero === i + 1 && t.nombre === nombres[i]),
    `número y nombre de cada una: ${resumen(r.tarjetas)}`,
  );
  check(
    r.tarjetas.every((t, i) => t.pagina === i + 1),
    "cada tarjeta recuerda su página",
  );
  check(r.unaPorPagina, "una por página: se pueden guardar los mapas");
  check(r.paginas === 5, `cuenta las páginas del PDF (${r.paginas})`);
  check(r.avisos.length === 0, `sin avisos (${r.avisos.join(" / ")})`);
}

// ---------------------------------------------------------------------------
//  2. El encabezado manda sobre lo dibujado en el mapa
// ---------------------------------------------------------------------------
titulo("2. El nombre del encabezado gana al del plano");
{
  // El plano trae el nombre mal escrito y en letra MÁS GRANDE que el título.
  const frags = tarjetaOficial({
    page: 1,
    nombre: "Hualcalpo 3",
    numero: 23,
    enElMapa: "Hualcapo 3",
  });
  const r = leerTarjetasDePdf(frags, 1);
  check(
    r.tarjetas[0]?.nombre === "Hualcalpo 3",
    `gana el encabezado: "${r.tarjetas[0]?.nombre}"`,
  );
  check(r.tarjetas[0]?.numero === 23, "y el número del rótulo TERR. NÚM.");
}

// ---------------------------------------------------------------------------
//  3. Tarjeta sin número
// ---------------------------------------------------------------------------
titulo("3. Tarjeta sin el rótulo del número");
{
  const frags = [
    ...tarjetaOficial({ page: 1, nombre: "Camino del Sauce", numero: 1 }),
    ...tarjetaOficial({ page: 2, nombre: "Sin Numerar", numero: null }),
  ];
  const r = leerTarjetasDePdf(frags, 2);
  check(r.tarjetas.length === 2, "las dos tarjetas salen igual");
  check(
    r.tarjetas[1]?.numero === null && r.tarjetas[1]?.nombre === "Sin Numerar",
    "la segunda queda sin número, con su nombre",
  );
  check(
    r.avisos.some((a) => a.includes("número")),
    `se avisa: ${r.avisos.join(" / ")}`,
  );
}

// ---------------------------------------------------------------------------
//  4. Hoja con cuatro tarjetas
// ---------------------------------------------------------------------------
titulo("4. Cuatro tarjetas en la misma hoja");
{
  const puestas = [
    { numero: 31, nombre: "Santa Rita" },
    { numero: 32, nombre: "Fábrica de ladrillos" },
    { numero: 33, nombre: "Los Nogales" },
    { numero: 34, nombre: "Rinconada 2" },
  ];
  const r = leerTarjetasDePdf(hojaDeCuatro(1, puestas), 1);

  check(r.formato === "cuadricula", `formato reconocido: ${r.formato}`);
  check(r.tarjetas.length === 4, `salen las 4 (${r.tarjetas.length})`);
  check(
    r.tarjetas.every(
      (t, i) => t.numero === puestas[i].numero && t.nombre === puestas[i].nombre,
    ),
    `cada número con su nombre, de arriba abajo: ${resumen(r.tarjetas)}`,
  );
  check(
    !r.unaPorPagina,
    "no se ofrecen los mapas: cuatro tarjetas no caben en una página de mapa",
  );
  check(
    r.tarjetas.every((t) => t.pagina === 1),
    "las cuatro son de la página 1",
  );
}

// ---------------------------------------------------------------------------
//  5. Lista escrita
// ---------------------------------------------------------------------------
titulo("5. Una lista escrita, sin tarjetas");
{
  const renglones = [
    "LISTADO DE TERRITORIOS",
    "1 - Camino del Sauce",
    "2 - Los Aromos 1",
    "3. Quebrada Honda",
    "4) El Peral 2",
    "5 Puente Viejo",
  ];
  const frags = renglones.map((t, i) => frag(t, 60, 700 - i * 20, 1, 11));
  const r = leerTarjetasDePdf(frags, 1);

  check(r.formato === "lista", `formato reconocido: ${r.formato}`);
  check(r.tarjetas.length === 5, `salen los 5 (${r.tarjetas.length})`);
  check(
    r.tarjetas[0]?.nombre === "Camino del Sauce" &&
      r.tarjetas[2]?.nombre === "Quebrada Honda" &&
      r.tarjetas[4]?.nombre === "Puente Viejo",
    `acepta guion, punto, paréntesis y espacio: ${resumen(r.tarjetas)}`,
  );
  check(
    !r.tarjetas.some((t) => t.nombre.includes("LISTADO")),
    "el título de la hoja no se cuela como territorio",
  );
}

// ---------------------------------------------------------------------------
//  6. Los rótulos impresos no son territorios
// ---------------------------------------------------------------------------
titulo("6. Los rótulos impresos nunca son un nombre");
{
  const frags = tarjetaOficial({ page: 1, nombre: "El Molino", numero: 7 });
  const r = leerTarjetasDePdf(frags, 1);
  const prohibidos = [
    "Localidad",
    "CALLES",
    "S-12-S",
    "TERR. NÚM.",
    "TARJETA DEL MAPA DEL TERRITORIO",
    "1 / 9",
  ];
  check(
    r.tarjetas.length === 1,
    `de la hoja sale una sola tarjeta (${r.tarjetas.length})`,
  );
  check(
    !prohibidos.some((p) =>
      r.tarjetas.some((t) => t.nombre.toLowerCase() === p.toLowerCase()),
    ),
    "ningún rótulo pasó por nombre de territorio",
  );
  check(r.tarjetas[0]?.nombre === "El Molino", "el nombre es el del campo");
}

// ---------------------------------------------------------------------------
//  7. Nombres que acaban en número
// ---------------------------------------------------------------------------
titulo("7. Nombres que acaban en número");
{
  const frags = [
    ...tarjetaOficial({ page: 1, nombre: "La Febre 1", numero: 2 }),
    ...tarjetaOficial({ page: 2, nombre: "La Febre 2", numero: 3 }),
  ];
  const r = leerTarjetasDePdf(frags, 2);
  check(
    r.tarjetas[0]?.nombre === "La Febre 1" && r.tarjetas[0]?.numero === 2,
    `"La Febre 1" sigue entero y con su número: ${resumen(r.tarjetas)}`,
  );
  check(r.tarjetas[1]?.nombre === "La Febre 2", "y la segunda igual");
}

// ---------------------------------------------------------------------------
//  8. Repetidos y páginas que no son tarjetas
// ---------------------------------------------------------------------------
titulo("8. Números repetidos y páginas que no son tarjetas");
{
  const frags = [
    ...tarjetaOficial({ page: 1, nombre: "Camino del Sauce", numero: 1 }),
    ...tarjetaOficial({ page: 2, nombre: "Camino del Sauce (copia)", numero: 1 }),
    ...tarjetaOficial({ page: 3, nombre: "Los Aromos 1", numero: 2 }),
    // Una hoja de portada, que no es una tarjeta.
    frag("TERRITORIOS DE LA CONGREGACIÓN", 200, 500, 4, 18),
  ];
  const r = leerTarjetasDePdf(frags, 4);
  check(r.formato === "oficial", `sigue siendo el formato oficial (${r.formato})`);
  check(r.tarjetas.length === 3, `solo las 3 tarjetas (${r.tarjetas.length})`);
  check(
    r.avisos.some((a) => a.includes("más de una vez")),
    `avisa del número repetido: ${r.avisos.join(" / ")}`,
  );
  check(
    r.avisos.some((a) => a.includes("no parecía") || a.includes("no parecían")),
    "avisa de la página que no era una tarjeta",
  );
  check(
    r.unaPorPagina,
    "sigue habiendo una tarjeta por página, así que los mapas se pueden guardar",
  );
}

// ---------------------------------------------------------------------------
//  9. Un PDF del que no se puede sacar nada
// ---------------------------------------------------------------------------
titulo("9. Un PDF sin nada legible");
{
  const vacio = leerTarjetasDePdf([], 3);
  check(vacio.formato === "ninguno", `no inventa un formato (${vacio.formato})`);
  check(vacio.tarjetas.length === 0, "no inventa tarjetas");
  check(!vacio.unaPorPagina, "y no ofrece guardar mapas");

  // Un PDF escaneado: solo trae el sello de la máquina, sin números grandes.
  const escaneado = [
    frag("Escaneado con CamScanner", 60, 40, 1, 8),
    frag("Escaneado con CamScanner", 60, 40, 2, 8),
  ];
  const r = leerTarjetasDePdf(escaneado, 2);
  check(
    r.tarjetas.length === 0,
    `de un escaneo no sale ningún territorio (${resumen(r.tarjetas)})`,
  );
}

// ---------------------------------------------------------------------------
//  10. Limpieza del nombre
// ---------------------------------------------------------------------------
titulo("10. Limpieza del nombre");
{
  check(
    limpiarNombre("  Los   Nogales  ") === "Los Nogales",
    "quita los espacios de más",
  );
  check(
    limpiarNombre("Quebrada Honda -") === "Quebrada Honda",
    "quita la puntuación suelta del final",
  );
  check(
    limpiarNombre("· El Peral") === "El Peral",
    "y la del principio",
  );
  check(limpiarNombre("A".repeat(200)).length === 120, "corta a 120 letras");
  check(
    limpiarNombre("Villa Alegría 3") === "Villa Alegría 3",
    "no toca un nombre que ya está bien",
  );
}

// ---------------------------------------------------------------------------
console.log(
  fallos === 0
    ? "\n✅ Todas las comprobaciones pasaron."
    : `\n❌ ${fallos} comprobación(es) fallaron.`,
);
process.exit(fallos === 0 ? 0 : 1);
