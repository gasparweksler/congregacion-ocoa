// ============================================================================
//  Diagnóstico de velocidad: ¿por qué tarda tanto guardar un mes?
//
//  Mide, sin tocar ni un dato:
//   1. Cuánto cuesta UNA consulta (ida y vuelta a Supabase).
//   2. Si tres personas a la vez se estorban entre ellas o no.
//   3. Cuántas consultas hace de verdad guardar una responsabilidad.
//
//    npx tsx scripts/test-latencia.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

const ms = (t: number) => `${t.toFixed(0)} ms`;

async function medir(veces: number): Promise<number[]> {
  const tiempos: number[] = [];
  for (let i = 0; i < veces; i++) {
    const t = performance.now();
    await p.$queryRaw`SELECT 1`;
    tiempos.push(performance.now() - t);
  }
  return tiempos;
}

const media = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const mediana = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

console.log("DIAGNÓSTICO DE VELOCIDAD\n");

// --- 1. Ida y vuelta ---
console.log("1. Coste de una consulta suelta (SELECT 1)");
await medir(3); // calentar la conexión
const sueltas = await medir(20);
console.log(`   media ${ms(media(sueltas))} · mediana ${ms(mediana(sueltas))}`);
console.log(`   mínima ${ms(Math.min(...sueltas))} · máxima ${ms(Math.max(...sueltas))}`);

// --- 2. ¿Se estorban tres personas a la vez? ---
console.log("\n2. Una persona sola frente a tres a la vez (30 consultas cada una)");
const t1 = performance.now();
const sola = await medir(30);
const duracionSola = performance.now() - t1;
console.log(`   1 persona : ${ms(duracionSola)} en total · ${ms(media(sola))} por consulta`);

const t3 = performance.now();
const tres = await Promise.all([medir(30), medir(30), medir(30)]);
const duracionTres = performance.now() - t3;
console.log(
  `   3 a la vez: ${ms(duracionTres)} en total · ${ms(media(tres.flat()))} por consulta`,
);
const penalizacion = media(tres.flat()) / media(sola);
console.log(
  `   → cada consulta tarda ${penalizacion.toFixed(2)}× más cuando son tres` +
    (penalizacion < 1.3 ? "  (no se estorban)" : "  (SE ESTORBAN)"),
);

// --- 3. ¿Cuántas consultas hace la aplicación por cada casilla guardada? ---
console.log("\n3. Consultas por casilla de responsabilidad guardada");
console.log("   setMonthlyResponsibility hace, en fila y esperando cada una:");
const pasos = [
  "meeting.findMany (buscar la reunión de la semana)",
  "meetingAssignment.findFirst (buscar la casilla)",
  "meetingAssignment.update (escribir el nombre)",
  "auditLog.create (anotar en la auditoría)",
];
pasos.forEach((s, i) => console.log(`     ${i + 1}. ${s}`));
const porCasilla = pasos.length;
const casillasMes = 8 * 9; // 8 responsabilidades × ~9 fechas del mes
const estimado = (porCasilla * casillasMes * media(sueltas)) / 1000;
console.log(
  `   → ${porCasilla} idas y vueltas × ${casillasMes} casillas = ` +
    `${porCasilla * casillasMes} viajes ≈ ${estimado.toFixed(0)} s solo de espera`,
);

// --- 4. Lo mismo, pero pidiéndolo todo junto ---
console.log("\n4. Las mismas 20 consultas, de cuatro maneras");
const tA = performance.now();
for (let i = 0; i < 20; i++) await p.$queryRaw`SELECT 1`;
const enFila = performance.now() - tA;

const tB = performance.now();
await Promise.all(Array.from({ length: 20 }, () => p.$queryRaw`SELECT 1`));
const juntas = performance.now() - tB;

const tC = performance.now();
await p.$transaction(Array.from({ length: 20 }, () => p.$queryRaw`SELECT 1`));
const lote = performance.now() - tC;

const tD = performance.now();
await p.$queryRaw`SELECT generate_series(1,20)`;
const una = performance.now() - tD;

console.log(`   a) en fila, una tras otra (lo que hace hoy) : ${ms(enFila)}`);
console.log(`   b) lanzadas a la vez (Promise.all)          : ${ms(juntas)}  → ${(enFila / juntas).toFixed(1)}× más rápido`);
console.log(`   c) agrupadas en un $transaction([])         : ${ms(lote)}  → ${(enFila / lote).toFixed(1)}× más rápido`);
console.log(`   d) una sola consulta que trae las 20 filas  : ${ms(una)}  → ${(enFila / una).toFixed(0)}× más rápido`);

await p.$disconnect();
