"use server";

// ============================================================================
//  "Cargar Publicadores desde Planilla Excel".
//
//  Dos pasos separados, como en la asignación automática de responsabilidades:
//    1. readPublishersSheetAction  -> lee el archivo, valida fila por fila y
//       devuelve lo que se crearía. NO escribe nada.
//    2. createPublishersAction     -> crea una tanda, para poder enseñar el
//       avance real ("Creados 20 de 70").
//
//  Se reutiliza todo lo que ya existe: publisherSchema para validar cada fila
//  y la misma forma de crear que createPublisherAction (incluido el registro
//  inicial en el historial de situación), para no tener dos caminos distintos.
//
//  No se pisa nada: un publicador que ya existe con ese nombre en la
//  congregación se deja como está y se informa.
// ============================================================================

import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireSecretary, congregationId } from "@/lib/access";
import { publisherSchema } from "@/lib/validations";
import { normalizeName } from "@/lib/assignment-stats";
import { logAudit } from "@/lib/audit";
import {
  parsePublishersSheet,
  type PublisherRow,
  type RowError,
} from "@/lib/publishers-xlsx";

/** Una fila lista para crear, ya con el grupo resuelto. */
export type PreparedRow = PublisherRow & { groupId: string; groupName: string };

export type ReadResult = {
  ok: boolean;
  error?: string;
  /** Filas que se crearían. */
  nuevos: PreparedRow[];
  /** Filas con algún problema, con su número de fila y la columna. */
  errores: RowError[];
  /** Ya existen en la congregación: no se tocan. */
  repetidos: { row: number; fullName: string }[];
  /** Grupos de la congregación, para poder explicar los números válidos. */
  gruposDisponibles: { numero: number; nombre: string }[];
};

const VACIO: ReadResult = {
  ok: false,
  nuevos: [],
  errores: [],
  repetidos: [],
  gruposDisponibles: [],
};

/** El número que lleva el nombre de un grupo ("Grupo 3" -> 3). */
function numeroDeGrupo(nombre: string): number | null {
  const m = nombre.match(/(\d{1,3})/);
  return m ? Number(m[1]) : null;
}

export async function readPublishersSheetAction(
  _prev: ReadResult,
  formData: FormData,
): Promise<ReadResult> {
  // Dar de alta publicadores en bloque es cosa del Administrador.
  const user = await requireSecretary();
  const cong = congregationId(user);

  const file = formData.get("file");
  if (!file || typeof file === "string" || file.size === 0) {
    return { ...VACIO, error: "Selecciona la planilla (.xlsx)." };
  }

  // --- Los grupos tienen que existir antes ---
  const grupos = await prisma.group.findMany({
    where: { congregationId: cong },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const gruposDisponibles = grupos
    .map((g) => ({ numero: numeroDeGrupo(g.name), nombre: g.name }))
    .filter((g): g is { numero: number; nombre: string } => g.numero !== null);

  if (grupos.length === 0) {
    return {
      ...VACIO,
      error:
        "Primero hay que crear los grupos de predicación. Entra en Grupos, créalos y vuelve aquí.",
    };
  }

  const porNumero = new Map(gruposDisponibles.map((g) => [g.numero, g]));
  const idPorNombre = new Map(grupos.map((g) => [g.name, g.id]));

  // --- Lectura del archivo ---
  const wb = new ExcelJS.Workbook();
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
  } catch {
    return { ...VACIO, gruposDisponibles, error: "No se pudo leer el archivo. Debe ser un .xlsx válido." };
  }

  const { rows, errors } = parsePublishersSheet(wb);
  const errores = [...errors];

  // --- Publicadores que ya existen: no se tocan ---
  const existentes = await prisma.publisher.findMany({
    where: { congregationId: cong },
    select: { fullName: true },
  });
  const yaEstan = new Set(existentes.map((p) => normalizeName(p.fullName)));

  const nuevos: PreparedRow[] = [];
  const repetidos: ReadResult["repetidos"] = [];

  for (const r of rows) {
    // El grupo debe existir ya en la aplicación.
    const grupo = r.groupNumber !== null ? porNumero.get(r.groupNumber) : undefined;
    if (!grupo) {
      errores.push({
        row: r.row,
        column: "Número de grupo",
        message: `El grupo ${r.groupNumber} no existe en la congregación. Grupos disponibles: ${
          gruposDisponibles.map((g) => g.numero).join(", ") || "ninguno"
        }.`,
      });
      continue;
    }

    if (yaEstan.has(normalizeName(r.fullName))) {
      repetidos.push({ row: r.row, fullName: r.fullName });
      continue;
    }

    // Última comprobación con el mismo esquema que el formulario.
    const groupId = idPorNombre.get(grupo.nombre)!;
    const parsed = publisherSchema.safeParse({
      fullName: r.fullName,
      sex: r.sex,
      birthDate: r.birthDate ?? "",
      baptismDate: r.baptismDate ?? "",
      hope: r.hope,
      privilege: r.privilege,
      status: r.status,
      groupId,
    });
    if (!parsed.success) {
      errores.push({
        row: r.row,
        column: "",
        message: parsed.error.issues[0]?.message ?? "Datos inválidos.",
      });
      continue;
    }

    nuevos.push({ ...r, groupId, groupName: grupo.nombre });
  }

  errores.sort((a, b) => a.row - b.row);

  if (nuevos.length === 0 && errores.length === 0 && repetidos.length === 0) {
    return {
      ...VACIO,
      gruposDisponibles,
      error: "La planilla no tiene ninguna fila con datos.",
    };
  }

  return { ok: true, nuevos, errores, repetidos, gruposDisponibles };
}

export type CreateResult = { ok: boolean; creados: number; message?: string };

/** Convierte "aaaa-mm-dd" en Date a mediodía, igual que el formulario. */
function toDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T12:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

export async function createPublishersAction(
  rows: PreparedRow[],
  /** Solo la última tanda deja la anotación en Auditoría, con el total. */
  resumen?: { anotar: boolean; total: number },
): Promise<CreateResult> {
  const user = await requireSecretary();
  const cong = congregationId(user);

  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, creados: 0, message: "No hay nada que crear." };
  }

  // Los grupos se vuelven a comprobar aquí: no se crea nada apuntando a un
  // grupo que no sea de esta congregación.
  const grupos = new Set(
    (
      await prisma.group.findMany({
        where: { congregationId: cong },
        select: { id: true },
      })
    ).map((g) => g.id),
  );
  // Y los nombres que ya existen, por si otra persona los creó mientras tanto.
  const yaEstan = new Set(
    (
      await prisma.publisher.findMany({
        where: { congregationId: cong },
        select: { fullName: true },
      })
    ).map((p) => normalizeName(p.fullName)),
  );

  let creados = 0;
  for (const r of rows) {
    if (!grupos.has(r.groupId)) {
      return {
        ok: false,
        creados,
        message: `La fila ${r.row} apunta a un grupo que no es de tu congregación.`,
      };
    }
    // Evita duplicados aunque se reenvíe la misma tanda.
    if (yaEstan.has(normalizeName(r.fullName))) continue;

    await prisma.publisher.create({
      data: {
        fullName: r.fullName,
        sex: r.sex,
        birthDate: toDate(r.birthDate),
        baptismDate: toDate(r.baptismDate),
        hope: r.hope,
        privilege: r.privilege,
        status: r.status,
        groupId: r.groupId,
        congregationId: cong,
        // Igual que al crear uno a mano: queda el estado inicial en el historial.
        statusChanges: { create: { status: r.status, changedById: user.id } },
      },
    });
    yaEstan.add(normalizeName(r.fullName));
    creados++;
  }

  if (!resumen || resumen.anotar) {
    await logAudit({
      userId: user.id,
      action: "CREAR",
      entity: "Publicador",
      details: `Importación desde planilla: ${resumen?.total ?? creados} publicador(es).`,
    });
  }

  revalidatePath("/publicadores");
  revalidatePath("/panel");
  revalidatePath("/informes");

  return { ok: true, creados };
}
