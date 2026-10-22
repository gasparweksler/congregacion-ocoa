// ============================================================================
//  GET /api/tarjetas
//  Descarga las tarjetas "Registro de Publicador" (formulario S-21) rellenas
//  con el historial de informes del año de servicio.
//
//  Parámetros:
//    pub=<id>        una sola tarjeta (devuelve el PDF directamente)
//    anio=<año>      año de servicio (por defecto, el actual)
//    estado=<...>    filtra por estado del publicador
//    privilegio=...  ANCIANO | SIERVO_MINISTERIAL
//    grupo=<id>      filtra por grupo
//    q=<texto>       busca por nombre
//  Varias tarjetas se devuelven como un ZIP con un PDF por hermano.
//
//  Acceso: igual que la sección Publicadores; quien no es secretario queda
//  limitado a su propio grupo.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser, isSecretary, scopedGroupId,
  congregationId,
} from "@/lib/access";
import { PUBLISHER_STATUS_VALUES, PRIVILEGE_VALUES } from "@/lib/constants";
import {
  buildPublisherCard,
  cardFileName,
  currentServiceYear,
  serviceYearMonths,
} from "@/lib/publisher-card";
import { logAudit } from "@/lib/audit";

// pdf-lib y JSZip requieren el runtime de Node.js (no Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLISHER_SELECT = {
  id: true,
  fullName: true,
  sex: true,
  birthDate: true,
  baptismDate: true,
  hope: true,
  privilege: true,
  status: true,
} as const;

export async function GET(request: NextRequest) {
  const user = await requireUser();
  const { searchParams } = request.nextUrl;

  const serviceYear =
    Number(searchParams.get("anio")) || currentServiceYear();
  const pub = searchParams.get("pub") || undefined;
  const estado = searchParams.get("estado") || undefined;
  const privilegio = searchParams.get("privilegio") || undefined;
  const grupo = searchParams.get("grupo") || undefined;
  const q = (searchParams.get("q") || "").trim();

  // Alcance: el secretario ve todo; el resto, solo su grupo.
  const scope = scopedGroupId(user);
  const groupId = isSecretary(user) ? grupo : (scope ?? undefined);

  const where: Prisma.PublisherWhereInput = {
    congregationId: congregationId(user),
    ...(pub ? { id: pub } : {}),
    ...(groupId ? { groupId } : {}),
    ...(scope ? { groupId: scope } : {}),
    ...(estado && PUBLISHER_STATUS_VALUES.includes(estado as never)
      ? { status: estado }
      : {}),
    ...(privilegio && PRIVILEGE_VALUES.includes(privilegio as never)
      ? { privilege: privilegio }
      : {}),
    ...(q ? { fullName: { contains: q, mode: "insensitive" } } : {}),
  };

  const publishers = await prisma.publisher.findMany({
    where,
    orderBy: [{ group: { name: "asc" } }, { fullName: "asc" }],
    select: PUBLISHER_SELECT,
  });

  if (publishers.length === 0) {
    return NextResponse.json(
      { error: "Ningún publicador coincide con el filtro." },
      { status: 404 },
    );
  }

  // Un único lote de informes para todos: evita una consulta por hermano.
  const months = serviceYearMonths(serviceYear);
  const reports = await prisma.monthlyReport.findMany({
    where: {
      congregationId: congregationId(user),
      publisherId: { in: publishers.map((p) => p.id) },
      OR: months.map((m) => ({ year: m.year, month: m.month })),
    },
    select: {
      publisherId: true,
      year: true,
      month: true,
      participated: true,
      bibleStudies: true,
      hours: true,
      auxiliaryPioneer: true,
      comment: true,
    },
  });
  const byPublisher = new Map<string, typeof reports>();
  for (const r of reports) {
    const list = byPublisher.get(r.publisherId) ?? [];
    list.push(r);
    byPublisher.set(r.publisherId, list);
  }

  await logAudit({
    userId: user.id,
    action: "EXPORTAR",
    entity: "Publicador",
    details: `Tarjetas descargadas: ${publishers.length} (año de servicio ${serviceYear}).`,
  });

  // --- Una sola tarjeta: PDF directo ---
  if (publishers.length === 1) {
    const p = publishers[0];
    const pdf = await buildPublisherCard(
      p,
      byPublisher.get(p.id) ?? [],
      serviceYear,
    );
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${cardFileName(p.fullName, serviceYear)}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // --- Varias tarjetas: un PDF por hermano dentro de un ZIP ---
  const zip = new JSZip();
  for (const p of publishers) {
    const pdf = await buildPublisherCard(
      p,
      byPublisher.get(p.id) ?? [],
      serviceYear,
    );
    zip.file(cardFileName(p.fullName, serviceYear), pdf);
  }
  const blob = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });

  return new NextResponse(Buffer.from(blob), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="tarjetas_${serviceYear}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
