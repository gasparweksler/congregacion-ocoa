"use server";

// ============================================================================
//  Arreglar los nombres de las asignaciones que no coinciden con ningún
//  hermano inscrito.
//
//  El nombre de una asignación es TEXTO LIBRE: se escribe a mano al armar la
//  reunión. Por eso aparecen "Juan Aviles", "Juan Ernesto Avilés G." o cosas
//  que ni siquiera son personas. Las estadísticas los dejan aparte en vez de
//  atribuirlos a alguien por parecido, y desde la pantalla se pueden arreglar
//  de dos maneras:
//
//   - ELIMINAR del historial: se quita ese nombre de las asignaciones donde
//     aparece. La asignación NO se borra: se queda en su reunión, sin hermano.
//     (En el historial de reuniones ya eliminadas, una fila que se queda sin
//     ningún nombre ya no dice nada, así que esa sí se borra.)
//
//   - FUSIONAR con un hermano inscrito: se reemplaza el texto por el nombre
//     oficial del hermano en todos los registros. No se crea ningún registro
//     nuevo ni se toca a nadie más.
//
//  Dos precauciones en las dos acciones:
//   1. Solo se tocan las filas cuyo nombre es EXACTAMENTE el elegido (sin
//      contar espacios de sobra). Nunca "las que se parecen".
//   2. Si el nombre resulta que sí casa con un hermano inscrito, no se hace
//      nada: la pantalla estaba vieja y seguir sería tocar a un hermano real.
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMeetingsAccess, congregationId } from "@/lib/access";
import { CONFIRM_STATUS } from "@/lib/constants";
import { matchPublisher } from "@/lib/assignment-stats";
import {
  type FilaDeNombres,
  esEseNombre,
  filaLlevaElNombre,
  fusionarNombre,
  quitarNombre,
} from "@/lib/nombres-asignaciones";
import { logAudit } from "@/lib/audit";
import { type FormState } from "@/server/actions-shared";

/** Lo que hay que mirar para decidir si una fila lleva ese nombre. */
type Fila = FilaDeNombres & { id: string };

/**
 * Las filas donde aparece ese nombre exacto: las asignaciones de reuniones
 * que existen y las del historial de reuniones ya eliminadas.
 *
 * El `contains` solo acota la consulta; quien decide es la comparación exacta
 * de después, para no llevarse por delante "Juan Pérez" al tocar "Juan".
 */
async function filasConElNombre(cong: string, nombre: string) {
  const [vivas, historicas] = await Promise.all([
    prisma.meetingAssignment.findMany({
      where: {
        meeting: { congregationId: cong },
        OR: [
          { primaryName: { contains: nombre } },
          { secondaryName: { contains: nombre } },
        ],
      },
      select: { id: true, primaryName: true, secondaryName: true },
    }),
    prisma.assignmentHistory.findMany({
      where: {
        congregationId: cong,
        OR: [
          { primaryName: { contains: nombre } },
          { secondaryName: { contains: nombre } },
        ],
      },
      select: { id: true, primaryName: true, secondaryName: true },
    }),
  ]);
  const mia = (f: Fila) => filaLlevaElNombre(f, nombre);
  return { vivas: vivas.filter(mia), historicas: historicas.filter(mia) };
}

/**
 * ¿Ese texto casa con algún hermano inscrito? Si casa, la pantalla desde la
 * que se pulsó estaba vieja (ya no es un "nombre suelto") y no se toca nada.
 */
async function hermanoQueYaCasa(cong: string, nombre: string) {
  const publishers = await prisma.publisher.findMany({
    where: { congregationId: cong },
    select: { id: true, fullName: true },
  });
  return { publishers, casa: matchPublisher(nombre, publishers) };
}

/** El nombre y, si hace falta, el hermano elegido. */
function datosDelFormulario(formData: FormData) {
  return {
    nombre: String(formData.get("nombre") ?? "").trim(),
    publisherId: String(formData.get("publisherId") ?? "").trim(),
  };
}

// ---------------------------------------------------------------------------
//  Eliminar el nombre del historial de asignaciones.
// ---------------------------------------------------------------------------
export async function deleteUnmatchedNameAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireMeetingsAccess();
  const cong = congregationId(user);
  const { nombre } = datosDelFormulario(formData);
  if (!nombre) return { error: "Falta el nombre que hay que quitar." };

  const { casa } = await hermanoQueYaCasa(cong, nombre);
  if (casa) {
    return {
      error:
        `"${nombre}" sí coincide con el hermano ${casa.fullName}, así que no ` +
        "se ha tocado nada. Actualiza la pantalla para ver la lista de ahora.",
    };
  }

  const { vivas, historicas } = await filasConElNombre(cong, nombre);
  if (vivas.length + historicas.length === 0) {
    return {
      error: `Ya no queda ninguna asignación con el nombre "${nombre}".`,
    };
  }

  // Asignaciones de reuniones que existen: se quita el nombre y su enlace de
  // confirmación. La asignación se queda, sin hermano, para poder escribir
  // otro: borrarla dejaría a la reunión sin esa parte.
  for (const a of vivas) {
    await prisma.meetingAssignment.update({
      where: { id: a.id },
      data: {
        ...(esEseNombre(a.primaryName, nombre)
          ? {
              primaryName: null,
              primaryToken: null,
              primaryStatus: CONFIRM_STATUS.PENDIENTE,
            }
          : {}),
        ...(esEseNombre(a.secondaryName, nombre)
          ? {
              secondaryName: null,
              secondaryToken: null,
              secondaryStatus: CONFIRM_STATUS.PENDIENTE,
            }
          : {}),
      },
    });
  }

  // Historial de reuniones ya eliminadas: si la fila se queda sin ningún
  // nombre ya no cuenta nada, así que desaparece; si tenía dos, se conserva
  // con el otro hermano.
  let historialBorrado = 0;
  for (const h of historicas) {
    const { primaryName, secondaryName, vacia } = quitarNombre(h, nombre);
    if (vacia) {
      await prisma.assignmentHistory.delete({ where: { id: h.id } });
      historialBorrado++;
      continue;
    }
    await prisma.assignmentHistory.update({
      where: { id: h.id },
      data: {
        primaryName,
        secondaryName,
        ...(primaryName ? {} : { primaryStatus: null, primaryDone: null }),
        ...(secondaryName ? {} : { secondaryStatus: null, secondaryDone: null }),
      },
    });
  }

  await logAudit({
    userId: user.id,
    action: "ELIMINAR",
    entity: "Asignacion",
    entityId: cong,
    details:
      `Se quitó el nombre "${nombre}" de ${vivas.length} asignación(es) de ` +
      `reuniones y ${historicas.length} fila(s) del historial ` +
      `(${historialBorrado} quedaron vacías y se borraron).`,
  });

  revalidatePath("/reuniones/estadisticas");
  revalidatePath("/reuniones");
  return {
    success:
      `Listo: "${nombre}" ya no aparece en las estadísticas. Se quitó de ` +
      `${vivas.length} asignación(es) de reuniones y de ${historicas.length} ` +
      "registro(s) del historial.",
  };
}

// ---------------------------------------------------------------------------
//  Fusionar el nombre con un hermano inscrito.
// ---------------------------------------------------------------------------
export async function mergeUnmatchedNameAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireMeetingsAccess();
  const cong = congregationId(user);
  const { nombre, publisherId } = datosDelFormulario(formData);
  if (!nombre) return { error: "Falta el nombre que hay que fusionar." };
  if (!publisherId) {
    return { error: "Elige con qué hermano se fusiona ese nombre." };
  }

  const { publishers, casa } = await hermanoQueYaCasa(cong, nombre);
  if (casa) {
    return {
      error:
        `"${nombre}" sí coincide con el hermano ${casa.fullName}, así que no ` +
        "se ha tocado nada. Actualiza la pantalla para ver la lista de ahora.",
    };
  }
  const hermano = publishers.find((p) => p.id === publisherId);
  if (!hermano) {
    return { error: "Ese hermano ya no está inscrito en la congregación." };
  }
  const oficial = hermano.fullName.trim();

  const { vivas, historicas } = await filasConElNombre(cong, nombre);
  if (vivas.length + historicas.length === 0) {
    return {
      error: `Ya no queda ninguna asignación con el nombre "${nombre}".`,
    };
  }

  /**
   * El nombre nuevo de cada hueco. Si al cambiarlo el mismo hermano quedara
   * dos veces en la misma asignación, el segundo se deja vacío: así la
   * participación se cuenta una vez, no dos.
   */
  const renombrar = (f: Fila) => fusionarNombre(f, nombre, oficial);

  let duplicadosEvitados = 0;

  for (const a of vivas) {
    const { primaryName, secondaryName, duplicado } = renombrar(a);
    if (duplicado) duplicadosEvitados++;
    await prisma.meetingAssignment.update({
      where: { id: a.id },
      data: {
        primaryName,
        secondaryName,
        // Solo se corrige cómo está escrito el nombre: la confirmación que ya
        // dio el hermano (y su enlace) se conservan tal cual.
        ...(secondaryName
          ? {}
          : {
              secondaryToken: null,
              secondaryStatus: CONFIRM_STATUS.PENDIENTE,
            }),
      },
    });
  }

  for (const h of historicas) {
    const { primaryName, secondaryName, duplicado } = renombrar(h);
    if (duplicado) duplicadosEvitados++;
    await prisma.assignmentHistory.update({
      where: { id: h.id },
      data: {
        primaryName,
        secondaryName,
        ...(secondaryName ? {} : { secondaryStatus: null, secondaryDone: null }),
      },
    });
  }

  await logAudit({
    userId: user.id,
    action: "EDITAR",
    entity: "Asignacion",
    entityId: cong,
    details:
      `Se fusionó el nombre "${nombre}" con ${oficial} en ${vivas.length} ` +
      `asignación(es) de reuniones y ${historicas.length} fila(s) del ` +
      `historial${duplicadosEvitados > 0 ? ` (${duplicadosEvitados} repetición(es) evitada(s))` : ""}.`,
  });

  revalidatePath("/reuniones/estadisticas");
  revalidatePath("/reuniones");
  return {
    success:
      `Listo: "${nombre}" ahora cuenta como ${oficial}. Se corrigieron ` +
      `${vivas.length} asignación(es) de reuniones y ${historicas.length} ` +
      "registro(s) del historial" +
      (duplicadosEvitados > 0
        ? `, y se evitó que quedara dos veces en ${duplicadosEvitados} asignación(es)`
        : "") +
      ".",
  };
}
