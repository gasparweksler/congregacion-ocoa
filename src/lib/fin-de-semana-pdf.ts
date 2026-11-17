// ============================================================================
//  PDF del "Programa de Reunión de Fin de Semana", listo para imprimir.
//
//  La distribución sigue la del programa que la congregación venía armando a
//  mano: dos franjas de cabecera y, debajo, un bloque por reunión con su
//  fecha en una barra azul y las filas "etiqueta : valor" (Presidente, Lector
//  de la Atalaya, Orador, Tema y Hospitalidad). La fila del tema lleva además
//  una columna estrecha con el número del discurso.
//
//  La "Oración de inicio" NO se imprime: la congregación no la reparte en el
//  programa de fin de semana. La asignación sigue existiendo en la reunión
//  (no se borra ningún nombre guardado); simplemente no sale en el papel.
//
//  Lo que no esté guardado se deja en blanco. Nunca se rellena con un nombre
//  o un número inventado: una casilla vacía en el papel se ve enseguida, un
//  dato falso no.
// ============================================================================

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type WeekendMeeting = {
  date: Date;
  /** "Sábado 07 Noviembre 2026." sale de aquí si no hay etiqueta de semana. */
  weekLabel: string | null;
  presidente: string | null;
  lectorAtalaya: string | null;
  speakerName: string | null;
  talkNumber: string | null;
  talkTitle: string | null;
  hospitalityGroup: string | null;
};

/** Azul oscuro de los bordes y la cabecera. */
const AZUL: [number, number, number] = [31, 56, 100];
/** Azul claro de la barra de cada reunión. */
const AZUL_CLARO: [number, number, number] = [189, 209, 234];

/** "Sábado 07 de Noviembre de 2026" */
function fechaLarga(d: Date): string {
  const txt = d.toLocaleDateString("es-CL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

const limpio = (s: string | null | undefined): string => (s ?? "").trim();

export function buildFinDeSemanaPdf(
  meetings: WeekendMeeting[],
  /** "NOVIEMBRE 2026" */
  periodo: string,
  /** "Congregación Ocoa": el subtítulo del impreso. */
  congregacion = "",
): ArrayBuffer {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 48;
  const anchoUtil = pageW - marginX * 2;

  // --- Cabecera: dos franjas con marco, como el programa de siempre --------
  let y = 44;

  const franja = (alto: number, lineas: { texto: string; tam: number; negrita: boolean }[]) => {
    doc.setDrawColor(...AZUL);
    doc.setLineWidth(1.4);
    doc.rect(marginX, y, anchoUtil, alto);
    let ty = y + alto / 2 - ((lineas.length - 1) * (lineas[0].tam + 3)) / 2 + 4;
    for (const l of lineas) {
      doc.setFont("helvetica", l.negrita ? "bold" : "normal");
      doc.setFontSize(l.tam);
      doc.setTextColor(20, 30, 50);
      doc.text(l.texto, pageW / 2, ty, { align: "center" });
      ty += l.tam + 3;
    }
    y += alto;
  };

  // Título principal, el que pide el impreso.
  franja(34, [
    { texto: "PROGRAMA DE REUNIÓN DE FIN DE SEMANA", tam: 13, negrita: true },
  ]);
  // Subtítulo: de qué congregación es el papel, y de qué mes.
  franja(38, [
    {
      texto: congregacion.trim() || "Congregación",
      tam: 11,
      negrita: true,
    },
    { texto: periodo, tam: 10, negrita: false },
  ]);

  y += 18;

  // --- Un bloque por reunión ----------------------------------------------
  for (const m of meetings) {
    const titulo = limpio(m.weekLabel) || fechaLarga(m.date);

    const filas: { etiqueta: string; numero: string; valor: string }[] = [
      { etiqueta: "Presidente", numero: "", valor: limpio(m.presidente) },
      { etiqueta: "Lector Atalaya", numero: "", valor: limpio(m.lectorAtalaya) },
      { etiqueta: "Orador", numero: "", valor: limpio(m.speakerName) },
      {
        etiqueta: "Tema",
        numero: limpio(m.talkNumber),
        valor: limpio(m.talkTitle),
      },
      {
        etiqueta: "Hospitalidad",
        numero: "",
        valor: limpio(m.hospitalityGroup),
      },
    ];

    // Alto aproximado del bloque: si no cabe entero, pasa a la hoja siguiente
    // en vez de partirse por la mitad.
    const altoBloque = 24 + filas.length * 17 + 22;
    if (y + altoBloque > pageH - 48) {
      doc.addPage();
      y = 48;
    }

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: { top: 3.5, bottom: 3.5, left: 5, right: 5 },
        lineColor: AZUL,
        lineWidth: 0.4,
        textColor: [20, 30, 50],
      },
      head: [
        [
          {
            content: titulo,
            colSpan: 4,
            styles: {
              halign: "center",
              fontStyle: "bold",
              fontSize: 10.5,
              fillColor: AZUL_CLARO,
              textColor: [20, 30, 50],
              lineWidth: 1.2,
              cellPadding: { top: 5, bottom: 5, left: 5, right: 5 },
            },
          },
        ],
      ],
      body: filas.map((f) => [
        { content: f.etiqueta, styles: { fontStyle: "bold" as const } },
        { content: f.numero, styles: { halign: "center" as const, fontStyle: "bold" as const } },
        { content: ":", styles: { halign: "center" as const } },
        { content: f.valor, styles: { fontStyle: "bold" as const } },
      ]),
      columnStyles: {
        0: { cellWidth: 150 },
        1: { cellWidth: 38 },
        2: { cellWidth: 16 },
        3: { cellWidth: "auto" },
      },
    });

    // @ts-expect-error jspdf-autotable deja aquí dónde terminó la tabla.
    y = (doc.lastAutoTable?.finalY ?? y + altoBloque) + 20;
  }

  if (meetings.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(90, 100, 110);
    doc.text(
      "No hay reuniones de fin de semana cargadas en este mes.",
      pageW / 2,
      y + 24,
      { align: "center" },
    );
  }

  return doc.output("arraybuffer");
}
