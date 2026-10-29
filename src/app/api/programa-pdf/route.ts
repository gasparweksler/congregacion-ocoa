// ============================================================================
//  GET /api/programa-pdf?anio=&mes=
//  PDF del programa "Vida y Ministerio Cristianos" del mes, listo para
//  imprimir. Solo reuniones de Jueves (son las que tienen el programa VyMC).
//  Acotado a la congregación de la sesión.
// ============================================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMeetingsAccess, congregationId } from "@/lib/access";
import { parsePeriod } from "@/lib/period";
import { monthName, MEETING_DAYS } from "@/lib/constants";
import { buildProgramaPdf } from "@/lib/programa-pdf";
import { congregationLabelOf } from "@/lib/congregation-label";

export const dynamic = "force-dynamic";

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
      day: MEETING_DAYS.JUEVES,
      date: { gte: desde, lt: hasta },
    },
    orderBy: { date: "asc" },
    include: { assignments: { orderBy: { order: "asc" } } },
  });

  const buffer = buildProgramaPdf(
    meetings.map((m) => ({
      date: m.date,
      weekLabel: m.weekLabel,
      weeklyReading: m.weeklyReading,
      songStart: m.songStart,
      songMiddle: m.songMiddle,
      songEnd: m.songEnd,
      assignments: m.assignments.map((a) => ({
        slotKey: a.slotKey,
        section: a.section,
        label: a.label,
        order: a.order,
        primaryName: a.primaryName,
        secondaryName: a.secondaryName,
      })),
    })),
    `${monthName(month).toUpperCase()} ${year}`,
    await congregationLabelOf(cong),
  );

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="programa_${monthName(month)}_${year}.pdf"`,
    },
  });
}
