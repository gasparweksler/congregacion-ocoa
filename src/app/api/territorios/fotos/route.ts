// ============================================================================
//  Las fotos de la franja de arriba del programa de predicación.
//
//    POST /api/territorios/fotos    sube una foto al final de la franja
//
//  La imagen la reduce el navegador antes de subirla, igual que los mapas.
//  Acotado a la congregación de la sesión.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { requireSecretary, congregationId } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import {
  MAX_BYTES_FOTO,
  MAX_FOTOS_ENCABEZADO,
  esMimeDeMapa,
  tamanoLegible,
} from "@/lib/territorios";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await requireSecretary();
  const cong = congregationId(user);

  const cuantas = await prisma.programPhoto.count({
    where: { congregationId: cong },
  });
  if (cuantas >= MAX_FOTOS_ENCABEZADO) {
    return Response.json(
      {
        error: `Ya hay ${cuantas} fotos y caben ${MAX_FOTOS_ENCABEZADO}. Quita alguna antes de subir otra.`,
      },
      { status: 409 },
    );
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
  if (file.size > MAX_BYTES_FOTO) {
    return Response.json(
      {
        error: `La foto pesa ${tamanoLegible(file.size)} y el máximo es ${tamanoLegible(
          MAX_BYTES_FOTO,
        )}.`,
      },
      { status: 413 },
    );
  }

  const ultima = await prisma.programPhoto.findFirst({
    where: { congregationId: cong },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const data = Buffer.from(await file.arrayBuffer());

  const foto = await prisma.programPhoto.create({
    data: {
      congregationId: cong,
      order: (ultima?.order ?? 0) + 1,
      data,
      mime: file.type,
      bytes: data.byteLength,
    },
    select: { id: true, bytes: true },
  });

  await logAudit({
    userId: user.id,
    action: "CREAR",
    entity: "FotoPrograma",
    entityId: foto.id,
    details: `Foto del encabezado del programa (${tamanoLegible(data.byteLength)})`,
  });

  return Response.json({ ok: true, id: foto.id, bytes: foto.bytes });
}
