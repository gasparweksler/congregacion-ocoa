// ============================================================================
//  Estadísticas de Predicación: el historial, las cuentas y el permiso.
//
//  Dos partes:
//
//   1. Las funciones, con casos inventados y sin tocar la base: cómo se
//      agrupan las salidas en programas, qué dice cada programa y quién
//      puede entrar a la sección.
//
//   2. La base de datos de verdad, dentro de una transacción que SE REVIERTE
//      al final: se crea una congregación de prueba con sus territorios y
//      tres meses de salidas, se comprueba que la pantalla las ve como tres
//      programas, que las estadísticas cuadran, que al borrar un programa se
//      recalculan, y que dos usuarios con el permiso leen exactamente lo
//      mismo. No queda ni una fila.
//
//    npm run test:predicacion
// ============================================================================
import { PrismaClient } from "@prisma/client";
import {
  canAccessService,
  type SessionUser,
} from "../src/lib/access.js";
import {
  estadisticas,
  historialDeProgramas,
  nombreCompleto,
  type VezPredicado,
} from "../src/lib/territorios.js";

const p = new PrismaClient();
class Rollback extends Error {}

let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};

/** Mediodía local, como se guardan todas las fechas de la aplicación. */
const dia = (anio: number, mes: number, d: number) =>
  new Date(anio, mes - 1, d, 12, 0, 0);

// ===========================================================================
//  1. LAS FUNCIONES
// ===========================================================================

console.log("\n1) El historial se arma agrupando las salidas por mes\n");

const salidasDePrueba = [
  // Octubre: del día 1 al último, dos territorios, una sin territorio.
  { date: dia(2026, 10, 1), territoryId: "t1", groups: "" },
  { date: dia(2026, 10, 4), territoryId: "t2", groups: "" },
  { date: dia(2026, 10, 31), territoryId: null, groups: "" },
  // Noviembre: solo la primera quincena, con una salida por grupos.
  { date: dia(2026, 11, 7), territoryId: "t1", groups: "Grupo 1|Grupo 2" },
  { date: dia(2026, 11, 8), territoryId: "t3", groups: "" },
  { date: dia(2026, 11, 15), territoryId: "t1", groups: "" },
  // Diciembre: un solo día.
  { date: dia(2026, 12, 6), territoryId: "t2", groups: "Grupo 3" },
];

const historial = historialDeProgramas(salidasDePrueba);
check(historial.length === 3, `tres meses con salidas = tres programas (${historial.length})`);
check(
  historial.map((h) => h.clave).join(" ") === "2026-12 2026-11 2026-10",
  `del más nuevo al más viejo: ${historial.map((h) => h.clave).join(" ")}`,
);

const noviembre = historial.find((h) => h.clave === "2026-11")!;
check(noviembre.salidas === 3, `noviembre tiene 3 salidas (${noviembre.salidas})`);
check(
  noviembre.territorios === 2,
  `noviembre trabajó 2 territorios distintos, no 3 salidas (${noviembre.territorios})`,
);
check(noviembre.deGrupo === 1, `noviembre tiene 1 salida por grupos (${noviembre.deGrupo})`);
check(noviembre.sinTerritorio === 0, "noviembre no tiene salidas sin territorio");
check(
  noviembre.periodo === "Del 7 al 15 de noviembre de 2026",
  `el período dice lo que abarca: "${noviembre.periodo}"`,
);
check(noviembre.etiqueta === "Noviembre 2026", `se titula "${noviembre.etiqueta}"`);

const octubre = historial.find((h) => h.clave === "2026-10")!;
check(
  octubre.periodo === "Octubre 2026",
  `un programa que va del día 1 al último se titula solo con el mes: "${octubre.periodo}"`,
);
check(
  octubre.sinTerritorio === 1,
  `octubre avisa de 1 salida sin territorio (${octubre.sinTerritorio})`,
);
check(
  octubre.territorios === 2,
  `y no la cuenta como territorio (${octubre.territorios})`,
);

const diciembre = historial.find((h) => h.clave === "2026-12")!;
check(
  diciembre.periodo === "6 de diciembre de 2026",
  `un programa de un solo día lo dice así: "${diciembre.periodo}"`,
);

check(
  historialDeProgramas([]).length === 0,
  "sin salidas no hay ningún programa (lo que queda al borrarlo)",
);
check(
  historialDeProgramas(
    salidasDePrueba.filter((s) => s.date.getMonth() + 1 !== 11),
  ).length === 2,
  "al quitar las salidas de un mes, ese programa desaparece del historial",
);

// El orden en que lleguen las salidas no debe cambiar nada.
const alRevés = historialDeProgramas([...salidasDePrueba].reverse());
check(
  JSON.stringify(alRevés) === JSON.stringify(historial),
  "da igual en qué orden lleguen las salidas",
);

console.log("\n2) Las cuentas de cada territorio\n");

const territorios = [
  { id: "t1", number: 1, name: "Centro", order: 1 },
  { id: "t2", number: 2, name: "La Loma", order: 2 },
  { id: "t3", number: 3, name: "Vista Hermosa", order: 3 },
  { id: "t4", number: 4, name: "El Llano", order: 4 },
];
const veces: VezPredicado[] = salidasDePrueba
  .filter((s) => s.territoryId)
  .map((s) => ({
    territoryId: s.territoryId as string,
    date: s.date,
    origen: "programa" as const,
  }));

const hoy = dia(2027, 1, 6);
const stats = estadisticas(territorios, veces, hoy);
const de = (id: string) => stats.find((s) => s.territorio.id === id)!;

check(de("t1").veces === 3, `el Centro salió 3 veces (${de("t1").veces})`);
check(de("t2").veces === 2, `La Loma, 2 (${de("t2").veces})`);
check(de("t3").veces === 1, `Vista Hermosa, 1 (${de("t3").veces})`);
check(de("t4").veces === 0, `El Llano, ninguna (${de("t4").veces})`);
check(de("t4").ultima === null, "El Llano no tiene última vez: nunca se predicó");
check(
  de("t2").ultima?.getTime() === dia(2026, 12, 6).getTime(),
  "la última vez de La Loma es la salida más nueva, no la primera",
);
check(
  de("t1").diasSinPredicar === 52,
  `el Centro lleva 52 días sin predicarse (${de("t1").diasSinPredicar})`,
);
check(
  nombreCompleto(de("t3").territorio) === "3 - Vista Hermosa",
  "los territorios se nombran con su número",
);

console.log("\n3) Quién puede entrar a Superintendente de Servicio\n");

const base: SessionUser = {
  id: "u", username: "u", name: "Hermano", role: "SUPERINTENDENTE",
  groupId: "g1", congregationId: "c1", congregationName: "Ocoa",
  mustChangePassword: false, alsoConfirmador: false, alsoTerritorios: false,
};
check(
  canAccessService({ ...base, role: "SECRETARIO" }),
  "el Administrador entra siempre",
);
check(
  canAccessService({ ...base, role: "SUPERADMIN" }),
  "el Superadministrador también",
);
check(
  !canAccessService(base),
  "un Superintendente de grupo SIN la casilla no entra",
);
check(
  canAccessService({ ...base, alsoTerritorios: true }),
  "con la casilla puesta, sí entra",
);
check(
  canAccessService({ ...base, role: "AUXILIAR", alsoTerritorios: true }),
  "un Auxiliar con la casilla, también",
);
check(
  canAccessService({
    ...base,
    role: "RESPONSABLE_CONFIRMACIONES",
    alsoTerritorios: true,
  }),
  "y un Encargado de Confirmaciones con la casilla, también",
);
check(
  !canAccessService({
    ...base,
    role: "RESPONSABLE_CONFIRMACIONES",
    alsoConfirmador: true,
  }),
  "el permiso de Confirmaciones NO abre Territorios",
);

// ===========================================================================
//  2. LA BASE DE DATOS DE VERDAD (y todo se revierte)
// ===========================================================================

console.log("\n4) Contra la base de datos, dentro de una transacción\n");

const congregacionesAntes = await p.congregation.count();
const salidasAntes = await p.serviceOuting.count();
const territoriosAntes = await p.territory.count();

try {
  await p.$transaction(
    async (tx) => {
      const cong = await tx.congregation.create({
        data: { name: "Congregación de Prueba (estadísticas)", slug: "prueba-estadisticas" },
      });
      const otra = await tx.congregation.create({
        data: { name: "Congregación Vecina (estadísticas)", slug: "prueba-estadisticas-2" },
      });

      const terr = [];
      for (const [i, nombre] of ["Centro", "La Loma", "Vista Hermosa", "El Llano"].entries()) {
        terr.push(
          await tx.territory.create({
            data: {
              number: i + 1,
              name: nombre,
              order: i + 1,
              congregationId: cong.id,
            },
          }),
        );
      }

      // Tres programas: septiembre, octubre y noviembre de 2026.
      const plan: { mes: number; d: number; t: number; grupos: string }[] = [
        { mes: 9, d: 5, t: 0, grupos: "" },
        { mes: 9, d: 6, t: 1, grupos: "" },
        { mes: 9, d: 12, t: 2, grupos: "" },
        { mes: 10, d: 3, t: 0, grupos: "" },
        { mes: 10, d: 4, t: 1, grupos: "Grupo 1|Grupo 2" },
        { mes: 11, d: 7, t: 0, grupos: "" },
        { mes: 11, d: 8, t: 2, grupos: "" },
        { mes: 11, d: 14, t: 1, grupos: "" },
        { mes: 11, d: 15, t: 2, grupos: "" },
      ];
      for (const s of plan) {
        await tx.serviceOuting.create({
          data: {
            congregationId: cong.id,
            date: dia(2026, s.mes, s.d),
            turno: "MANANA",
            time: "9:30",
            place: "Salón del Reino",
            captainName: "Hermano Capitán",
            territoryId: terr[s.t].id,
            groups: s.grupos,
          },
        });
      }

      // La congregación vecina también tiene su programa de noviembre.
      const terrVecino = await tx.territory.create({
        data: { number: 1, name: "Ajeno", order: 1, congregationId: otra.id },
      });
      await tx.serviceOuting.create({
        data: {
          congregationId: otra.id,
          date: dia(2026, 11, 7),
          turno: "MANANA",
          time: "9:30",
          place: "Otro salón",
          captainName: "Otro hermano",
          territoryId: terrVecino.id,
          groups: "",
        },
      });

      // --- La consulta de la pantalla, tal cual ---------------------------
      const comoLaPantalla = async (congregationId: string) => {
        const [tt, ss, vv] = await Promise.all([
          tx.territory.findMany({
            where: { congregationId },
            orderBy: [{ order: "asc" }, { number: "asc" }],
            select: { id: true, number: true, name: true, order: true },
          }),
          tx.serviceOuting.findMany({
            where: { congregationId },
            orderBy: { date: "asc" },
            select: { date: true, territoryId: true, groups: true },
          }),
          tx.territoryVisit.findMany({
            where: { congregationId },
            select: { territoryId: true, date: true },
          }),
        ]);
        const todas: VezPredicado[] = [
          ...vv.map((v) => ({
            territoryId: v.territoryId,
            date: v.date,
            origen: "manual" as const,
          })),
          ...ss
            .filter((s) => Boolean(s.territoryId))
            .map((s) => ({
              territoryId: s.territoryId as string,
              date: s.date,
              origen: "programa" as const,
            })),
        ];
        return {
          programas: historialDeProgramas(ss),
          stats: estadisticas(tt, todas, dia(2026, 12, 1)),
          veces: todas.length,
        };
      };

      const vista = await comoLaPantalla(cong.id);
      check(
        vista.programas.length === 3,
        `los tres meses guardados aparecen como 3 programas (${vista.programas.length})`,
      );
      check(
        vista.programas[0].clave === "2026-11",
        `el más nuevo va primero (${vista.programas[0].clave})`,
      );
      check(
        vista.programas[0].salidas === 4 && vista.programas[0].territorios === 3,
        `noviembre: 4 salidas y 3 territorios (${vista.programas[0].salidas}/${vista.programas[0].territorios})`,
      );
      check(vista.veces === 9, `9 veces predicado en total (${vista.veces})`);
      const centro = vista.stats.find((s) => s.territorio.name === "Centro")!;
      const llano = vista.stats.find((s) => s.territorio.name === "El Llano")!;
      check(centro.veces === 3, `el Centro salió 3 veces (${centro.veces})`);
      check(
        llano.veces === 0 && llano.ultima === null,
        "El Llano no salió nunca y la pantalla lo dirá",
      );

      // --- La congregación vecina no se ve -------------------------------
      const vistaVecina = await comoLaPantalla(otra.id);
      check(
        vistaVecina.programas.length === 1 && vistaVecina.veces === 1,
        "cada congregación ve solo sus programas",
      );

      // --- Dos usuarios con el permiso leen lo mismo ---------------------
      const uno = await tx.user.create({
        data: {
          username: "prueba-terr-1",
          passwordHash: "x",
          name: "Hermano Uno",
          role: "SUPERINTENDENTE",
          congregationId: cong.id,
          alsoTerritorios: true,
        },
      });
      const dos = await tx.user.create({
        data: {
          username: "prueba-terr-2",
          passwordHash: "x",
          name: "Hermano Dos",
          role: "AUXILIAR",
          congregationId: cong.id,
          alsoTerritorios: true,
        },
      });
      const sesion = (u: { id: string; role: string; congregationId: string | null; alsoTerritorios: boolean }): SessionUser => ({
        id: u.id, username: u.id, name: "x", role: u.role as SessionUser["role"],
        groupId: null, congregationId: u.congregationId,
        congregationName: "Prueba", mustChangePassword: false,
        alsoConfirmador: false, alsoTerritorios: u.alsoTerritorios,
      });
      check(
        canAccessService(sesion(uno)) && canAccessService(sesion(dos)),
        "los dos usuarios con la casilla tienen acceso",
      );
      // La consulta no lleva usuario, solo congregación: por eso los dos ven
      // lo mismo sin que haya que copiar nada para cada uno.
      const vistaUno = await comoLaPantalla(uno.congregationId!);
      const vistaDos = await comoLaPantalla(dos.congregationId!);
      check(
        JSON.stringify(vistaUno) === JSON.stringify(vistaDos),
        "y ven exactamente los mismos programas y estadísticas",
      );

      const sinPermiso = await tx.user.update({
        where: { id: dos.id },
        data: { alsoTerritorios: false },
      });
      check(
        !canAccessService(sesion(sinPermiso)),
        "al quitarle la casilla, pierde el acceso",
      );

      // --- Borrar un programa (lo que hace borrarProgramasAction) ---------
      const borrado = await tx.serviceOuting.deleteMany({
        where: {
          congregationId: cong.id,
          OR: [
            {
              date: {
                gte: new Date(2026, 10, 1, 0, 0, 0),
                lt: new Date(2026, 11, 1, 0, 0, 0),
              },
            },
          ],
        },
      });
      check(borrado.count === 4, `se borraron las 4 salidas de noviembre (${borrado.count})`);

      const despues = await comoLaPantalla(cong.id);
      check(
        despues.programas.length === 2 &&
          despues.programas.every((h) => h.clave !== "2026-11"),
        "noviembre ya no está en el historial",
      );
      check(despues.veces === 5, `las veces bajan de 9 a 5 (${despues.veces})`);
      const centroDespues = despues.stats.find((s) => s.territorio.name === "Centro")!;
      check(
        centroDespues.veces === 2,
        `el Centro pasa de 3 veces a 2 (${centroDespues.veces})`,
      );
      check(
        centroDespues.ultima?.getTime() === dia(2026, 10, 3).getTime(),
        "y su última vez vuelve a ser la de octubre",
      );
      const vecinaDespues = await comoLaPantalla(otra.id);
      check(
        vecinaDespues.programas.length === 1,
        "el programa de la congregación vecina sigue intacto",
      );

      // --- Borrar varios de una vez --------------------------------------
      const variosBorrados = await tx.serviceOuting.deleteMany({
        where: {
          congregationId: cong.id,
          OR: [
            { date: { gte: new Date(2026, 8, 1), lt: new Date(2026, 9, 1) } },
            { date: { gte: new Date(2026, 9, 1), lt: new Date(2026, 10, 1) } },
          ],
        },
      });
      check(
        variosBorrados.count === 5,
        `borrando dos programas a la vez se van 5 salidas (${variosBorrados.count})`,
      );
      const vacio = await comoLaPantalla(cong.id);
      check(
        vacio.programas.length === 0 && vacio.veces === 0,
        "el historial queda vacío y las estadísticas en cero",
      );
      check(
        vacio.stats.length === 4 && vacio.stats.every((s) => s.ultima === null),
        "los territorios siguen ahí, pero sin ninguna vez predicados",
      );

      throw new Rollback();
    },
    { timeout: 60_000 },
  );
} catch (error) {
  if (!(error instanceof Rollback)) throw error;
}

console.log("\n5) No quedó nada en la base\n");
check(
  (await p.congregation.count()) === congregacionesAntes,
  `las congregaciones son las mismas (${congregacionesAntes})`,
);
check(
  (await p.serviceOuting.count()) === salidasAntes,
  `las salidas son las mismas (${salidasAntes})`,
);
check(
  (await p.territory.count()) === territoriosAntes,
  `los territorios son los mismos (${territoriosAntes})`,
);
check(
  (await p.user.count({ where: { username: { startsWith: "prueba-terr-" } } })) === 0,
  "no quedó ningún usuario de prueba",
);

await p.$disconnect();
console.log(fallos === 0 ? "\nTodo bien.\n" : `\n${fallos} fallo(s).\n`);
process.exit(fallos === 0 ? 0 : 1);
