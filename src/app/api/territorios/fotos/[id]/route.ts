// ============================================================================
//  Una foto de la franja del programa.
//
//    GET    /api/territorios/fotos/<id>    devuelve la imagen
//    DELETE /api/territorios/fotos/<id>    la quita de la franja
//
//  Acotado a la congregación de la sesión: una foto de una congregación no
//  se puede ver ni borrar desde otra.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { requireSecretary, congregationId } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { tamanoLegible } from "@/lib/territorios";

export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Contexto) {
  const user = await requireSecretary();
  const { id } = await params;

  const foto = await prisma.programPhoto.findFirst({
    where: { id, congregationId: congregationId(user) },
    select: { data: true, mime: true, updatedAt: true },
  });
  if (!foto) return new Response("Esa foto ya no está.", { status: 404 });

  const etag = `"${foto.updatedAt.getTime()}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  const bytes = new Uint8Array(foto.data);
  return new Response(bytes, {
    headers: {
      "Content-Type": foto.mime,
      "Content-Length": String(bytes.byteLength),
      ETag: etag,
      "Cache-Control": "private, max-age=300, must-revalidate",
    },
  });
}

export async function DELETE(_request: Request, { params }: Contexto) {
  const user = await requireSecretary();
  const { id } = await params;
  const cong = congregationId(user);

  const foto = await prisma.programPhoto.findFirst({
    where: { id, congregationId: cong },
    select: { id: true, bytes: true },
  });
  if (!foto) return Response.json({ error: "Esa foto ya no está." }, { status: 404 });

  await prisma.programPhoto.delete({ where: { id: foto.id } });

  await logAudit({
    userId: user.id,
    action: "ELIMINAR",
    entity: "FotoPrograma",
    entityId: foto.id,
    details: `Foto del encabezado quitada (${tamanoLegible(foto.bytes)})`,
  });

  return Response.json({ ok: true });
}
