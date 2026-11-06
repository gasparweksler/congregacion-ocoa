"use server";

// ============================================================================
//  Server Actions de TERRITORIOS (sección Superintendente de Servicio).
//
//  Todo va acotado a la congregación de la sesión: los territorios de una
//  congregación no se ven ni se tocan desde otra. El acceso es del
//  Administrador (y del Superadministrador en su congregación).
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSecretary, congregationId } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { type FormState, sinDuplicar } from "@/server/actions-shared";
import {
  territorySchema,
  territoryVisitSchema,
  serviceOutingSchema,
  tarjetaImportadaSchema,
} from "@/lib/validations";
import {
  fechaDeISO,
  leerListaDeTerritorios,
  nombreCompleto,
  siguienteNumero,
  TURNOS,
  PRESET_KINDS,
  type ResultadoImportacion,
  type PaginaImportada,
} from "@/lib/territorios";
import { monthName } from "@/lib/constants";

/** Las pantallas que hay que refrescar cuando algo cambia. */
function refrescar(territoryId?: string): void {
  revalidatePath("/territorios");
  revalidatePath("/territorios/mapas");
  revalidatePath("/territorios/estadisticas");
  revalidatePath("/territorios/programa");
  if (territoryId) revalidatePath(`/territorios/${territoryId}`);
}

// ---------------------------------------------------------------------------
//  GESTIÓN DE TERRITORIOS
// ---------------------------------------------------------------------------

export async function createTerritorioAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireSecretary();
  const cong = congregationId(user);

  const parsed = territorySchema.safeParse({
    number: formData.get("number"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const ultimo = await prisma.territory.findFirst({
    where: { congregationId: cong },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const alta = await sinDuplicar(
    () =>
      prisma.territory.create({
        data: {
          congregationId: cong,
          number: parsed.data.number,
          name: parsed.data.name,
          order: (ultimo?.order ?? 0) + 1,
        },
      }),
    `Ya existe un territorio con el número ${parsed.data.number}.`,
  );
  if (!alta.ok) return { error: alta.error };

  await logAudit({
    userId: user.id,
    action: "CREAR",
    entity: "Territorio",
    entityId: alta.valor.id,
    details: `Territorio creado: ${nombreCompleto(alta.valor)}`,
  });

  refrescar();
  return { success: `Territorio "${nombreCompleto(alta.valor)}" agregado.` };
}

/**
 * Alta de muchos territorios de una vez, pegando una lista.
 * Los que ya existen (por número) se saltan y se avisa, en vez de fallar.
 */
export async function createTerritoriosEnLoteAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireSecretary();
  const cong = congregationId(user);

  const lineas = leerListaDeTerritorios(String(formData.get("lista") ?? ""));
  if (lineas.length === 0) {
    return { error: "Pega al menos un territorio, uno por línea." };
  }
  if (lineas.length > 300) {
    return {
      error: `Son ${lineas.length} líneas de una vez y el máximo es 300. Pégalas en dos veces.`,
    };
  }

  const existentes = await prisma.territory.findMany({
    where: { congregationId: cong },
    select: { number: true, order: true },
  });
  const numerosUsados = new Set(existentes.map((t) => t.number));
  let orden = existentes.reduce((m, t) => Math.max(m, t.order), 0);

  const nuevos: { number: number; name: string; order: number }[] = [];
  const repetidos: number[] = [];
  const largos: string[] = [];

  for (const linea of lineas) {
    const nombre = linea.nombre.slice(0, 120);
    if (linea.nombre.length > 120) largos.push(nombre);
    const numero =
      linea.numero ?? siguienteNumero([...numerosUsados].concat(0));
    if (numerosUsados.has(numero)) {
      repetidos.push(numero);
      continue;
    }
    numerosUsados.add(numero);
    orden += 1;
    nuevos.push({ number: numero, name: nombre, order: orden });
  }

  if (nuevos.length === 0) {
    return {
      error:
        "Ninguno se pudo agregar: todos esos números ya existen " +
        `(${repetidos.slice(0, 10).join(", ")}).`,
    };
  }

  // skipDuplicates: si otra persona creó el mismo número a la vez, no rompe.
  const { count } = await prisma.territory.createMany({
    data: nuevos.map((n) => ({ ...n, congregationId: cong })),
    skipDuplicates: true,
  });

  await logAudit({
    userId: user.id,
    action: "CREAR",
    entity: "Territorio",
    details: `Alta en lote: ${count} territorio(s) agregados${
      repetidos.length > 0 ? `, ${repetidos.length} repetidos saltados` : ""
    }.`,
  });

  refrescar();
  const avisos: string[] = [];
  if (repetidos.length > 0) {
    avisos.push(
      `Se saltaron ${repetidos.length} porque esos números ya existían (${repetidos
        .slice(0, 8)
        .join(", ")}${repetidos.length > 8 ? "…" : ""})`,
    );
  }
  if (largos.length > 0) {
    avisos.push(`${largos.length} nombre(s) se recortaron a 120 letras`);
  }
  return {
    success:
      `Se agregaron ${count} territorio(s).` +
      (avisos.length > 0 ? ` ${avisos.join(". ")}.` : ""),
  };
}

export async function updateTerritorioAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireSecretary();
  const cong = congregationId(user);
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Territorio no especificado." };

  const parsed = territorySchema.safeParse({
    number: formData.get("number"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  // updateMany acota por congregación: no se puede editar uno ajeno.
  const cambio = await sinDuplicar(
    () =>
      prisma.territory.updateMany({
        where: { id, congregationId: cong },
        data: { number: parsed.data.number, name: parsed.data.name },
      }),
    `Ya existe otro territorio con el número ${parsed.data.number}.`,
  );
  if (!cambio.ok) return { error: cambio.error };
  if (cambio.valor.count === 0) return { error: "Territorio no encontrado." };

  await logAudit({
    userId: user.id,
    action: "EDITAR",
    entity: "Territorio",
    entityId: id,
    details: `Territorio actualizado: ${nombreCompleto(parsed.data)}`,
  });

  refrescar(id);
  return { success: "Territorio actualizado." };
}

export async function deleteTerritorioAction(formData: FormData): Promise<void> {
  const user = await requireSecretary();
  const cong = congregationId(user);
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const territorio = await prisma.territory.findFirst({
    where: { id, congregationId: cong },
    select: {
      number: true,
      name: true,
      _count: { select: { visits: true, outings: true } },
    },
  });
  if (!territorio) return;

  // Se van con él su mapa y sus veces predicadas (cascada). Las salidas del
  // programa se quedan sin territorio, para no borrar el programa del mes.
  await prisma.territory.deleteMany({ where: { id, congregationId: cong } });

  await logAudit({
    userId: user.id,
    action: "ELIMINAR",
    entity: "Territorio",
    entityId: id,
    details:
      `Territorio eliminado: ${nombreCompleto(territorio)} ` +
      `(${territorio._count.visits} registro(s) de predicación, ` +
      `${territorio._count.outings} salida(s) quedaron sin territorio)`,
  });

  refrescar(id);
}

/** Sube o baja un territorio en la lista, cambiándolo con su vecino. */
export async function moverTerritorioAction(formData: FormData): Promise<void> {
  const user = await requireSecretary();
  const cong = congregationId(user);
  const id = String(formData.get("id") ?? "");
  const haciaArriba = String(formData.get("direccion") ?? "") === "arriba";
  if (!id) return;

  const actual = await prisma.territory.findFirst({
    where: { id, congregationId: cong },
    select: { id: true, order: true },
  });
  if (!actual) return;

  const vecino = await prisma.territory.findFirst({
    where: {
      congregationId: cong,
      order: haciaArriba ? { lt: actual.order } : { gt: actual.order },
    },
    orderBy: { order: haciaArriba ? "desc" : "asc" },
    select: { id: true, order: true },
  });
  if (!vecino) return; // ya está arriba o abajo del todo

  await prisma.$transaction([
    prisma.territory.update({
      where: { id: actual.id },
      data: { order: vecino.order },
    }),
    prisma.territory.update({
      where: { id: vecino.id },
      data: { order: actual.order },
    }),
  ]);

  refrescar(id);
}

// ---------------------------------------------------------------------------
//  ESTADÍSTICAS: cada vez que se predica un territorio
// ---------------------------------------------------------------------------

export async function addVisitaAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireSecretary();
  const cong = congregationId(user);

  const parsed = territoryVisitSchema.safeParse({
    territoryId: formData.get("territoryId"),
    date: formData.get("date"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const fecha = fechaDeISO(parsed.data.date);
  if (!fecha) return { error: "Esa fecha no existe." };

  const territorio = await prisma.territory.findFirst({
    where: { id: parsed.data.territoryId, congregationId: cong },
    select: { id: true, number: true, name: true },
  });
  if (!territorio) return { error: "Territorio no encontrado." };

  await prisma.territoryVisit.create({
    data: {
      territoryId: territorio.id,
      congregationId: cong,
      date: fecha,
      note: parsed.data.note?.trim() || null,
    },
  });

  await logAudit({
    userId: user.id,
    action: "CREAR",
    entity: "TerritorioPredicado",
    entityId: territorio.id,
    details: `Se anotó que se predicó ${nombreCompleto(territorio)} el ${parsed.data.date}`,
  });

  refrescar(territorio.id);
  return { success: "Anotado." };
}

export async function deleteVisitaAction(formData: FormData): Promise<void> {
  const user = await requireSecretary();
  const cong = congregationId(user);
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const visita = await prisma.territoryVisit.findFirst({
    where: { id, congregationId: cong },
    select: { id: true, territoryId: true, date: true },
  });
  if (!visita) return;

  await prisma.territoryVisit.deleteMany({
    where: { id, congregationId: cong },
  });

  await logAudit({
    userId: user.id,
    action: "ELIMINAR",
    entity: "TerritorioPredicado",
    entityId: visita.territoryId,
    details: `Se borró el registro del ${visita.date.toISOString().slice(0, 10)}`,
  });

  refrescar(visita.territoryId);
}

// ---------------------------------------------------------------------------
//  PROGRAMA DE PREDICACIÓN
// ---------------------------------------------------------------------------

/**
 * Guarda el programa de un mes: reemplaza las salidas de ese mes por las que
 * llegan. Un mes se guarda entero, así que lo que no venga se borra.
 */
export async function guardarProgramaAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireSecretary();
  const cong = congregationId(user);

  const anio = Number(formData.get("anio"));
  const mes = Number(formData.get("mes"));
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    return { error: "Año inválido." };
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return { error: "Mes inválido." };
  }

  let crudas: unknown;
  try {
    crudas = JSON.parse(String(formData.get("salidas") ?? "[]"));
  } catch {
    return { error: "No se pudo leer el programa. Vuelve a intentarlo." };
  }
  if (!Array.isArray(crudas)) return { error: "Programa inválido." };
  if (crudas.length > 200) {
    return { error: `Son ${crudas.length} salidas y el máximo es 200.` };
  }

  const parsed = serviceOutingSchema.array().safeParse(crudas);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Programa inválido." };
  }

  // Los territorios que de verdad son de esta congregación. Cualquier otro id
  // se guarda como "sin territorio" en vez de confiar en lo que llegó.
  const territorios = await prisma.territory.findMany({
    where: { congregationId: cong },
    select: { id: true },
  });
  const validos = new Set(territorios.map((t) => t.id));

  const desde = new Date(anio, mes - 1, 1, 0, 0, 0);
  const hasta = new Date(anio, mes, 1, 0, 0, 0);

  const filas: {
    congregationId: string;
    date: Date;
    turno: string;
    time: string;
    place: string;
    territoryId: string | null;
    captainName: string;
  }[] = [];

  for (const s of parsed.data) {
    const fecha = fechaDeISO(s.iso);
    if (!fecha) continue;
    // Una salida de otro mes no entra: este guardado es solo de este mes.
    if (fecha < desde || fecha >= hasta) continue;
    filas.push({
      congregationId: cong,
      date: fecha,
      turno: s.turno === TURNOS.TARDE ? TURNOS.TARDE : TURNOS.MANANA,
      time: s.time,
      place: s.place,
      territoryId: validos.has(s.territoryId) ? s.territoryId : null,
      captainName: s.captainName,
    });
  }

  await prisma.$transaction([
    prisma.serviceOuting.deleteMany({
      where: { congregationId: cong, date: { gte: desde, lt: hasta } },
    }),
    ...(filas.length > 0
      ? [prisma.serviceOuting.createMany({ data: filas })]
      : []),
  ]);

  // Capitanes y lugares usados: quedan guardados para elegirlos rápido.
  const guardados: { congregationId: string; kind: string; value: string }[] = [];
  for (const valor of new Set(filas.map((f) => f.captainName.trim()))) {
    if (valor) {
      guardados.push({
        congregationId: cong,
        kind: PRESET_KINDS.CAPITAN,
        value: valor.slice(0, 120),
      });
    }
  }
  for (const valor of new Set(filas.map((f) => f.place.trim()))) {
    if (valor) {
      guardados.push({
        congregationId: cong,
        kind: PRESET_KINDS.LUGAR,
        value: valor.slice(0, 120),
      });
    }
  }
  if (guardados.length > 0) {
    await prisma.servicePreset.createMany({
      data: guardados,
      skipDuplicates: true,
    });
  }

  await logAudit({
    userId: user.id,
    action: "EDITAR",
    entity: "ProgramaPredicacion",
    details: `Programa de predicación de ${monthName(mes)} ${anio}: ${filas.length} salida(s).`,
  });

  refrescar();
  return {
    success:
      filas.length === 0
        ? `Se borraron las salidas de ${monthName(mes)} ${anio}.`
        : `Programa de ${monthName(mes)} ${anio} guardado con ${filas.length} salida(s). ` +
          "Ya cuentan para las estadísticas.",
  };
}

/** Borra un capitán o un lugar de los guardados. */
export async function deletePresetAction(formData: FormData): Promise<void> {
  const user = await requireSecretary();
  const cong = congregationId(user);
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.servicePreset.deleteMany({
    where: { id, congregationId: cong },
  });
  refrescar();
}

// ---------------------------------------------------------------------------
//  MAPAS
// ---------------------------------------------------------------------------

/** Quita el mapa de un territorio (la imagen, no el territorio). */
export async function deleteMapaAction(formData: FormData): Promise<void> {
  const user = await requireSecretary();
  const cong = congregationId(user);
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const territorio = await prisma.territory.findFirst({
    where: { id, congregationId: cong },
    select: { id: true, number: true, name: true },
  });
  if (!territorio) return;

  await prisma.territoryMap.deleteMany({
    where: { territoryId: territorio.id, congregationId: cong },
  });

  await logAudit({
    userId: user.id,
    action: "ELIMINAR",
    entity: "MapaTerritorio",
    entityId: territorio.id,
    details: `Se quitó el mapa de ${nombreCompleto(territorio)}`,
  });

  refrescar(territorio.id);
}

// ---------------------------------------------------------------------------
//  IMPORTAR TARJETAS EN PDF
// ---------------------------------------------------------------------------

/** Respuesta de la importación cuando no se pudo crear nada. */
function importacionFallida(error: string): ResultadoImportacion {
  return { ok: false, error, creados: 0, yaExistian: 0, paginas: [] };
}

/**
 * Crea los territorios que la pantalla leyó del PDF de tarjetas.
 *
 * Reglas, pensadas para que volver a subir el mismo PDF no rompa nada:
 *  - un número que ya existe NO se toca ni se duplica; se devuelve su id
 *    para que, si se pidió, su página del PDF se guarde como mapa;
 *  - una tarjeta sin número recibe el siguiente libre;
 *  - si el PDF trae dos veces el mismo número, se crea una sola vez.
 *
 * Devuelve a qué territorio quedó cada página: eso es lo que necesita el
 * navegador para subir después los mapas, sin volver a preguntar nada.
 */
export async function importarTarjetasAction(
  json: string,
): Promise<ResultadoImportacion> {
  const user = await requireSecretary();
  const cong = congregationId(user);

  let crudas: unknown;
  try {
    crudas = JSON.parse(json);
  } catch {
    return importacionFallida("No se pudo leer la lista de tarjetas.");
  }
  if (!Array.isArray(crudas)) {
    return importacionFallida("La lista de tarjetas no es válida.");
  }
  if (crudas.length === 0) {
    return importacionFallida("No hay ninguna tarjeta marcada para crear.");
  }
  if (crudas.length > 300) {
    return importacionFallida(
      `Son ${crudas.length} tarjetas de una vez y el máximo es 300.`,
    );
  }

  const parsed = tarjetaImportadaSchema.array().safeParse(crudas);
  if (!parsed.success) {
    return importacionFallida(
      parsed.error.issues[0]?.message ?? "Hay datos inválidos en la lista.",
    );
  }

  const existentes = await prisma.territory.findMany({
    where: { congregationId: cong },
    select: { id: true, number: true, name: true, order: true },
  });
  const porNumero = new Map(existentes.map((t) => [t.number, t]));
  const usados = new Set(existentes.map((t) => t.number));
  let orden = existentes.reduce((m, t) => Math.max(m, t.order), 0);

  const paginas: PaginaImportada[] = [];
  const nuevos: {
    pagina: number;
    number: number;
    name: string;
    order: number;
  }[] = [];
  let repetidasEnElPdf = 0;

  for (const fila of parsed.data) {
    const nombre = fila.nombre.slice(0, 120).trim();
    if (!nombre) continue;
    const numero = fila.numero ?? siguienteNumero([...usados, 0]);

    const yaEsta = porNumero.get(numero);
    if (yaEsta) {
      paginas.push({
        pagina: fila.pagina,
        territoryId: yaEsta.id,
        numero,
        nombre: yaEsta.name,
        nuevo: false,
      });
      continue;
    }
    if (usados.has(numero)) {
      repetidasEnElPdf += 1;
      continue;
    }

    usados.add(numero);
    orden += 1;
    nuevos.push({
      pagina: fila.pagina,
      number: numero,
      name: nombre,
      order: orden,
    });
  }

  // createManyAndReturn: hace falta el id de cada uno para poder guardar su
  // mapa justo después. skipDuplicates: si alguien creó ese mismo número a la
  // vez, no se cae la importación entera.
  const creados =
    nuevos.length > 0
      ? await prisma.territory.createManyAndReturn({
          data: nuevos.map((n) => ({
            congregationId: cong,
            number: n.number,
            name: n.name,
            order: n.order,
          })),
          skipDuplicates: true,
          select: { id: true, number: true, name: true },
        })
      : [];

  const creadoPorNumero = new Map(creados.map((c) => [c.number, c]));
  for (const n of nuevos) {
    const c = creadoPorNumero.get(n.number);
    if (!c) continue;
    paginas.push({
      pagina: n.pagina,
      territoryId: c.id,
      numero: c.number,
      nombre: c.name,
      nuevo: true,
    });
  }
  paginas.sort((a, b) => a.pagina - b.pagina || a.numero - b.numero);

  const yaExistian = paginas.filter((p) => !p.nuevo).length;

  if (creados.length === 0 && yaExistian === 0) {
    return importacionFallida(
      "No se pudo crear ninguno. Revisa los números y los nombres.",
    );
  }

  await logAudit({
    userId: user.id,
    action: "CREAR",
    entity: "Territorio",
    details:
      `Importación desde PDF de tarjetas: ${creados.length} territorio(s) creados` +
      (yaExistian > 0 ? `, ${yaExistian} ya existían` : "") +
      (repetidasEnElPdf > 0 ? `, ${repetidasEnElPdf} repetidas en el PDF` : "") +
      ".",
  });

  refrescar();

  const partes: string[] = [];
  partes.push(
    creados.length === 1
      ? "Se creó 1 territorio"
      : `Se crearon ${creados.length} territorios`,
  );
  if (yaExistian > 0) {
    partes.push(
      yaExistian === 1
        ? "1 ya existía y se dejó como estaba"
        : `${yaExistian} ya existían y se dejaron como estaban`,
    );
  }
  if (repetidasEnElPdf > 0) {
    partes.push(
      `${repetidasEnElPdf} ${
        repetidasEnElPdf === 1 ? "tarjeta repetía" : "tarjetas repetían"
      } un número y no se duplicaron`,
    );
  }

  return {
    ok: true,
    mensaje: partes.join(" · ") + ".",
    creados: creados.length,
    yaExistian,
    paginas,
  };
}
