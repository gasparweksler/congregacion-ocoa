// Mosaicos de estadísticas para un período (reutilizable en panel/estadísticas).
import { StatTile } from "@/components/ui";
import { PUBLISHER_STATUS, PUBLISHER_STATUS_LABELS } from "@/lib/constants";
import type { PeriodStats } from "@/lib/stats";
import { PioneerTile } from "@/components/PioneerTile";
import { TotalPublishersTile } from "@/components/TotalPublishersTile";

export function StatsTiles({
  stats,
  variant = "full",
}: {
  stats: PeriodStats;
  variant?: "full" | "panel";
}) {
  const s = stats.byStatus;

  // Versión compacta para el Panel: solo los conteos del padrón solicitados.
  if (variant === "panel") {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Total publicadores" value={stats.totalPublishers} />
        <StatTile
          label={PUBLISHER_STATUS_LABELS.NO_BAUTIZADO}
          value={s[PUBLISHER_STATUS.NO_BAUTIZADO]}
          tone="blue"
        />
        <StatTile
          label={PUBLISHER_STATUS_LABELS.PRECURSOR_REGULAR}
          value={s[PUBLISHER_STATUS.PRECURSOR_REGULAR]}
          tone="violet"
        />
        <StatTile
          label={PUBLISHER_STATUS_LABELS.INACTIVO}
          value={s[PUBLISHER_STATUS.INACTIVO]}
          tone="slate"
        />
        <StatTile
          label={PUBLISHER_STATUS_LABELS.PRECURSOR_AUXILIAR_INDEFINIDO}
          value={s[PUBLISHER_STATUS.PRECURSOR_AUXILIAR_INDEFINIDO]}
          tone="amber"
        />
      </div>
    );
  }

  const notReported = Math.max(0, stats.totalPublishers - stats.reported);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {/* 1. Total Publicadores (cada fila con ojo para ver nombres) */}
      <TotalPublishersTile
        total={stats.totalPublishers}
        rows={[
          {
            label: "Total de Inactivos",
            value: s[PUBLISHER_STATUS.INACTIVO],
            names: stats.names.inactivos,
          },
          {
            label: "Publicadores Activos",
            value: stats.totalPublishers - s[PUBLISHER_STATUS.INACTIVO],
            names: stats.names.activos,
          },
          {
            label: PUBLISHER_STATUS_LABELS.BAUTIZADO,
            value: s[PUBLISHER_STATUS.BAUTIZADO],
            names: stats.names.bautizados,
          },
          {
            label: PUBLISHER_STATUS_LABELS.NO_BAUTIZADO,
            value: s[PUBLISHER_STATUS.NO_BAUTIZADO],
            names: stats.names.noBautizados,
          },
          {
            label: "✅ Participaron",
            value: stats.reported,
            names: stats.names.participaron,
          },
          {
            label: "❌ No participaron",
            value: notReported,
            names: stats.names.noParticiparon,
          },
          {
            label: "Cursos bíblicos",
            value: stats.publisherBibleStudies,
            names: stats.names.cursos,
          },
        ]}
      />

      {/* 2. Precursores Regulares (título clicable -> lista de nombres) */}
      <PioneerTile
        label={PUBLISHER_STATUS_LABELS.PRECURSOR_REGULAR}
        count={stats.regularPioneers.count}
        hours={stats.regularPioneers.hours}
        bibleStudies={stats.regularPioneers.bibleStudies}
        names={stats.regularPioneers.names}
        tone="violet"
      />

      {/* 3. Precursores Auxiliares (auxiliares + auxiliares indefinidos) */}
      <PioneerTile
        label="Precursores Auxiliares"
        count={stats.auxiliaryPioneers.count}
        hours={stats.auxiliaryPioneers.hours}
        bibleStudies={stats.auxiliaryPioneers.bibleStudies}
        names={stats.auxiliaryPioneers.names}
        tone="amber"
      />
    </div>
  );
}
