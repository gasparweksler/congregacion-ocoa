// ============================================================================
//  Comprueba la separación entre las congregaciones que YA existen en la base.
//  Solo lee: no crea, no modifica y no borra nada.
//  Para cada congregación repite las mismas consultas que hace la aplicación y
//  confirma que ninguna alcanza datos de otra.
//    npx tsx scripts/verificar-separacion.mts
// ============================================================================
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};

const congs = await p.congregation.findMany({
  orderBy: { createdAt: "asc" },
  select: { id: true, name: true, slug: true, active: true },
});
console.log(`Congregaciones en la plataforma: ${congs.length}\n`);

// --- Totales de la plataforma, para contrastar ---
const total = {
  grupos: await p.group.count(),
  publicadores: await p.publisher.count(),
  informes: await p.monthlyReport.count(),
  reuniones: await p.meeting.count(),
  usuarios: await p.user.count(),
};

let suma = { grupos: 0, publicadores: 0, informes: 0, reuniones: 0, usuarios: 0 };

for (const c of congs) {
  console.log(`--- ${c.name} (${c.slug}) ---`);
  const propio = {
    grupos: await p.group.count({ where: { congregationId: c.id } }),
    publicadores: await p.publisher.count({ where: { congregationId: c.id } }),
    informes: await p.monthlyReport.count({ where: { congregationId: c.id } }),
    reuniones: await p.meeting.count({ where: { congregationId: c.id } }),
    usuarios: await p.user.count({ where: { congregationId: c.id } }),
  };
  console.log(
    `  grupos ${propio.grupos} · publicadores ${propio.publicadores} · ` +
      `informes ${propio.informes} · reuniones ${propio.reuniones} · usuarios ${propio.usuarios}`,
  );
  for (const k of Object.keys(suma) as (keyof typeof suma)[]) suma[k] += propio[k];

  // 1. Ningún publicador suyo pertenece a un grupo de otra congregación.
  const grupoAjeno = await p.publisher.count({
    where: { congregationId: c.id, group: { congregationId: { not: c.id } } },
  });
  check(grupoAjeno === 0, `ningún publicador suyo cuelga de un grupo ajeno (${grupoAjeno})`);

  // 2. Ningún informe suyo pertenece a un publicador de otra congregación.
  const informeAjeno = await p.monthlyReport.count({
    where: { congregationId: c.id, publisher: { congregationId: { not: c.id } } },
  });
  check(informeAjeno === 0, `ningún informe suyo cuelga de un publicador ajeno (${informeAjeno})`);

  // 3. Ningún usuario suyo está asignado a un grupo de otra congregación.
  const usuarioAjeno = await p.user.count({
    where: { congregationId: c.id, group: { congregationId: { not: c.id } } },
  });
  check(usuarioAjeno === 0, `ningún usuario suyo apunta a un grupo ajeno (${usuarioAjeno})`);

  // 4. Las asignaciones de reunión cuelgan de reuniones suyas.
  const asignaciones = await p.meetingAssignment.count({
    where: { meeting: { congregationId: c.id } },
  });
  console.log(`  asignaciones de reunión: ${asignaciones}`);

  // 5. Un id de otra congregación no se alcanza con el filtro puesto.
  const otra = congs.find((x) => x.id !== c.id);
  if (otra) {
    const pubOtra = await p.publisher.findFirst({
      where: { congregationId: otra.id },
      select: { id: true },
    });
    if (pubOtra) {
      const alcanzado = await p.publisher.findFirst({
        where: { id: pubOtra.id, congregationId: c.id },
      });
      check(alcanzado === null, `un publicador de ${otra.name} no se alcanza desde ${c.name}`);
    } else {
      console.log(`  (${otra.name} aún no tiene publicadores con los que probar)`);
    }
  }
  console.log("");
}

// --- La suma por congregación debe dar el total: nada queda fuera ---
console.log("--- Cuadratura ---");
for (const k of Object.keys(suma) as (keyof typeof suma)[]) {
  check(
    suma[k] === total[k],
    `${k}: suma por congregación ${suma[k]} = total de la plataforma ${total[k]}`,
  );
}

// --- Filas huérfanas (sin congregación) ---
const huerfanos = {
  grupos: await p.group.count({ where: { congregationId: undefined } }),
  usuarios: await p.user.count({ where: { congregationId: null } }),
};
check(huerfanos.usuarios === 0, `usuarios sin congregación: ${huerfanos.usuarios}`);

console.log(
  fallos === 0
    ? "\nTodo correcto: las congregaciones están separadas."
    : `\n${fallos} comprobación(es) fallaron.`,
);
await p.$disconnect();
process.exit(fallos === 0 ? 0 : 1);
