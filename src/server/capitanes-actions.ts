"use server";

// ============================================================================
//  Capitanes de predicación.
//
//  Tres puertas distintas a los mismos datos:
//    · el Administrador, que configura horarios, abre la encuesta del mes y
//      gestiona lo que llega;
//    · el hermano con la casilla "Capitán", que sube la suya desde su cuenta;
//    · el enlace público, que no exige sesión y por eso solo deja hacer una
//      cosa: dejar su propia disponibilidad.
//
//  Ninguna consulta de este archivo busca sin filtrar por congregación. Las
//  del enlace público se acotan por la encuesta a la que apunta el enlace, y
//  nunca devuelven lo que han contestado los demás.
//
//  Las reglas (calendario, horarios, resúmenes) viven en src/lib/capitanes.ts,
//  sin base de datos, para poder probarlas solas.
// ============================================================================

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  requireSecretary,
  requireCongregation,
  congregationId,
  canUploadCaptain,
} from "@/lib/access";
import { logAudit } from "@/lib/audit";
import type { FormState } from "@/server/actions-shared";
import {
  claveDeNombre,
  errorDeRespuesta,
  etiquetaDelMes,
  fechaDeISO,
  horarioRepetido,
  isoDeFecha,
  leerSlots,
  limpiarHorario,
  puedePisarDesdeElEnlace,
  serializarSlots,
  type DiaDisponible,
  type RespuestaResumen,
} from "@/lib/capitanes";

// ---------------------------------------------------------------------------
//  Los horarios de la congregación
// ---------------------------------------------------------------------------

export type Horario = { id: string; label: string; order: number };

/** Los horarios configurados, en el orden en que se enseñan. */
export async function getHorarios(): Promise<Horario[]> {
  const user = await requireCongregation();
  const filas = await prisma.captainTimeSlot.findMany({
    where: { congregationId: congregationId(user) },
    orderBy: [{ order: "asc" }, { label: "asc" }],
    select: { id: true, label: true, order: true },
  });
  return filas;
}

/** Añade un horario. No deja repetir uno que ya esté. */
export async function agregarHorario(texto: string): Promise<FormState> {
  const user = await requireSecretary();
  const cong = congregationId(user);
  const label = limpiarHorario(texto);
  if (label.length < 2) return { error: "Escribe el horario." };

  const existentes = await prisma.captainTimeSlot.findMany({
    where: { congregationId: cong },
    select: { label: true },
  });
  if (horarioRepetido(label, existentes.map((h) => h.label))) {
    return { error: "Ese horario ya está en la lista." };
  }

  await prisma.captainTimeSlot.create({
    data: { congregationId: cong, label, order: existentes.length },
  });
  await logAudit({
    userId: user.id,
    action: "CREAR",
    entity: "CaptainTimeSlot",
    details: `Horario de capitanes "${label}"`,
    congregationId: cong,
  });
  revalidatePath("/territorios/capitanes");
  return { success: `Horario "${label}" agregado.` };
}

/** Cambia el texto de un horario. */
export async function renombrarHorario(
  id: string,
  texto: string,
): Promise<FormState> {
  const user = await requireSecretary();
  const cong = congregationId(user);
  const label = limpiarHorario(texto);
  if (label.length < 2) return { error: "Escribe el horario." };

  const actual = await prisma.captainTimeSlot.findFirst({
    where: { id, congregationId: cong },
    select: { id: true, label: true },
  });
  if (!actual) return { error: "Ese horario ya no existe." };

  const otros = await prisma.captainTimeSlot.findMany({
    where: { congregationId: cong, id: { not: id } },
    select: { label: true },
  });
  if (horarioRepetido(label, otros.map((h) => h.label))) {
    return { error: "Ese horario ya está en la lista." };
  }

  await prisma.captainTimeSlot.update({ where: { id }, data: { label } });
  await logAudit({
    userId: user.id,
    action: "EDITAR",
    entity: "CaptainTimeSlot",
    entityId: id,
    details: `Horario de capitanes "${actual.label}" → "${label}"`,
    congregationId: cong,
  });
  revalidatePath("/territorios/capitanes");
  return { success: "Horario actualizado." };
}

/**
 * Quita un horario de la lista. Lo que ya respondieron los hermanos no se
 * toca: sus días siguen con el horario que eligieron en su momento.
 */
export async function borrarHorario(id: string): Promise<FormState> {
  const user = await requireSecretary();
  const cong = congregationId(user);
  const fila = await prisma.captainTimeSlot.findFirst({
    where: { id, congregationId: cong },
    select: { id: true, label: true },
  });
  if (!fila) return { error: "Ese horario ya no existe." };

  await prisma.captainTimeSlot.delete({ where: { id } });
  await logAudit({
    userId: user.id,
    action: "ELIMINAR",
    entity: "CaptainTimeSlot",
    entityId: id,
    details: `Horario de capitanes "${fila.label}"`,
    congregationId: cong,
  });
  revalidatePath("/territorios/capitanes");
  return { success: `Horario "${fila.label}" eliminado.` };
}

// ---------------------------------------------------------------------------
//  La encuesta del mes
// ---------------------------------------------------------------------------

export type Encuesta = {
  id: string;
  year: number;
  month: number;
  token: string;
  open: boolean;
  respuestas: number;
  creada: Date;
};

/** Un período válido, o nulo. */
function periodoValido(year: number, month: number): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    year >= 2000 &&
    year <= 2100 &&
    month >= 1 &&
    month <= 12
  );
}

/** Un enlace que no se puede adivinar. */
function nuevoToken(): string {
  return randomBytes(16).toString("hex");
}

/** La encuesta de un mes, si ya está creada. */
export async function getEncuesta(
  year: number,
  month: number,
): Promise<Encuesta | null> {
  const user = await requireSecretary();
  if (!periodoValido(year, month)) return null;
  const e = await prisma.captainSurvey.findFirst({
    where: { congregationId: congregationId(user), year, month },
    select: {
      id: true,
      year: true,
      month: true,
      token: true,
      open: true,
      createdAt: true,
      _count: { select: { responses: true } },
    },
  });
  if (!e) return null;
  return {
    id: e.id,
    year: e.year,
    month: e.month,
    token: e.token,
    open: e.open,
    respuestas: e._count.responses,
    creada: e.createdAt,
  };
}

/**
 * Crea la encuesta de un mes (o devuelve la que ya había). El enlace se
 * genera una sola vez: así el que ya se repartió sigue valiendo.
 */
export async function crearEncuesta(
  year: number,
  month: number,
): Promise<FormState & { token?: string }> {
  const user = await requireSecretary();
  const cong = congregationId(user);
  if (!periodoValido(year, month)) return { error: "El mes no es válido." };

  const existente = await prisma.captainSurvey.findFirst({
    where: { congregationId: cong, year, month },
    select: { token: true },
  });
  if (existente) {
    return {
      success: "Esta encuesta ya estaba creada; su enlace sigue siendo el mismo.",
      token: existente.token,
    };
  }

  const creada = await prisma.captainSurvey.create({
    data: { congregationId: cong, year, month, token: nuevoToken() },
    select: { id: true, token: true },
  });
  await logAudit({
    userId: user.id,
    action: "CREAR",
    entity: "CaptainSurvey",
    entityId: creada.id,
    details: `Encuesta de capitanes de ${etiquetaDelMes(year, month)}`,
    congregationId: cong,
  });
  revalidatePath("/territorios/capitanes");
  return { success: "Encuesta creada.", token: creada.token };
}

/** Abre o cierra la encuesta de un mes. Cerrada, el enlace deja de admitir. */
export async function cambiarEstadoEncuesta(
  id: string,
  open: boolean,
): Promise<FormState> {
  const user = await requireSecretary();
  const cong = congregationId(user);
  const e = await prisma.captainSurvey.findFirst({
    where: { id, congregationId: cong },
    select: { id: true, year: true, month: true },
  });
  if (!e) return { error: "Esa encuesta ya no existe." };

  await prisma.captainSurvey.update({ where: { id }, data: { open } });
  await logAudit({
    userId: user.id,
    action: "EDITAR",
    entity: "CaptainSurvey",
    entityId: id,
    details: `Encuesta de ${etiquetaDelMes(e.year, e.month)}: ${open ? "abierta" : "cerrada"}`,
    congregationId: cong,
  });
  revalidatePath("/territorios/capitanes");
  return { success: open ? "Encuesta abierta." : "Encuesta cerrada." };
}

/** Las encuestas anteriores, de la más nueva a la más vieja. */
export async function getHistorial(limite = 24): Promise<Encuesta[]> {
  const user = await requireSecretary();
  const filas = await prisma.captainSurvey.findMany({
    where: { congregationId: congregationId(user) },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: limite,
    select: {
      id: true,
      year: true,
      month: true,
      token: true,
      open: true,
      createdAt: true,
      _count: { select: { responses: true } },
    },
  });
  return filas.map((e) => ({
    id: e.id,
    year: e.year,
    month: e.month,
    token: e.token,
    open: e.open,
    respuestas: e._count.responses,
    creada: e.createdAt,
  }));
}

/** Borra una encuesta entera con sus respuestas. */
export async function borrarEncuesta(id: string): Promise<FormState> {
  const user = await requireSecretary();
  const cong = congregationId(user);
  const e = await prisma.captainSurvey.findFirst({
    where: { id, congregationId: cong },
    select: { id: true, year: true, month: true },
  });
  if (!e) return { error: "Esa encuesta ya no existe." };

  await prisma.captainSurvey.delete({ where: { id } });
  await logAudit({
    userId: user.id,
    action: "ELIMINAR",
    entity: "CaptainSurvey",
    entityId: id,
    details: `Encuesta de capitanes de ${etiquetaDelMes(e.year, e.month)} y sus respuestas`,
    congregationId: cong,
  });
  revalidatePath("/territorios/capitanes");
  return { success: "Encuesta eliminada." };
}

// ---------------------------------------------------------------------------
//  Las respuestas
// ---------------------------------------------------------------------------

/** Pasa las filas de la base al resumen que usan las pantallas. */
function aResumen(
  filas: Array<{
    id: string;
    name: string;
    userId: string | null;
    updatedAt: Date;
    days: Array<{
      date: Date;
      slots: string;
      houseToHouse: boolean;
      zoom: boolean;
    }>;
  }>,
): RespuestaResumen[] {
  return filas.map((r) => ({
    id: r.id,
    name: r.name,
    userId: r.userId,
    actualizada: r.updatedAt,
    dias: r.days
      .map((d) => ({
        dateISO: isoDeFecha(d.date),
        slots: leerSlots(d.slots),
        houseToHouse: d.houseToHouse,
        zoom: d.zoom,
      }))
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO)),
  }));
}

/** Todas las respuestas de una encuesta (solo para el Administrador). */
export async function getRespuestas(
  surveyId: string,
): Promise<RespuestaResumen[]> {
  const user = await requireSecretary();
  const cong = congregationId(user);
  const filas = await prisma.captainResponse.findMany({
    where: { surveyId, congregationId: cong },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      userId: true,
      updatedAt: true,
      days: {
        select: { date: true, slots: true, houseToHouse: true, zoom: true },
      },
    },
  });
  return aResumen(filas);
}

/** Los hermanos con la casilla "Capitán" de la congregación. */
export async function getCapitanes(): Promise<Array<{ id: string; name: string }>> {
  const user = await requireSecretary();
  return prisma.user.findMany({
    where: {
      congregationId: congregationId(user),
      active: true,
      alsoCapitan: true,
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * Guarda (o corrige) la disponibilidad de un hermano en una encuesta.
 *
 * Es el único sitio donde se escriben los días, lo use el Administrador, el
 * propio capitán desde su cuenta o el enlace público: así las tres puertas
 * guardan exactamente igual.
 */
async function guardarDisponibilidad(opciones: {
  surveyId: string;
  congregationId: string;
  year: number;
  month: number;
  nombre: string;
  dias: DiaDisponible[];
  /** Quién la firma, si entró con su cuenta. */
  userId: string | null;
  /** Quién hace el cambio, para la auditoría. */
  autorId: string | null;
}): Promise<FormState> {
  const { surveyId, year, month, nombre, dias } = opciones;
  const fallo = errorDeRespuesta(nombre, dias, year, month);
  if (fallo) return { error: fallo };

  const name = limpiarHorario(nombre);
  const nameKey = claveDeNombre(name);
  if (!nameKey) return { error: "Escribe tu nombre y apellido." };

  // Todo junto: o entra la respuesta entera con sus días, o no entra nada.
  await prisma.$transaction(async (tx) => {
    const respuesta = await tx.captainResponse.upsert({
      where: { surveyId_nameKey: { surveyId, nameKey } },
      create: {
        surveyId,
        congregationId: opciones.congregationId,
        name,
        nameKey,
        userId: opciones.userId,
      },
      update: {
        name,
        // Si ya la había firmado un usuario, se respeta su firma.
        ...(opciones.userId ? { userId: opciones.userId } : {}),
      },
      select: { id: true },
    });

    // Los días se vuelven a escribir enteros: es lo que acaba de marcar en el
    // calendario, ni más ni menos.
    await tx.captainResponseDay.deleteMany({
      where: { responseId: respuesta.id },
    });
    await tx.captainResponseDay.createMany({
      data: dias.map((d) => ({
        responseId: respuesta.id,
        date: fechaDeISO(d.dateISO),
        slots: serializarSlots(d.slots),
        houseToHouse: d.houseToHouse,
        zoom: d.zoom,
      })),
    });
  });

  await logAudit({
    userId: opciones.autorId,
    action: "EDITAR",
    entity: "CaptainResponse",
    details: `Disponibilidad de ${name} para ${etiquetaDelMes(year, month)} (${dias.length} día(s))`,
    congregationId: opciones.congregationId,
  });
  revalidatePath("/territorios/capitanes");
  revalidatePath("/mi-disponibilidad");
  return { success: "Disponibilidad guardada." };
}

/** El Administrador corrige la disponibilidad de un hermano. */
export async function guardarRespuestaAdmin(
  surveyId: string,
  nombre: string,
  dias: DiaDisponible[],
): Promise<FormState> {
  const user = await requireSecretary();
  const cong = congregationId(user);
  const encuesta = await prisma.captainSurvey.findFirst({
    where: { id: surveyId, congregationId: cong },
    select: { id: true, year: true, month: true },
  });
  if (!encuesta) return { error: "Esa encuesta ya no existe." };

  return guardarDisponibilidad({
    surveyId,
    congregationId: cong,
    year: encuesta.year,
    month: encuesta.month,
    nombre,
    dias,
    userId: null,
    autorId: user.id,
  });
}

/** El Administrador borra la respuesta de un hermano. */
export async function borrarRespuesta(id: string): Promise<FormState> {
  const user = await requireSecretary();
  const cong = congregationId(user);
  const r = await prisma.captainResponse.findFirst({
    where: { id, congregationId: cong },
    select: { id: true, name: true },
  });
  if (!r) return { error: "Esa respuesta ya no existe." };

  await prisma.captainResponse.delete({ where: { id } });
  await logAudit({
    userId: user.id,
    action: "ELIMINAR",
    entity: "CaptainResponse",
    entityId: id,
    details: `Disponibilidad de ${r.name}`,
    congregationId: cong,
  });
  revalidatePath("/territorios/capitanes");
  return { success: `Se borró la disponibilidad de ${r.name}.` };
}

// ---------------------------------------------------------------------------
//  El hermano con la casilla "Capitán"
// ---------------------------------------------------------------------------

export type EncuestaAbierta = {
  id: string;
  year: number;
  month: number;
  horarios: string[];
  /** Lo que ya tiene contestado este hermano, si contestó. */
  mia: DiaDisponible[] | null;
};

/** Las encuestas abiertas de su congregación, con lo que ya contestó. */
export async function getMisEncuestas(): Promise<EncuestaAbierta[]> {
  const user = await requireCongregation();
  const cong = congregationId(user);

  const [encuestas, horarios] = await Promise.all([
    prisma.captainSurvey.findMany({
      where: { congregationId: cong, open: true },
      orderBy: [{ year: "asc" }, { month: "asc" }],
      select: {
        id: true,
        year: true,
        month: true,
        responses: {
          where: { OR: [{ userId: user.id }, { nameKey: claveDeNombre(user.name ?? "") }] },
          select: {
            days: {
              select: { date: true, slots: true, houseToHouse: true, zoom: true },
            },
          },
        },
      },
    }),
    prisma.captainTimeSlot.findMany({
      where: { congregationId: cong },
      orderBy: [{ order: "asc" }, { label: "asc" }],
      select: { label: true },
    }),
  ]);

  return encuestas.map((e) => ({
    id: e.id,
    year: e.year,
    month: e.month,
    horarios: horarios.map((h) => h.label),
    mia:
      e.responses.length > 0
        ? e.responses[0].days
            .map((d) => ({
              dateISO: isoDeFecha(d.date),
              slots: leerSlots(d.slots),
              houseToHouse: d.houseToHouse,
              zoom: d.zoom,
            }))
            .sort((a, b) => a.dateISO.localeCompare(b.dateISO))
        : null,
  }));
}

/** El hermano sube o corrige SU disponibilidad desde su cuenta. */
export async function guardarMiDisponibilidad(
  surveyId: string,
  dias: DiaDisponible[],
): Promise<FormState> {
  const user = await requireCongregation();
  if (!canUploadCaptain(user)) {
    return { error: "Tu usuario no tiene activada la casilla de Capitán." };
  }
  const cong = congregationId(user);

  const encuesta = await prisma.captainSurvey.findFirst({
    where: { id: surveyId, congregationId: cong },
    select: { id: true, year: true, month: true, open: true },
  });
  if (!encuesta) return { error: "Esa encuesta ya no existe." };
  if (!encuesta.open) {
    return { error: "Esta encuesta ya está cerrada. Avisa al Administrador." };
  }

  return guardarDisponibilidad({
    surveyId,
    congregationId: cong,
    year: encuesta.year,
    month: encuesta.month,
    nombre: user.name ?? user.username,
    dias,
    userId: user.id,
    autorId: user.id,
  });
}

// ---------------------------------------------------------------------------
//  El enlace público (sin sesión)
// ---------------------------------------------------------------------------

/**
 * Lo que puede ver quien abre el enlace: de qué congregación y de qué mes es
 * la encuesta, y los horarios para elegir. Nada más: ni quién ha respondido,
 * ni qué han puesto.
 */
export type EncuestaPublica = {
  id: string;
  year: number;
  month: number;
  open: boolean;
  congregacion: string;
  horarios: string[];
};

export async function getEncuestaPorToken(
  token: string,
): Promise<EncuestaPublica | null> {
  const limpio = (token ?? "").trim();
  if (!/^[a-f0-9]{16,64}$/.test(limpio)) return null;

  const e = await prisma.captainSurvey.findUnique({
    where: { token: limpio },
    select: {
      id: true,
      year: true,
      month: true,
      open: true,
      congregationId: true,
      congregation: { select: { name: true, active: true } },
    },
  });
  if (!e || !e.congregation?.active) return null;

  const horarios = await prisma.captainTimeSlot.findMany({
    where: { congregationId: e.congregationId },
    orderBy: [{ order: "asc" }, { label: "asc" }],
    select: { label: true },
  });

  return {
    id: e.id,
    year: e.year,
    month: e.month,
    open: e.open,
    congregacion: e.congregation.name,
    horarios: horarios.map((h) => h.label),
  };
}

/**
 * Responder desde el enlace, sin sesión.
 *
 * La encuesta (y con ella la congregación) sale del token: quien responde no
 * elige nada de eso. Y si ese nombre ya lo había dejado alguien ENTRANDO con
 * su cuenta, no se pisa desde aquí.
 */
export async function responderPorToken(
  token: string,
  nombre: string,
  dias: DiaDisponible[],
): Promise<FormState> {
  const encuesta = await getEncuestaPorToken(token);
  if (!encuesta) {
    return {
      error:
        "Este enlace no es válido. Pide al Administrador que te envíe uno nuevo.",
    };
  }
  if (!encuesta.open) {
    return { error: "Esta encuesta ya está cerrada. Avisa al Administrador." };
  }

  const nameKey = claveDeNombre(nombre);
  if (nameKey) {
    const previa = await prisma.captainResponse.findUnique({
      where: { surveyId_nameKey: { surveyId: encuesta.id, nameKey } },
      select: { userId: true },
    });
    if (!puedePisarDesdeElEnlace(previa)) {
      return {
        error:
          "Ese hermano ya dejó su disponibilidad entrando con su usuario. Para cambiarla, que entre a Ocoa o avisa al Administrador.",
      };
    }
  }

  const fila = await prisma.captainSurvey.findUnique({
    where: { id: encuesta.id },
    select: { congregationId: true },
  });
  if (!fila) return { error: "Esta encuesta ya no existe." };

  return guardarDisponibilidad({
    surveyId: encuesta.id,
    congregationId: fila.congregationId,
    year: encuesta.year,
    month: encuesta.month,
    nombre,
    dias,
    userId: null,
    autorId: null,
  });
}
