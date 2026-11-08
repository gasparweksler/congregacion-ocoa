// ============================================================================
//  GET /api/territorios/programa?anio=2026&mes=11
//
//  Un programa de predicación ya guardado, tal como está en la base: sus
//  salidas, el período que abarca y las fotos de la franja del encabezado.
//
//  Lo usa el historial de Estadísticas de Predicación para volver a bajar en
//  PDF cualquier mes anterior. El dibujo lo hace el navegador con la misma
//  función que la pantalla del programa (src/lib/territorios-pdf.ts), así que
//  un programa del historial sale exactamente igual que el día que se armó,
//  sin duplicar ni el diseño ni los datos.
//
//  Acotado a la congregación de la sesión.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { requireServiceAccess, congregationId } from "@/lib/access";
import {
  gruposDeTexto,
  isoDeFecha,
  normalizarRango,
  periodoDelPrograma,
  TURNOS,
} from "@/lib/territorios";
import { congregationLabelOf } from "@/lib/congregation-label";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await requireServiceAccess();
  const cong = congregationId(user);

  const { searchParams } = new URL(request.url);
  const anio = Number(searchParams.get("anio"));
  const mes = Number(searchParams.get("mes"));
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    return Response.json({ error: "Año inválido." }, { status: 400 });
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return Response.json({ error: "Mes inválido." }, { status: 400 });
  }

  const desde = new Date(anio, mes - 1, 1, 0, 0, 0);
  const hasta = new Date(anio, mes, 1, 0, 0, 0);

  const [salidas, fotos, congregacion] = await Promise.all([
    prisma.serviceOuting.findMany({
      where: { congregationId: cong, date: { gte: desde, lt: hasta } },
      orderBy: [{ date: "asc" }, { turno: "asc" }],
      select: {
        id: true,
        date: true,
        turno: true,
        time: true,
        place: true,
        captainName: true,
        groups: true,
        territory: { select: { id: true, number: true, name: true } },
      },
    }),
    prisma.programPhoto.findMany({
      where: { congregationId: cong },
      orderBy: { order: "asc" },
      select: { id: true },
    }),
    congregationLabelOf(cong),
  ]);

  // El período dice lo que de verdad abarca el programa guardado: el mes
  // entero, o "Del 1 al 15 de noviembre" si solo se armó un trozo.
  const dias = salidas.map((s) => s.date.getDate());
  const rango = normalizarRango(
    anio,
    mes,
    dias.length > 0
      ? { desde: Math.min(...dias), hasta: Math.max(...dias) }
      : null,
  );

  return Response.json({
    anio,
    mes,
    congregacion,
    periodo: periodoDelPrograma(anio, mes, rango),
    fotos: fotos.map((f) => f.id),
    salidas: salidas.map((s) => ({
      id: s.id,
      iso: isoDeFecha(s.date),
      turno: s.turno === TURNOS.TARDE ? TURNOS.TARDE : TURNOS.MANANA,
      time: s.time,
      place: s.place,
      captainName: s.captainName,
      territorio: s.territory,
      grupos: gruposDeTexto(s.groups ?? ""),
    })),
  });
}
