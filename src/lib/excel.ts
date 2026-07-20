// ============================================================================
//  Generación de archivos Excel (.xlsx) con ExcelJS
//  Construye libros para: listado de publicadores, informes de un período y
//  estadísticas (generales + por grupo). Devuelve un Buffer listo para descargar.
// ============================================================================

import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import {
  statusLabel,
  monthName,
  isPioneer,
  SEX_LABELS,
  PUBLISHER_STATUS,
  type Sex,
} from "@/lib/constants";
import { getCongregationStats } from "@/lib/stats";
import { formatDate } from "@/lib/dates";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF4F46E5" },
};

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  row.height = 20;
}

function sexLabel(sex: string | null): string {
  if (!sex) return "—";
  return SEX_LABELS[sex as Sex] ?? sex;
}

/** Libro: listado completo de publicadores (opcionalmente de un grupo). */
export async function buildPublishersWorkbook(
  groupId?: string,
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sistema Ocoa";
  const ws = wb.addWorksheet("Publicadores");

  ws.columns = [
    { header: "Nombre completo", key: "name", width: 30 },
    { header: "Grupo", key: "group", width: 22 },
    { header: "Estado", key: "status", width: 24 },
    { header: "Sexo", key: "sex", width: 12 },
    { header: "Nacimiento", key: "birth", width: 14 },
    { header: "Bautismo", key: "baptism", width: 14 },
  ];
  styleHeader(ws.getRow(1));

  const publishers = await prisma.publisher.findMany({
    where: { ...(groupId ? { groupId } : {}) },
    orderBy: [{ group: { name: "asc" } }, { fullName: "asc" }],
    include: { group: { select: { name: true } } },
  });

  for (const p of publishers) {
    ws.addRow({
      name: p.fullName,
      group: p.group?.name ?? "—",
      status: statusLabel(p.status),
      sex: sexLabel(p.sex),
      birth: formatDate(p.birthDate),
      baptism: formatDate(p.baptismDate),
    });
  }

  ws.autoFilter = { from: "A1", to: "F1" };
  return wb.xlsx.writeBuffer();
}

/** Libro: informes de un período (año/mes), opcionalmente por grupo. */
export async function buildReportsWorkbook(
  year: number,
  month: number,
  groupId?: string,
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sistema Ocoa";
  const ws = wb.addWorksheet(`${monthName(month)} ${year}`);

  ws.columns = [
    { header: "Publicador", key: "name", width: 30 },
    { header: "Grupo", key: "group", width: 22 },
    { header: "Estado", key: "status", width: 24 },
    { header: "Participó", key: "participated", width: 12 },
    { header: "Cursos bíblicos", key: "studies", width: 16 },
    { header: "Horas", key: "hours", width: 10 },
  ];
  styleHeader(ws.getRow(1));

  const reports = await prisma.monthlyReport.findMany({
    where: {
      year,
      month,
      ...(groupId ? { publisher: { groupId } } : {}),
    },
    orderBy: [
      { publisher: { group: { name: "asc" } } },
      { publisher: { fullName: "asc" } },
    ],
    include: {
      publisher: {
        select: { fullName: true, group: { select: { name: true } } },
      },
    },
  });

  for (const r of reports) {
    ws.addRow({
      name: r.publisher.fullName,
      group: r.publisher.group?.name ?? "—",
      status: statusLabel(r.statusAtReport),
      participated: r.participated ? "Sí" : "No",
      studies: r.bibleStudies,
      hours: isPioneer(r.statusAtReport) ? (r.hours ?? 0) : "",
    });
  }

  // Fila de totales.
  const totalStudies = reports.reduce((a, r) => a + r.bibleStudies, 0);
  const totalHours = reports.reduce((a, r) => a + (r.hours ?? 0), 0);
  const totalRow = ws.addRow({
    name: "TOTALES",
    participated: `${reports.filter((r) => r.participated).length} informaron`,
    studies: totalStudies,
    hours: totalHours,
  });
  totalRow.font = { bold: true };

  ws.autoFilter = { from: "A1", to: "F1" };
  return wb.xlsx.writeBuffer();
}

/** Libro: estadísticas generales + hoja por grupo para un período. */
export async function buildStatsWorkbook(
  year: number,
  month: number,
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sistema Ocoa";

  const { totals, perGroup } = await getCongregationStats(year, month);

  // --- Hoja resumen general ---
  const resumen = wb.addWorksheet("Resumen general");
  resumen.mergeCells("A1:B1");
  resumen.getCell("A1").value = `Estadísticas — ${monthName(month)} ${year}`;
  resumen.getCell("A1").font = { bold: true, size: 14 };

  // Informes del período para el desglose detallado.
  const reports = await prisma.monthlyReport.findMany({
    where: { year, month },
    select: {
      participated: true,
      bibleStudies: true,
      hours: true,
      auxiliaryPioneer: true,
      statusAtReport: true,
    },
  });
  type Report = (typeof reports)[number];

  // Categoría efectiva del mes (excluyentes): un bautizado que hace auxiliar ese
  // mes cuenta como auxiliar (informa horas).
  const catOf = (r: Report): string => {
    const s = r.statusAtReport;
    if (s === PUBLISHER_STATUS.PRECURSOR_REGULAR) return "regular";
    if (
      s === PUBLISHER_STATUS.PRECURSOR_AUXILIAR ||
      s === PUBLISHER_STATUS.PRECURSOR_AUXILIAR_INDEFINIDO ||
      r.auxiliaryPioneer
    )
      return "auxiliar";
    if (s === PUBLISHER_STATUS.BAUTIZADO) return "bautizado";
    if (s === PUBLISHER_STATUS.NO_BAUTIZADO) return "no_bautizado";
    return "otro";
  };
  const sumBy = (arr: Report[], f: (r: Report) => number) =>
    arr.reduce((a, r) => a + f(r), 0);

  const baut = reports.filter((r) => catOf(r) === "bautizado");
  const noBaut = reports.filter((r) => catOf(r) === "no_bautizado");
  const reg = reports.filter((r) => catOf(r) === "regular");
  const aux = reports.filter((r) => catOf(r) === "auxiliar");

  const bautParticiparon = baut.filter((r) => r.participated).length;
  const bautNo = baut.length - bautParticiparon;
  const noBautParticiparon = noBaut.filter((r) => r.participated).length;
  const noBautNo = noBaut.length - noBautParticiparon;
  const cursosBautNoBaut =
    sumBy(baut, (r) => r.bibleStudies) + sumBy(noBaut, (r) => r.bibleStudies);

  resumen.getColumn(1).width = 44;
  resumen.getColumn(2).width = 16;

  const addSection = (title: string) => {
    const row = resumen.addRow([title, ""]);
    row.getCell(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.getCell(1).fill = HEADER_FILL;
    row.getCell(2).fill = HEADER_FILL;
  };
  const addVal = (k: string, v: number | string, bold = true) => {
    const row = resumen.addRow([k, v]);
    row.getCell(1).font = { bold };
    row.getCell(2).alignment = { horizontal: "right" };
  };

  resumen.addRow([]);
  addVal("Total de publicadores", totals.totalPublishers);

  resumen.addRow([]);
  addSection("PUBLICADORES BAUTIZADOS");
  addVal("Informes de Publicadores Bautizados", baut.length);
  addVal("   • Sí participaron", bautParticiparon, false);
  addVal("   • No participaron", bautNo, false);

  resumen.addRow([]);
  addSection("PUBLICADORES NO BAUTIZADOS");
  addVal("Informes de Publicadores No Bautizados", noBaut.length);
  addVal("   • Sí participaron", noBautParticiparon, false);
  addVal("   • No participaron", noBautNo, false);

  resumen.addRow([]);
  addSection("CURSOS BÍBLICOS");
  addVal("Total cursos bíblicos (Bautizados y No Bautizados)", cursosBautNoBaut);

  resumen.addRow([]);
  addSection("PRECURSORES REGULARES");
  addVal("Total informes precursores regulares", reg.length);
  addVal("Total horas precursores regulares", sumBy(reg, (r) => r.hours ?? 0));
  addVal(
    "Total cursos bíblicos precursores regulares",
    sumBy(reg, (r) => r.bibleStudies),
  );

  resumen.addRow([]);
  addSection("PRECURSORES AUXILIARES");
  addVal("Total informes precursores auxiliares", aux.length);
  addVal("Total horas precursores auxiliares", sumBy(aux, (r) => r.hours ?? 0));
  addVal(
    "Total cursos bíblicos precursores auxiliares",
    sumBy(aux, (r) => r.bibleStudies),
  );

  // --- Hoja comparación por grupo ---
  const comp = wb.addWorksheet("Por grupo");
  comp.columns = [
    { header: "Grupo", key: "g", width: 24 },
    { header: "Publicadores", key: "tp", width: 14 },
    { header: "Informaron", key: "rep", width: 12 },
    { header: "Participación %", key: "pct", width: 16 },
    { header: "Cursos bíblicos", key: "bs", width: 16 },
    { header: "Horas", key: "h", width: 10 },
    { header: "Precursores", key: "prec", width: 12 },
  ];
  styleHeader(comp.getRow(1));
  for (const g of perGroup) {
    comp.addRow({
      g: g.groupName,
      tp: g.stats.totalPublishers,
      rep: g.stats.reported,
      pct: `${g.stats.participationPct}%`,
      bs: g.stats.totalBibleStudies,
      h: g.stats.totalHours,
      prec: g.stats.totalPrecursores,
    });
  }
  const tr = comp.addRow({
    g: "TOTAL CONGREGACIÓN",
    tp: totals.totalPublishers,
    rep: totals.reported,
    pct: `${totals.participationPct}%`,
    bs: totals.totalBibleStudies,
    h: totals.totalHours,
    prec: totals.totalPrecursores,
  });
  tr.font = { bold: true };

  return wb.xlsx.writeBuffer();
}
