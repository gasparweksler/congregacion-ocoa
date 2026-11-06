// ============================================================================
//  Territorios: las cuentas, el programa del mes y su PDF.
//
//  Todo con casos inventados, sin tocar la base de datos. Lo que se comprueba
//  es exactamente lo que usan las pantallas: las mismas funciones.
//
//    npm run test:territorios
// ============================================================================
import "../src/lib/pdf-node-polyfills.js";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import {
  claveDeMes,
  diasDelMes,
  diasEntre,
  escalaDeMapa,
  estadisticas,
  etiquetaDeFecha,
  etiquetaDeMes,
  fechaDeISO,
  filasDelPrograma,
  generarSalidas,
  isoDeFecha,
  leerListaDeTerritorios,
  masOlvidados,
  nombreCompleto,
  ordenarSalidas,
  repartoPorOrden,
  siguienteNumero,
  tamanoLegible,
  territoriosDelPrograma,
  turnosDeModalidad,
  ultimosMeses,
  type Salida,
  type Territorio,
  type VezPredicado,
} from "../src/lib/territorios.js";
import {
  dibujarProgramaPredicacion,
  encajar,
} from "../src/lib/territorios-pdf.js";
import { extractPdfItems } from "../src/lib/pdf-text.js";
import { serviceOutingSchema, territorySchema } from "../src/lib/validations.js";

let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};
const titulo = (t: string) => console.log(`\n${t}`);

const F = (iso: string): Date => {
  const f = fechaDeISO(iso);
  if (!f) throw new Error(`fecha de prueba inválida: ${iso}`);
  return f;
};

// ---------------------------------------------------------------------------
titulo("1. Leer una lista de territorios escrita a mano");
{
  const leidos = leerListaDeTerritorios(
    [
      "1 - Camino al Túnel",
      "2. La Febre 1",
      "3) Vista Hermosa",
      "4 Los Maitenes",
      "5 – El Cristo 2", // guion largo
      "Sin número, el que venga",
      "",
      "   ",
      "17", // solo un número: basura
      "100   -   Fundo El Peumo",
    ].join("\n"),
  );

  check(leidos.length === 7, `se leyeron 7 líneas útiles (${leidos.length})`);
  check(
    leidos[0].numero === 1 && leidos[0].nombre === "Camino al Túnel",
    "“1 - Camino al Túnel”",
  );
  check(
    leidos[1].numero === 2 && leidos[1].nombre === "La Febre 1",
    "“2. La Febre 1”: el 1 del final se queda en el nombre",
  );
  check(
    leidos[2].numero === 3 && leidos[2].nombre === "Vista Hermosa",
    "“3) Vista Hermosa”",
  );
  check(
    leidos[3].numero === 4 && leidos[3].nombre === "Los Maitenes",
    "“4 Los Maitenes”, sin separador",
  );
  check(
    leidos[4].numero === 5 && leidos[4].nombre === "El Cristo 2",
    "“5 – El Cristo 2”, con guion largo",
  );
  check(
    leidos[5].numero === null &&
      leidos[5].nombre === "Sin número, el que venga",
    "sin número: lo pone quien guarda",
  );
  check(
    leidos[6].numero === 100 && leidos[6].nombre === "Fundo El Peumo",
    "“100   -   Fundo El Peumo”, con espacios de más",
  );
  check(
    leerListaDeTerritorios("").length === 0 &&
      leerListaDeTerritorios("\n\n  \n").length === 0,
    "una lista vacía no devuelve nada",
  );

  check(siguienteNumero([]) === 1, "el primer territorio es el número 1");
  check(
    siguienteNumero([1, 2, 7]) === 8,
    "con el 7 ocupado, el siguiente es el 8",
  );
}

// ---------------------------------------------------------------------------
titulo("2. Fechas (a mediodía, para que no se corran de día)");
{
  const f = F("2027-01-03");
  check(f.getHours() === 12, "se guardan a mediodía local");
  check(
    f.getFullYear() === 2027 && f.getMonth() === 0 && f.getDate() === 3,
    "3 de enero de 2027",
  );
  check(isoDeFecha(f) === "2027-01-03", "y vuelve a “2027-01-03”");
  check(
    etiquetaDeFecha(f) === "domingo 3 de enero",
    `se lee “domingo 3 de enero” (${etiquetaDeFecha(f)})`,
  );
  check(fechaDeISO("2027-02-31") === null, "el 31 de febrero no existe");
  check(fechaDeISO("2027-13-01") === null, "ni el mes 13");
  check(fechaDeISO("hola") === null, "ni “hola”");
  check(
    isoDeFecha(F("2028-02-29")) === "2028-02-29",
    "el 29 de febrero de un año bisiesto sí existe",
  );

  // Febrero de 2027 tiene 4 domingos; agosto de 2027, 5.
  check(
    diasDelMes(2027, 2, [0]).length === 4,
    `febrero de 2027 tiene 4 domingos (${diasDelMes(2027, 2, [0]).length})`,
  );
  check(
    diasDelMes(2027, 8, [0]).length === 5,
    `agosto de 2027 tiene 5 domingos (${diasDelMes(2027, 8, [0]).length})`,
  );
  check(
    diasDelMes(2027, 1, [6, 0]).length === 10,
    `enero de 2027 tiene 10 días entre sábados y domingos (${diasDelMes(2027, 1, [6, 0]).length})`,
  );
  check(
    diasDelMes(2027, 1, []).length === 0,
    "sin días elegidos no sale ninguna fecha",
  );
  check(diasEntre(F("2027-01-01"), F("2027-01-31")) === 30, "30 días de enero");
  check(
    diasEntre(F("2026-12-31"), F("2027-01-01")) === 1,
    "y cruzar el año es un día",
  );
}

// ---------------------------------------------------------------------------
titulo("3. Estadísticas: las dos fuentes cuentan igual");
{
  const territorios: Territorio[] = [
    { id: "t1", number: 1, name: "Camino al Túnel", order: 1 },
    { id: "t2", number: 2, name: "La Febre 1", order: 2 },
    { id: "t3", number: 3, name: "Vista Hermosa", order: 3 },
    { id: "t4", number: 4, name: "Nunca visitado", order: 4 },
  ];
  const veces: VezPredicado[] = [
    { territoryId: "t1", date: F("2027-01-03"), origen: "programa" },
    { territoryId: "t1", date: F("2027-01-17"), origen: "manual" },
    { territoryId: "t1", date: F("2027-02-07"), origen: "programa" },
    { territoryId: "t2", date: F("2026-07-05"), origen: "manual" },
    { territoryId: "t3", date: F("2027-02-28"), origen: "programa" },
  ];
  const hoy = F("2027-03-01");
  const stats = estadisticas(territorios, veces, hoy);

  check(stats.length === 4, "una fila por territorio, en el mismo orden");
  check(stats[0].veces === 3, `el 1 se predicó 3 veces (${stats[0].veces})`);
  check(
    stats[0].porMes["2027-01"] === 2 && stats[0].porMes["2027-02"] === 1,
    "dos veces en enero y una en febrero",
  );
  check(
    isoDeFecha(stats[0].ultima!) === "2027-02-07",
    "la última vez del 1 es el 7 de febrero",
  );
  check(
    stats[0].diasSinPredicar === 22,
    `lleva 22 días sin predicarse (${stats[0].diasSinPredicar})`,
  );
  check(
    stats[3].veces === 0 &&
      stats[3].ultima === null &&
      stats[3].diasSinPredicar === null,
    "el que nunca se predicó queda en cero, sin fecha",
  );
  check(
    stats[2].diasSinPredicar === 1,
    `el 3 se predicó ayer (${stats[2].diasSinPredicar} día)`,
  );
  check(
    claveDeMes(F("2027-01-03")) === "2027-01" &&
      etiquetaDeMes("2027-01") === "Enero 2027",
    "los meses se agrupan como “2027-01” y se leen “Enero 2027”",
  );

  const olvidados = masOlvidados(stats, 4).map((s) => s.territorio.number);
  check(
    olvidados.join(",") === "4,2,1,3",
    `primero el que nunca, luego el más viejo (${olvidados.join(",")})`,
  );

  const meses = ultimosMeses(3, F("2027-01-15"));
  check(
    meses.join(",") === "2027-01,2026-12,2026-11",
    `los últimos 3 meses cruzando el año (${meses.join(",")})`,
  );
  // Sin ninguna vez predicada, nada se rompe.
  const vacias = estadisticas(territorios, [], hoy);
  check(
    vacias.every((s) => s.veces === 0 && s.ultima === null),
    "sin datos, todos a cero y ninguno con fecha",
  );
  check(
    estadisticas([], veces, hoy).length === 0,
    "sin territorios no hay estadísticas que sacar",
  );
}

// ---------------------------------------------------------------------------
titulo("4. Armar el programa del mes");
{
  const territorios: Territorio[] = [
    { id: "t1", number: 1, name: "Camino al Túnel", order: 1 },
    { id: "t2", number: 2, name: "La Febre 1", order: 2 },
    { id: "t3", number: 3, name: "Vista Hermosa", order: 3 },
  ];

  check(
    turnosDeModalidad("manana").join(",") === "MANANA" &&
      turnosDeModalidad("tarde").join(",") === "TARDE" &&
      turnosDeModalidad("ambos").join(",") === "MANANA,TARDE",
    "las tres modalidades dan 1, 1 y 2 turnos",
  );

  // Enero de 2027: 5 domingos (3, 10, 17, 24 y 31).
  const soloManana = generarSalidas({
    anio: 2027,
    mes: 1,
    diasSemana: [0],
    modalidad: "manana",
    lugar: "Salón del Reino",
    capitan: "Gastón Mondaca",
    territoriosSugeridos: territorios.map((t) => t.id),
  });
  check(
    soloManana.length === 5,
    `solo mañana, 5 domingos de enero = 5 salidas (${soloManana.length})`,
  );
  check(
    soloManana.every((s) => s.turno === "MANANA" && s.time === "9:30"),
    "todas de mañana, a las 9:30",
  );
  check(
    soloManana.every(
      (s) => s.place === "Salón del Reino" && s.captainName === "Gastón Mondaca",
    ),
    "con el lugar y el capitán que se eligieron",
  );
  check(
    soloManana.map((s) => s.territoryId).join(",") === "t1,t2,t3,t1,t2",
    `los territorios se van repartiendo en orden (${soloManana
      .map((s) => s.territoryId)
      .join(",")})`,
  );
  check(
    soloManana.map((s) => s.iso).join(" ") ===
      "2027-01-03 2027-01-10 2027-01-17 2027-01-24 2027-01-31",
    "y caen en los cinco domingos",
  );

  const ambos = generarSalidas({
    anio: 2027,
    mes: 2,
    diasSemana: [6, 0],
    modalidad: "ambos",
    lugar: "Plaza",
    horas: { MANANA: "10:00", TARDE: "16:00" },
  });
  // Febrero de 2027: 4 sábados y 4 domingos = 8 días, 2 turnos cada uno.
  check(ambos.length === 16, `mañana y tarde, 8 días = 16 salidas (${ambos.length})`);
  check(
    ambos.filter((s) => s.turno === "MANANA").length === 8 &&
      ambos.filter((s) => s.turno === "TARDE").length === 8,
    "ocho de mañana y ocho de tarde",
  );
  check(
    ambos.find((s) => s.turno === "MANANA")!.time === "10:00" &&
      ambos.find((s) => s.turno === "TARDE")!.time === "16:00",
    "con las horas que se pusieron a mano",
  );
  check(
    ambos.every((s) => s.territoryId === ""),
    "sin territorios sugeridos, las salidas quedan sin territorio",
  );
  check(
    new Set(ambos.map((s) => s.key)).size === 16,
    "cada fila lleva su propia llave",
  );

  const soloTarde = generarSalidas({
    anio: 2027,
    mes: 2,
    diasSemana: [],
    modalidad: "tarde",
    lugar: "Plaza",
  });
  check(soloTarde.length === 0, "sin días elegidos no se genera nada");
}

// ---------------------------------------------------------------------------
titulo("5. El orden del programa y sus filas");
{
  const salidas: Salida[] = [
    {
      id: "b",
      date: F("2027-01-10"),
      turno: "MANANA",
      time: "9:30",
      place: "Salón del Reino",
      captainName: "Gastón Mondaca",
      territorio: { id: "t2", number: 2, name: "La Febre 1" },
    },
    {
      id: "a",
      date: F("2027-01-03"),
      turno: "TARDE",
      time: "15:30",
      place: "Salón del Reino",
      captainName: "Pedro Ruiz",
      territorio: { id: "t1", number: 1, name: "Camino al Túnel" },
    },
    {
      id: "c",
      date: F("2027-01-03"),
      turno: "MANANA",
      time: "9:30",
      place: "Plaza de Ocoa",
      captainName: "",
      territorio: null,
    },
  ];

  const orden = ordenarSalidas(salidas).map((s) => s.id);
  check(
    orden.join(",") === "c,a,b",
    `por fecha y, dentro del día, la mañana antes que la tarde (${orden.join(",")})`,
  );

  const filas = filasDelPrograma(salidas);
  check(filas.length === 3, "una fila por salida");
  check(
    filas[0].fecha === "domingo 3 de enero" &&
      filas[0].horario === "Mañana · 9:30",
    `la primera fila (${filas[0].fecha} / ${filas[0].horario})`,
  );
  check(
    filas[0].territorio === "—" && filas[0].capitan === "—",
    "lo que no se eligió sale con un guion, no en blanco",
  );
  check(
    filas[1].territorio === "1 - Camino al Túnel",
    `el territorio sale con su número (${filas[1].territorio})`,
  );
  check(
    nombreCompleto({ number: 7, name: "El Cristo" }) === "7 - El Cristo",
    "“7 - El Cristo”",
  );

  const usados = territoriosDelPrograma(salidas).map((t) => t.number);
  check(
    usados.join(",") === "1,2",
    `los territorios del mes, sin repetir y en orden (${usados.join(",")})`,
  );
  check(
    territoriosDelPrograma([salidas[0], salidas[0]]).length === 1,
    "un territorio en dos salidas aparece una sola vez",
  );
}

// ---------------------------------------------------------------------------
titulo("6. Mapas: tamaños y reparto por páginas");
{
  const territorios: Territorio[] = [
    { id: "t1", number: 1, name: "Uno", order: 1 },
    { id: "t2", number: 2, name: "Dos", order: 2 },
  ];
  check(
    repartoPorOrden(2, territorios).join(",") === "t1,t2",
    "página 1 al primero, página 2 al segundo",
  );
  check(
    repartoPorOrden(4, territorios).join(",") === "t1,t2,,",
    "si hay más páginas que territorios, las de más quedan sin asignar",
  );
  check(
    repartoPorOrden(1, territorios).join(",") === "t1",
    "y si hay menos páginas, sobran territorios sin mapa",
  );

  // Una hoja carta en puntos: 612 x 792.
  const escala = escalaDeMapa(612, 792, 1600);
  check(
    Math.round(792 * escala) <= 1600 && Math.round(792 * escala) >= 1400,
    `una hoja carta se dibuja a x${escala.toFixed(2)}: el lado mayor queda en ${Math.round(
      792 * escala,
    )} px, sin pasarse de 1600`,
  );
  check(escalaDeMapa(5000, 4000, 1600) >= 0.5, "un plano enorme no baja de x0,5");
  check(escalaDeMapa(100, 80, 1600) <= 2, "y uno diminuto no se agranda más de x2");
  check(escalaDeMapa(0, 0) === 1, "sin medidas, se dibuja tal cual");

  check(tamanoLegible(900) === "900 B", "900 B");
  check(tamanoLegible(2048) === "2 KB", "2 KB");
  check(tamanoLegible(1024 * 1024 * 2.5) === "2,5 MB", "2,5 MB con coma");

  const cabe = encajar(1600, 1200, 540, 700);
  check(
    Math.abs(cabe.w - 540) < 0.01 && Math.abs(cabe.h - 405) < 0.01,
    `una imagen horizontal se encaja por el ancho (${cabe.w.toFixed(0)}x${cabe.h.toFixed(0)})`,
  );
  const cabe2 = encajar(1200, 1600, 540, 700);
  check(
    Math.abs(cabe2.h - 700) < 0.01 && Math.abs(cabe2.w - 525) < 0.01,
    `y una vertical por el alto (${cabe2.w.toFixed(0)}x${cabe2.h.toFixed(0)})`,
  );
}

// ---------------------------------------------------------------------------
titulo("7. Lo que se guarda: validación");
{
  check(
    territorySchema.safeParse({ number: "3", name: "  Vista Hermosa  " }).success,
    "un territorio normal pasa (y el nombre se recorta)",
  );
  check(
    territorySchema.safeParse({ number: "3", name: "Vista Hermosa" }).data
      ?.name === "Vista Hermosa",
    "sin espacios sobrantes",
  );
  check(
    !territorySchema.safeParse({ number: "0", name: "Cero" }).success,
    "el número 0 no vale",
  );
  check(
    !territorySchema.safeParse({ number: "2", name: "   " }).success,
    "ni un nombre en blanco",
  );
  check(
    !territorySchema.safeParse({ number: "1.5", name: "Medio" }).success,
    "ni un número con decimales",
  );

  const salida = {
    iso: "2027-01-03",
    turno: "MANANA",
    time: "9:30",
    place: "Salón del Reino",
    territoryId: "t1",
    captainName: "Gastón Mondaca",
  };
  check(serviceOutingSchema.safeParse(salida).success, "una salida válida pasa");
  check(
    !serviceOutingSchema.safeParse({ ...salida, turno: "NOCHE" }).success,
    "un turno inventado no pasa",
  );
  check(
    !serviceOutingSchema.safeParse({ ...salida, iso: "3 de enero" }).success,
    "ni una fecha escrita a mano",
  );
  check(
    serviceOutingSchema.safeParse({ ...salida, territoryId: "", captainName: "" })
      .success,
    "una salida sin territorio ni capitán sí pasa: se completa después",
  );
}

// ---------------------------------------------------------------------------
titulo("8. El PDF del programa, de verdad");

/** Un PNG de color plano, hecho a mano: sirve de mapa en las pruebas. */
function pngDePrueba(ancho: number, alto: number): Buffer {
  const tabla = (() => {
    const t: number[] = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t.push(c >>> 0);
    }
    return t;
  })();
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const byte of b) c = tabla[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (tipo: string, datos: Buffer) => {
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
    const suma = Buffer.alloc(4);
    suma.writeUInt32BE(crc(cuerpo));
    return Buffer.concat([largo, cuerpo, suma]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 2; // color verdadero (RGB)

  // Cada fila: un byte de filtro (0) y tres bytes por píxel.
  const filas: Buffer[] = [];
  for (let y = 0; y < alto; y++) {
    const fila = Buffer.alloc(1 + ancho * 3);
    for (let x = 0; x < ancho; x++) {
      fila[1 + x * 3] = 220;
      fila[2 + x * 3] = 230;
      fila[3 + x * 3] = 245;
    }
    filas.push(fila);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(filas))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

{
  const salidas: Salida[] = [
    {
      id: "a",
      date: F("2027-01-03"),
      turno: "MANANA",
      time: "9:30",
      place: "Salón del Reino",
      captainName: "Gastón Mondaca",
      territorio: { id: "t1", number: 1, name: "Camino al Túnel" },
    },
    {
      id: "b",
      date: F("2027-01-10"),
      turno: "MANANA",
      time: "9:30",
      place: "Salón del Reino",
      captainName: "Pedro Ruiz",
      territorio: { id: "t2", number: 2, name: "La Febre 1" },
    },
    {
      id: "c",
      date: F("2027-01-10"),
      turno: "TARDE",
      time: "15:30",
      place: "Plaza de Ocoa",
      captainName: "Andrés Soto",
      territorio: { id: "t3", number: 3, name: "Vista Hermosa" },
    },
  ];

  const png = pngDePrueba(80, 60);
  const dataUrl = `data:image/png;base64,${png.toString("base64")}`;

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  dibujarProgramaPredicacion(doc, autoTable, {
    titulo: "Programa de Predicación",
    periodo: "Enero 2027",
    congregacion: "Congregación Ocoa",
    filas: filasDelPrograma(salidas),
    mapas: territoriosDelPrograma(salidas).map((t) => ({
      titulo: nombreCompleto(t),
      dataUrl,
      ancho: 80,
      alto: 60,
    })),
  });

  const bytes = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
  check(bytes.length > 1000, `el PDF tiene contenido (${bytes.length} bytes)`);
  check(
    doc.getNumberOfPages() === 4,
    `una hoja de programa y tres de mapas (${doc.getNumberOfPages()})`,
  );

  await mkdir(".tmp", { recursive: true });
  await writeFile(".tmp/programa-predicacion-prueba.pdf", bytes);
  console.log("  guardado en .tmp/programa-predicacion-prueba.pdf");

  const items = await extractPdfItems(bytes);
  const texto = items
    .map((i) => i.text)
    .join(" ")
    .replace(/\s+/g, " ");

  check(
    texto.includes("PROGRAMA DE PREDICACIÓN"),
    "el título, en mayúsculas y con tilde",
  );
  check(texto.includes("Congregación Ocoa"), "el nombre de la congregación");
  check(texto.includes("Enero 2027"), "el mes encabezando la tabla");
  check(
    ["Fecha", "Horario", "Lugar de encuentro", "Territorio", "Capitán"].every(
      (c) => texto.includes(c),
    ),
    "las cinco columnas que se piden",
  );
  check(
    texto.includes("domingo 3 de enero") && texto.includes("domingo 10 de enero"),
    "las fechas con su día de la semana",
  );
  check(
    texto.includes("Mañana · 9:30") && texto.includes("Tarde · 15:30"),
    "los horarios con su turno",
  );
  check(
    texto.includes("Salón del Reino") && texto.includes("Plaza de Ocoa"),
    "los lugares de encuentro",
  );
  check(
    texto.includes("1 - Camino al Túnel") &&
      texto.includes("2 - La Febre 1") &&
      texto.includes("3 - Vista Hermosa"),
    "los tres territorios, con su número",
  );
  check(
    texto.includes("Gastón Mondaca") &&
      texto.includes("Pedro Ruiz") &&
      texto.includes("Andrés Soto"),
    "los capitanes, con sus tildes",
  );
  check(!texto.includes("undefined"), "no se cuela ningún “undefined”");
  check(!texto.includes("[object"), "ni ningún objeto sin convertir");

  // Los mapas van después, cada uno con su territorio arriba.
  const paginaDe = (t: string) =>
    items.find((i) => i.text.trim() === t)?.page ?? null;
  check(
    paginaDe("PROGRAMA DE PREDICACIÓN") === 1,
    "el programa, en la primera hoja",
  );
  // El nombre sale dos veces: en la tabla (hoja 1) y encabezando su mapa.
  const hojasConElPrimero = items
    .filter((i) => i.text.includes("Camino al Túnel"))
    .map((i) => i.page);
  check(
    hojasConElPrimero.includes(1) && hojasConElPrimero.some((p) => p >= 2),
    `el primer territorio sale en la tabla y encabezando su mapa (hojas ${[
      ...new Set(hojasConElPrimero),
    ].join(", ")})`,
  );
  const hojasDeMapas = ["Camino al Túnel", "La Febre 1", "Vista Hermosa"].map(
    (n) =>
      items
        .filter((i) => i.text.includes(n))
        .map((i) => i.page)
        .filter((p) => p >= 2)[0] ?? null,
  );
  check(
    hojasDeMapas.join(",") === "2,3,4",
    `un mapa por hoja, en el orden del programa (${hojasDeMapas.join(",")})`,
  );

  // Y sin mapas, una sola hoja.
  const doc2 = new jsPDF({ unit: "pt", format: "letter" });
  dibujarProgramaPredicacion(doc2, autoTable, {
    titulo: "Programa de Predicación",
    periodo: "Enero 2027",
    filas: filasDelPrograma(salidas),
  });
  check(
    doc2.getNumberOfPages() === 1,
    `sin mapas, una sola hoja (${doc2.getNumberOfPages()})`,
  );

  // Un mes sin salidas tampoco rompe nada.
  const doc3 = new jsPDF({ unit: "pt", format: "letter" });
  dibujarProgramaPredicacion(doc3, autoTable, {
    titulo: "Programa de Predicación",
    periodo: "Marzo 2027",
    filas: [],
  });
  const vacio = await extractPdfItems(
    new Uint8Array(doc3.output("arraybuffer") as ArrayBuffer),
  );
  check(
    vacio.some((i) => i.text.includes("No hay salidas")),
    "un mes sin salidas lo dice en el PDF, en vez de salir en blanco",
  );
}

console.log(
  fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobación(es) fallaron.`,
);
process.exit(fallos === 0 ? 0 : 1);
