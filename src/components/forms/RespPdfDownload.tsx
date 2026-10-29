"use client";

// ============================================================================
//  Descarga del PDF de responsabilidades, con su paleta de colores.
//
//  La paleta se recuerda en este navegador: quien eligió los verdes para el
//  programa de su congregación no quiere volver a elegirlos cada mes.
// ============================================================================

import { useEffect, useState } from "react";
import { DownloadButton } from "@/components/DownloadButton";
import { CollapsibleCard } from "@/components/ui";
import { PaletaOpciones } from "@/components/forms/PaletaOpciones";
import { paletaDe, type PaletaId } from "@/lib/programa-paletas";

const RECUERDO = "paleta-responsabilidades";

export function RespPdfDownload({
  year,
  month,
}: {
  year: number;
  month: number;
}) {
  const [paleta, setPaleta] = useState<PaletaId>("azules");

  // En un efecto, para que servidor y navegador pinten lo mismo al principio.
  useEffect(() => {
    try {
      const guardada = localStorage.getItem(RECUERDO);
      if (guardada) setPaleta(paletaDe(guardada).id);
    } catch {
      /* navegador sin almacenamiento: se queda la de siempre */
    }
  }, []);

  const elegir = (id: PaletaId) => {
    setPaleta(id);
    try {
      localStorage.setItem(RECUERDO, id);
    } catch {
      /* da igual: la descarga funciona lo mismo */
    }
  };

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
