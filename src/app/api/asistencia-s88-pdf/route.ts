// ============================================================================
//  GET /api/asistencia-s88-pdf?servicio=2027
//  El registro de asistencia a las reuniones (S-88-S) del año de servicio
//  elegido, con los datos anotados en Ocoa.
//
//  El formulario tiene sitio para dos años de servicio, uno en cada columna:
//  a la izquierda va el elegido y a la derecha el siguiente, que solo se
//  rellena si ya tiene algo anotado.
//
//  El dibujo vive en src/lib/asistencia-s88-pdf.ts: así es el mismo código
//  que prueba scripts/test-asistencia-pdf.mts, sin copias que se queden atrás.
// ============================================================================

import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { requireSecretary } from "@/lib/access";
import { getResumenS88 } from "@/server/asistencia-actions";
import { anioDeServicio } from "@/lib/asistencia";
import { dibujarS88, type ColumnaS88 } from "@/lib/asistencia-s88-pdf";

export const dynamic = "force-dynamic";

/** El año de servicio pedido, o el de hoy si no se entiende. */
function anioPedido(valor: string | null): number {
  const n = parseInt(valor ?? "", 10);
  if (!isNaN(n) && n >= 2000 && n <= 2100) return n;
  const hoy = new Date();
  return anioDeServicio(hoy.getFullYear(), hoy.getMonth() + 1);
}

async function columnaDe(anio: number): Promise<ColumnaS88> {
  const meses = await getResumenS88(anio);
  return {
    anio,
    meses: meses.map((m) => ({
      entreSemana: {
        reuniones: m.entreSemana.reuniones,
        total: m.entreSemana.total,
        promedio: m.entreSemana.promedio,
      },
      finDeSemana: {
        reuniones: m.finDeSemana.reuniones,
        total: m.finDeSemana.total,
        promedio: m.finDeSemana.promedio,
      },
    })),
  };
}

/** ¿Esta columna tiene algo que enseñar? */
function tieneDatos(c: ColumnaS88): boolean {
  return c.meses.some(
    (m) => m.entreSemana.reuniones > 0 || m.finDeSemana.reuniones > 0,
  );
}

export async function GET(request: Request) {
  // getResumenS88 ya exige la sesión; aquí se repite para no generar nada
  // antes de saber quién pide el archivo.
  await requireSecretary();
  const { searchParams } = new URL(request.url);
  const anio = anioPedido(searchParams.get("servicio"));

  const izquierda = await columnaDe(anio);
  const siguiente = await columnaDe(anio + 1);

  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  dibujarS88(doc, {
    columnas: [izquierda, tieneDatos(siguiente) ? siguiente : null],
  });

  const buffer = doc.output("arraybuffer");
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="S-88-S_asistencia_${anio - 1}-${anio}.pdf"`,
    },
  });
}
