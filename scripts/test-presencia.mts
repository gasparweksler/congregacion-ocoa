// ============================================================================
//  Prueba del indicador "quién está conectado" (verde / rojo) del panel de
//  Plataforma.
//
//  Dos partes:
//    1. Las reglas, sin base de datos (src/lib/presencia.ts).
//    2. La base de datos de verdad: el latido, la despedida, que no se toque
//       `updatedAt`, que cada congregación vaya por su cuenta y que los datos
//       reales no se muevan.
//
//  La segunda parte trabaja en congregaciones de pruebas que se crean y se
//  borran aquí mismo ("ZZ Prueba presencia …"). Sus usuarios nacen con un
//  resumen de contraseña inválido a propósito: no se puede entrar con ellos.
//    npm run test:presencia
// ============================================================================
import { PrismaClient } from "@prisma/client";
import {
  estaConectado,
  desdeCuando,
  presenciaDe,
  LATIDO_SEGUNDOS,
  VENTANA_SEGUNDOS,
  type UsuarioPresencia,
} from "../src/lib/presencia.js";

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

const AHORA = new Date("2026-11-17T12:00:00.000Z");
const haceSegundos = (s: number) => new Date(AHORA.getTime() - s * 1000);
const persona = (p: Partial<UsuarioPresencia> = {}): UsuarioPresencia => ({
  id: p.id ?? "u1",
  name: p.name ?? "Hermano Uno",
  username: p.username ?? "uno",
  role: p.role ?? "SECRETARIO",
  active: p.active ?? true,
  lastSeenAt: p.lastSeenAt ?? null,
  lastActiveAt: p.lastActiveAt ?? null,
});

// ---------------------------------------------------------------------------
console.log("\n--- 1. Cuándo se considera conectado ---");

check(LATIDO_SEGUNDOS < VENTANA_SEGUNDOS, "la ventana es mayor que el latido");
check(
  VENTANA_SEGUNDOS / LATIDO_SEGUNDOS >= 3,
  "caben al menos 3 latidos en la ventana (un aviso perdido no apaga a nadie)",
  `${VENTANA_SEGUNDOS}/${LATIDO_SEGUNDOS}`,
);

check(estaConectado(AHORA, AHORA), "avisó ahora mismo: conectado");
check(estaConectado(haceSegundos(10), AHORA), "avisó hace 10 s: conectado");
check(
  estaConectado(haceSegundos(VENTANA_SEGUNDOS - 1), AHORA),
  "avisó justo dentro de la ventana: conectado",
);
check(
  !estaConectado(haceSegundos(VENTANA_SEGUNDOS + 1), AHORA),
  "avisó justo pasada la ventana: desconectado",
);
check(
  !estaConectado(haceSegundos(60 * 60), AHORA),
  "avisó hace una hora: desconectado",
);
check(!estaConectado(null, AHORA), "sin señal guardada: desconectado");
check(
  !estaConectado(undefined, AHORA),
  "sin dato ninguno: desconectado (no revienta)",
);
check(
  !estaConectado(new Date("fecha mala"), AHORA),
  "fecha ilegible: desconectado (no revienta)",
);
check(
  estaConectado(AHORA.toISOString(), AHORA),
  "acepta la fecha como texto (viene así del JSON)",
);
check(
  !estaConectado(new Date(AHORA.getTime() + 60 * 60 * 1000), AHORA),
  "una señal con fecha futura absurda no deja a nadie conectado para siempre",
);
check(
  estaConectado(new Date(AHORA.getTime() + 2000), AHORA),
  "unos segundos de desfase de reloj sí se perdonan",
);

// La diferencia entre "tiene la sesión iniciada" y "está conectado": la sesión
// dura días, así que lo único que cuenta es el último aviso del navegador.
check(
  !estaConectado(haceSegundos(60 * 60 * 24 * 3), AHORA),
  "entró hace tres días y no cerró sesión: NO aparece conectado",
);

// ---------------------------------------------------------------------------
console.log("\n--- 2. Cómo se cuenta el tiempo en palabras ---");

check(desdeCuando(null, AHORA) === "sin entrar todavía", "nunca entró");
check(
  desdeCuando(haceSegundos(5), AHORA) === "hace menos de un minuto",
  "hace 5 s",
  desdeCuando(haceSegundos(5), AHORA),
);
check(
  desdeCuando(haceSegundos(60 * 5), AHORA) === "hace 5 minutos",
  "hace 5 minutos",
  desdeCuando(haceSegundos(60 * 5), AHORA),
);
check(
  desdeCuando(haceSegundos(60 * 60), AHORA) === "hace una hora",
  "hace una hora",
  desdeCuando(haceSegundos(60 * 60), AHORA),
);
check(
  desdeCuando(haceSegundos(60 * 60 * 5), AHORA) === "hace 5 horas",
  "hace 5 horas",
  desdeCuando(haceSegundos(60 * 60 * 5), AHORA),
);
check(
  desdeCuando(haceSegundos(60 * 60 * 24), AHORA) === "ayer",
  "ayer",
  desdeCuando(haceSegundos(60 * 60 * 24), AHORA),
);
check(
  desdeCuando(haceSegundos(60 * 60 * 24 * 4), AHORA) === "hace 4 días",
  "hace 4 días",
  desdeCuando(haceSegundos(60 * 60 * 24 * 4), AHORA),
);
check(
  desdeCuando(haceSegundos(60 * 60 * 24 * 60), AHORA) === "hace 2 meses",
  "hace 2 meses",
  desdeCuando(haceSegundos(60 * 60 * 24 * 60), AHORA),
);
check(
  desdeCuando(haceSegundos(60 * 60 * 24 * 365), AHORA) === "hace un año",
  "hace un año",
  desdeCuando(haceSegundos(60 * 60 * 24 * 365), AHORA),
);

// ---------------------------------------------------------------------------
console.log("\n--- 3. La luz de cada congregación ---");

const vacia = presenciaDe([], AHORA);
check(
  !vacia.enLinea && vacia.conectados.length === 0,
  "congregación sin usuarios: roja, sin conectados",
);

const unaSola = presenciaDe(
  [
    persona({ id: "a", lastSeenAt: haceSegundos(10) }),
    persona({ id: "b", lastSeenAt: haceSegundos(60 * 60) }),
    persona({ id: "c", lastSeenAt: null }),
  ],
  AHORA,
);
check(unaSola.enLinea, "con una sola persona avisando, la congregación es verde");
check(
  unaSola.conectados.length === 1 && unaSola.conectados[0].id === "a",
  "y solo esa cuenta como conectada",
  unaSola.conectados.map((u) => u.id).join(","),
);
check(
  unaSola.desconectados.length === 2,
  "las otras dos quedan en la lista de desconectadas",
);

const todasViejas = presenciaDe(
  [
    persona({ id: "a", lastSeenAt: haceSegundos(VENTANA_SEGUNDOS + 30) }),
    persona({ id: "b", lastSeenAt: null }),
  ],
  AHORA,
);
check(
  !todasViejas.enLinea,
  "si nadie ha avisado hace poco, la congregación es roja",
);

const conInactivo = presenciaDe(
  [persona({ id: "a", active: false, lastSeenAt: haceSegundos(5) })],
  AHORA,
);
check(
  !conInactivo.enLinea && conInactivo.desconectados.length === 1,
  "un usuario desactivado no pone la congregación en verde",
);

const orden = presenciaDe(
  [
    persona({ id: "viejo", lastSeenAt: haceSegundos(120) }),
    persona({ id: "nuevo", lastSeenAt: haceSegundos(5) }),
    persona({ id: "medio", lastSeenAt: haceSegundos(60) }),
  ],
  AHORA,
);
check(
  orden.conectados.map((u) => u.id).join(",") === "nuevo,medio,viejo",
  "los conectados salen del más reciente al más antiguo",
  orden.conectados.map((u) => u.id).join(","),
);

const ordenFuera = presenciaDe(
  [
    persona({ id: "nunca", lastSeenAt: null, lastActiveAt: null }),
    persona({
      id: "anteayer",
      lastSeenAt: null,
      lastActiveAt: haceSegundos(60 * 60 * 48),
    }),
    persona({
      id: "hoy",
      lastSeenAt: null,
      lastActiveAt: haceSegundos(60 * 30),
    }),
  ],
  AHORA,
);
check(
  ordenFuera.desconectados.map((u) => u.id).join(",") === "hoy,anteayer,nunca",
  "entre los desconectados manda el último acceso, y los que nunca entraron van al final",
  ordenFuera.desconectados.map((u) => u.id).join(","),
);

// Cada congregación se mira aparte: es la misma función llamada dos veces con
// listas distintas, nunca una cuenta global.
const congA = presenciaDe([persona({ id: "a1", lastSeenAt: haceSegundos(5) })], AHORA);
const congB = presenciaDe([persona({ id: "b1", lastSeenAt: haceSegundos(9999) })], AHORA);
check(
  congA.enLinea && !congB.enLinea,
  "una congregación en verde no pone en verde a la otra",
);

// ---------------------------------------------------------------------------
console.log("\n--- 4. La base de datos de verdad ---");

const prisma = new PrismaClient();
const MARCA = "ZZ Prueba presencia";

// Si la columna todavía no existe, se avisa y no se finge que la prueba pasó.
const columnas = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
  `SELECT column_name FROM information_schema.columns
    WHERE table_name = 'User' AND column_name IN ('lastSeenAt', 'lastActiveAt')`,
);
const hayColumnas = columnas.length === 2;

if (!hayColumnas) {
  console.log(
    `  ⏭️  Saltada: faltan las columnas en la base (hay ${columnas.length} de 2).`,
  );
  console.log("      Ejecuta primero:  npm run db:migrate-presencia");
} else {
  // Los usuarios se borran a mano y PRIMERO: al borrar una congregación, sus
  // usuarios no desaparecen (se quedan sin congregación, por diseño, para no
  // perder historial). Si no se borran aquí, quedarían sueltos en la base.
  const USUARIO_PRUEBA = "zz-presencia-";
  async function borrarPruebas() {
    const borradosU = await prisma.user.deleteMany({
      where: { username: { startsWith: USUARIO_PRUEBA } },
    });
    const viejas = await prisma.congregation.findMany({
      where: { name: { startsWith: MARCA } },
      select: { id: true },
    });
    for (const c of viejas) await prisma.congregation.delete({ where: { id: c.id } });
    return { congregaciones: viejas.length, usuarios: borradosU.count };
  }

  const restos = await borrarPruebas();
  if (restos.congregaciones || restos.usuarios)
    console.log(
      `  (se limpiaron ${restos.congregaciones} congregación(es) y ${restos.usuarios} usuario(s) de pruebas anteriores)`,
    );

  // Foto de los datos reales ANTES de tocar nada.
  const usuariosAntes = await prisma.user.count();
  const realesAntes = await prisma.user.findMany({
    where: { congregation: { name: { not: { startsWith: MARCA } } } },
    select: { id: true, lastSeenAt: true, lastActiveAt: true, updatedAt: true },
    orderBy: { id: "asc" },
  });

  const sello = Date.now();
  const congA2 = await prisma.congregation.create({
    data: { name: `${MARCA} A ${sello}`, slug: `zz-presencia-a-${sello}` },
    select: { id: true },
  });
  const congB2 = await prisma.congregation.create({
    data: { name: `${MARCA} B ${sello}`, slug: `zz-presencia-b-${sello}` },
    select: { id: true },
  });

  try {
    // Resumen de contraseña inválido a propósito: con estos usuarios no se
    // puede iniciar sesión. Se borran al final junto con su congregación.
    const SIN_ACCESO = "sin-acceso-prueba-tecnica";
    const crear = (congregationId: string, n: string, extra = {}) =>
      prisma.user.create({
        data: {
          username: `zz-presencia-${n}-${sello}`,
          passwordHash: SIN_ACCESO,
          name: `Hermano ${n}`,
          role: "SECRETARIO",
          congregationId,
          ...extra,
        },
        select: { id: true, updatedAt: true },
      });

    const a1 = await crear(congA2.id, "a1");
    const a2 = await crear(congA2.id, "a2");
    const b1 = await crear(congB2.id, "b1");
    const apagado = await crear(congA2.id, "apagado", { active: false });

    const leer = (id: string) =>
      prisma.user.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          name: true,
          username: true,
          role: true,
          active: true,
          lastSeenAt: true,
          lastActiveAt: true,
          updatedAt: true,
        },
      });

    // --- recién creados: nadie conectado ---
    const reciente = await leer(a1.id);
    check(
      reciente.lastSeenAt === null && reciente.lastActiveAt === null,
      "un usuario nuevo nace sin señal de vida (nadie aparece conectado por existir)",
    );

    // --- el latido, con el mismo SQL que usa /api/presencia ---
    const latir = (id: string, ahora = new Date()) =>
      prisma.$executeRaw`UPDATE "User" SET "lastSeenAt" = ${ahora}, "lastActiveAt" = ${ahora} WHERE "id" = ${id}`;
    const despedirse = (id: string) =>
      prisma.$executeRaw`UPDATE "User" SET "lastSeenAt" = NULL WHERE "id" = ${id}`;

    const filas = await latir(a1.id);
    check(filas === 1, "un latido escribe exactamente una fila", `${filas}`);

    const traslatido = await leer(a1.id);
    check(
      estaConectado(traslatido.lastSeenAt, new Date()),
      "tras el latido, esa persona aparece conectada",
    );
    check(
      traslatido.lastActiveAt !== null,
      "y queda guardado su último acceso",
    );
    check(
      traslatido.updatedAt.getTime() === reciente.updatedAt.getTime(),
      "el latido NO toca `updatedAt` (no ensucia la ficha del usuario)",
      `${reciente.updatedAt.toISOString()} -> ${traslatido.updatedAt.toISOString()}`,
    );

    // --- el latido es solo de quien late ---
    const otro = await leer(a2.id);
    check(
      otro.lastSeenAt === null,
      "el latido de uno no marca conectado a su compañero",
    );
    const deOtraCong = await leer(b1.id);
    check(
      deOtraCong.lastSeenAt === null,
      "y menos a nadie de otra congregación",
    );

    // --- la luz de cada congregación, leyendo de la base ---
    const usuariosA = await prisma.user.findMany({
      where: { congregationId: congA2.id },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        active: true,
        lastSeenAt: true,
        lastActiveAt: true,
      },
    });
    const usuariosB = await prisma.user.findMany({
      where: { congregationId: congB2.id },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        active: true,
        lastSeenAt: true,
        lastActiveAt: true,
      },
    });
    const pA = presenciaDe(usuariosA, new Date());
    const pB = presenciaDe(usuariosB, new Date());
    check(pA.enLinea, "la congregación A sale en verde");
    check(!pB.enLinea, "la congregación B sigue en rojo, a la vez");
    check(
      pA.conectados.length === 1,
      "en A hay 1 conectado de 3",
      `${pA.conectados.length}`,
    );

    // --- un usuario desactivado que aún tuviera señal no cuenta ---
    await latir(apagado.id);
    const usuariosA2 = await prisma.user.findMany({
      where: { congregationId: congA2.id },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        active: true,
        lastSeenAt: true,
        lastActiveAt: true,
      },
    });
    const pA2 = presenciaDe(usuariosA2, new Date());
    check(
      pA2.conectados.length === 1 && pA2.conectados[0].id === a1.id,
      "un usuario desactivado no aparece conectado ni aunque llegue su latido",
      pA2.conectados.map((u) => u.name).join(","),
    );

    // --- la despedida (cerrar sesión o cerrar la pestaña) ---
    const antesDeIrse = await leer(a1.id);
    await despedirse(a1.id);
    const tras = await leer(a1.id);
    check(tras.lastSeenAt === null, "al despedirse, deja de estar conectado al instante");
    check(
      tras.lastActiveAt?.getTime() === antesDeIrse.lastActiveAt?.getTime(),
      "pero se conserva cuándo fue su último acceso",
    );
    check(
      tras.updatedAt.getTime() === antesDeIrse.updatedAt.getTime(),
      "la despedida tampoco toca `updatedAt`",
    );
    const pA3 = presenciaDe(
      await prisma.user.findMany({
        where: { congregationId: congA2.id },
        select: {
          id: true,
          name: true,
          username: true,
          role: true,
          active: true,
          lastSeenAt: true,
          lastActiveAt: true,
        },
      }),
      new Date(),
    );
    check(!pA3.enLinea, "y la congregación A vuelve a rojo");
    check(
      desdeCuando(tras.lastActiveAt, new Date()) === "hace menos de un minuto",
      "aun desconectada, se puede decir cuándo entró por última vez",
      desdeCuando(tras.lastActiveAt, new Date()),
    );

    // --- una señal vieja se apaga sola (pestaña abandonada) ---
    const viejo = new Date(Date.now() - (VENTANA_SEGUNDOS + 60) * 1000);
    await prisma.$executeRaw`UPDATE "User" SET "lastSeenAt" = ${viejo} WHERE "id" = ${a2.id}`;
    const abandonado = await leer(a2.id);
    check(
      !estaConectado(abandonado.lastSeenAt, new Date()),
      "una pestaña que dejó de avisar se apaga sola, sin que nadie la marque",
    );
  } finally {
    const borradas = await borrarPruebas();
    console.log(
      `  (limpieza: ${borradas.congregaciones} congregación(es) y ${borradas.usuarios} usuario(s) de prueba borrados)`,
    );
  }

  // --- los datos reales, intactos ---
  const usuariosDespues = await prisma.user.count();
  check(
    usuariosDespues === usuariosAntes,
    "quedan los mismos usuarios que al empezar",
    `${usuariosAntes} -> ${usuariosDespues}`,
  );
  const realesDespues = await prisma.user.findMany({
    where: { congregation: { name: { not: { startsWith: MARCA } } } },
    select: { id: true, lastSeenAt: true, lastActiveAt: true, updatedAt: true },
    orderBy: { id: "asc" },
  });
  const igual = (a: Date | null, b: Date | null) =>
    (a?.getTime() ?? null) === (b?.getTime() ?? null);
  check(
    realesDespues.length === realesAntes.length &&
      realesDespues.every((u, i) => {
        const v = realesAntes[i];
        return (
          v.id === u.id &&
          igual(v.lastSeenAt, u.lastSeenAt) &&
          igual(v.lastActiveAt, u.lastActiveAt) &&
          igual(v.updatedAt, u.updatedAt)
        );
      }),
    "ningún usuario real cambió (ni su señal, ni su último acceso, ni su ficha)",
  );
}

await prisma.$disconnect();

// ---------------------------------------------------------------------------
console.log(`\n=== ${ok} bien, ${bad} mal ===`);
if (!hayColumnas) {
  console.log("(la parte de base de datos quedó pendiente de la migración)");
}
process.exit(bad === 0 ? 0 : 1);
