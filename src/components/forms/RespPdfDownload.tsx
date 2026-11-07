"use client";

// ============================================================================
//  Descarga del PDF de responsabilidades, con su paleta de colores.
//
//  La paleta se recuerda en este navegador: quien eligió los verdes para el
//  programa de su congregación no quiere volver a elegirlos cada mes.
// ============================================================================

import { DownloadButton } from "@/components/DownloadButton";
import { CollapsibleCard } from "@/components/ui";
import { PaletaOpciones } from "@/components/forms/PaletaOpciones";
import { usePaletaRecordada } from "@/components/forms/usePaletaRecordada";
import { paletaDe } from "@/lib/programa-paletas";

const RECUERDO = "paleta-responsabilidades";

export function RespPdfDownload({
  year,
  month,
}: {
  year: number;
  month: number;
}) {
  const [paleta, elegir] = usePaletaRecordada(RECUERDO);

  return (
    <div className="space-y-3">
      <DownloadButton
        href={`/api/responsabilidades-pdf?anio=${year}&mes=${month}&paleta=${paleta}`}
        variant="primary"
        pendingText="Generando PDF…"
      >
        📄 Descargar PDF
      </DownloadButton>

      <CollapsibleCard
        title="Elegir Paleta de Colores"
        description={`Ahora mismo: ${paletaDe(paleta).nombre}. Así se verán las dos tablas del PDF.`}
      >
        <PaletaOpciones
          value={paleta}
          onChange={elegir}
          name="paleta-resp"
          ejemplo={["Jueves 1", "Sábado 3"]}
        />
        <p className="mt-3 text-xs text-muted">
          Los colores de <strong>Limpieza por Grupos</strong> no cambian: ahí el
          color no adorna, dice de qué grupo es la semana, y con cinco tonos del
          mismo color dejarían de distinguirse al imprimirlos.
        </p>
      </CollapsibleCard>
    </div>
  );
}
