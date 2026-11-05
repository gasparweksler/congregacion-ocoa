// ============================================================================
//  /api/plantilla-vymc  —  la planilla del programa "Vida y Ministerio"
//
//  GET   Entrega la planilla EN BLANCO tal cual (src/assets/plantilla-vymc.xlsx):
//        no se genera ni se reconstruye nada, para que conserve exactamente los
//        encabezados, columnas, hojas y formatos del original.
//
//  POST  Entrega la planilla YA RELLENA con el programa leído del PDF de la
//        Guía de actividades. Se parte de la misma plantilla y se copia su
//        formato fila a fila, añadiendo las filas que haga falta cuando una
//        sección trae más partes de las previstas (ver lib/vymc-xlsx.ts).
//        El programa viaja en el cuerpo de la petición porque es la pantalla
//        la que lo tiene: se lee del PDF, se revisa y se corrige a mano antes
//        de descargar, y así no se guarda nada en la base de datos.
// ============================================================================

import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { requireMeetingsAccess } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { loadWorkbook } from "@/lib/xlsx-load";
import { normalizarGuia } from "@/lib/vymc-pdf";
import { escribirGuiaEnPlantilla } from "@/lib/vymc-xlsx";

// Lee del disco: necesita el runtime de Node.js (no Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPO_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function plantillaEnBlanco(): Promise<Buffer> {
  return readFile(path.join(process.cwd(), "src/assets/plantilla-vymc.xlsx"));
}

export async function GET() {
  const user = await requireMeetingsAccess();
  const bytes = await plantillaEnBlanco();

  await logAudit({
    userId: user.id,
    action: "EXPORTAR",
    entity: "Reunion",
    details: "Descarga de la planilla en blanco de Vida y Ministerio.",
  });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": TIPO_XLSX,
      "Content-Disposition": 'attachment; filename="VyMC Modelo.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Nombre de archivo: "VyMC Enero y Febrero 2027.xlsx".
 *
 * Se quitan las tildes y cualquier signo: el nombre viaja en una cabecera
 * HTTP, que solo admite ASCII, y un acento ahí llega al navegador roto.
 */
function nombreArchivo(titulo: string): string {
  const limpio = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^0-9A-Za-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `VyMC ${limpio || "Programa"}.xlsx`;
}

export async function POST(req: NextRequest) {
  const user = await requireMeetingsAccess();

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json(
      { error: "No se recibió el programa a escribir." },
      { status: 400 },
    );
  }

  const guia = normalizarGuia(cuerpo);
  if (!guia) {
    return NextResponse.json(
      {
        error:
          "El programa recibido no tiene ninguna semana aprovechable. Vuelve a subir el PDF de la Guía.",
      },
      { status: 400 },
    );
  }

  let bytes: Buffer;
  let hoja: string;
  try {
    const wb = await loadWorkbook(await plantillaEnBlanco());
    hoja = escribirGuiaEnPlantilla(wb, guia);
    bytes = Buffer.from(await wb.xlsx.writeBuffer());
  } catch {
    return NextResponse.json(
      {
        error:
          "No se pudo generar la planilla a partir de la plantilla del sistema. Avisa al administrador.",
      },
      { status: 500 },
    );
  }

  await logAudit({
    userId: user.id,
    action: "EXPORTAR",
    entity: "Reunion",
    details:
      `Planilla de Vida y Ministerio generada desde el PDF de la Guía ` +
      `(${guia.titulo}): ${guia.semanas.length} semana(s) en la hoja "${hoja}".`,
  });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": TIPO_XLSX,
      "Content-Disposition": `attachment; filename="${nombreArchivo(guia.titulo)}"`,
      "Cache-Control": "no-store",
    },
  });
}
