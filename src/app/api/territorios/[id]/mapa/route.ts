// ============================================================================
//  El mapa de un territorio.
//
//    GET  /api/territorios/<id>/mapa    devuelve la imagen
//    POST /api/territorios/<id>/mapa    la guarda o la reemplaza
//
//  La imagen la prepara el navegador (dibuja la página del PDF y la comprime
//  a JPEG), así que aquí solo llega una imagen ya pequeña. Se sube de una en
//  una: así se ve el avance y ninguna petición se pasa de tamaño.
//
//  Acotado a la congregación de la sesión: el mapa de una congregación no se
//  puede ver ni cambiar desde otra.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { requireSecretary, congregationId } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import {
  MAX_BYTES_MAPA,
  esMimeDeMapa,
  nombreCompleto,
  tamanoLegible,
} from "@/lib/territorios";

export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Contexto) {
  const user = await requireSecretary();
  const { id } = await params;

  const mapa = await prisma.territoryMap.findFirst({
    where: { territoryId: id, congregationId: congregationId(user) },
    select: { data: true, mime: true, updatedAt: true },
  });
  if (!mapa) {
    return new Response("Ese territorio no tiene mapa.", { status: 404 });
  }

  // Con el ETag, al volver a abrir el territorio el navegador no descarga el
  // mapa otra vez: pregunta y le decimos que no cambió.
  const etag = `"${mapa.updatedAt.getTime()}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  const bytes = new Uint8Array(mapa.data);
  return new Response(bytes, {
    headers: {
      "Content-Type": mapa.mime,
      "Content-Length": String(bytes.byteLength),
      ETag: etag,
      // Privado: es de esta congregación, no lo guarda ningún intermediario.
      "Cache-Control": "private, max-age=300, must-revalidate",
    },
  });
}

export async function POST(request: Request, { params }: Contexto) {
  const user = await requireSecretary();
  const { id } = await params;
  const cong = congregationId(user);

  const territorio = await prisma.territory.findFirst({
    where: { id, congregationId: cong },
    select: { id: true, number: true, name: true },
  });
  if (!territorio) {
    return Response.json({ error: "Territorio no encontrado." }, { status: 404 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("imagen");
  if (!file || typeof file === "string" || file.size === 0) {
    return Response.json({ error: "No llegó ninguna imagen." }, { status: 400 });
  }
  if (!esMimeDeMapa(file.type)) {
    return Response.json(
      { error: `Formato no admitido (${file.type || "desconocido"}).` },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES_MAPA) {
    return Response.json(
      {
        error: `El mapa pesa ${tamanoLegible(file.size)} y el máximo es ${tamanoLegible(
          MAX_BYTES_MAPA,
        )}.`,
      },
      { status: 413 },
    );
  }

  const pagina = Number(formData?.get("pagina"));
  const data = Buffer.from(await file.arrayBuffer());

  await prisma.territoryMap.upsert({
    where: { territoryId: territorio.id },
    create: {
      territoryId: territorio.id,
      congregationId: cong,
      data,
      mime: file.type,
      bytes: data.byteLength,
      sourcePage: Number.isInteger(pagina) && pagina > 0 ? pagina : null,
    },
    update: {
      data,
      mime: file.type,
      bytes: data.byteLength,
      sourcePage: Number.isInteger(pagina) && pagina > 0 ? pagina : null,
    },
  });

  await logAudit({
    userId: user.id,
    action: "EDITAR",
    entity: "MapaTerritorio",
    entityId: territorio.id,
    details:
      `Mapa guardado para ${nombreCompleto(territorio)} ` +
      `(${tamanoLegible(data.byteLength)}${
        Number.isInteger(pagina) && pagina > 0 ? `, página ${pagina} del PDF` : ""
      })`,
  });

  return Response.json({
    ok: true,
    territoryId: territorio.id,
    bytes: data.byteLength,
  });
}
