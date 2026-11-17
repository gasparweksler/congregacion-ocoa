// ============================================================================
//  GET /api/programa-finde-pdf?anio=&mes=
//  PDF del "Programa de Reunión de Fin de Semana" del mes, listo para
//  imprimir. Solo reuniones de fin de semana. Acotado a la congregación de la
//  sesión, igual que el del programa de entre semana.
// ============================================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMeetingsAccess, congregationId } from "@/lib/access";
import { parsePeriod } from "@/lib/period";
import { monthName, MEETING_DAYS } from "@/lib/constants";
import { buildFinDeSemanaPdf } from "@/lib/fin-de-semana-pdf";
import { congregationLabelOf } from "@/lib/congregation-label";

export const dynamic = "force-dynamic";

/** El hermano de una casilla concreta de la reunión. */
function nombreDe(
  assignments: { slotKey: string; primaryName: string | null }[],
  slotKey: string,
): string | null {
  return assignments.find((a) => a.slotKey === slotKey)?.primaryName ?? null;
}

export async function GET(request: Request) {
  const user = await requireMeetingsAccess();
  const { searchParams } = new URL(request.url);
  const { year, month } = parsePeriod(
    searchParams.get("anio") ?? undefined,
    searchParams.get("mes") ?? undefined,
  );

  // Mes completo en hora local (las fechas se guardan a mediodía).
  const desde = new Date(year, month - 1, 1, 0, 0, 0);
  const hasta = new Date(year, month, 1, 0, 0, 0);

  const cong = congregationId(user);
  const meetings = await prisma.meeting.findMany({
    where: {
      congregationId: cong,
      day: MEETING_DAYS.SABADO,
      date: { gte: desde, lt: hasta },
    },
    orderBy: { date: "asc" },
    include: {
      assignments: { select: { slotKey: true, primaryName: true } },
    },
  });

  const buffer = buildFinDeSemanaPdf(
    meetings.map((m) => ({
      date: m.date,
      weekLabel: m.weekLabel,
      presidente: nombreDe(m.assignments, "s_presidente"),
      lectorAtalaya: nombreDe(m.assignments, "s_lector_atalaya"),
      oracionInicio: nombreDe(m.assignments, "s_oracion_inicio"),
      speakerName: m.speakerName,
      talkNumber: m.talkNumber,
      talkTitle: m.talkTitle,
      hospitalityGroup: m.hospitalityGroup,
    })),
    `${monthName(month).toUpperCase()} ${year}`,
    await congregationLabelOf(cong),
  );

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="programa_fin_de_semana_${monthName(month)}_${year}.pdf"`,
    },
  });
}
