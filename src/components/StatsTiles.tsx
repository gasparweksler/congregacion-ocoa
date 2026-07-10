// Mosaicos de estadísticas para un período (reutilizable en panel/estadísticas).
import { StatTile } from "@/components/ui";
import { PUBLISHER_STATUS, PUBLISHER_STATUS_LABELS } from "@/lib/constants";
import type { PeriodStats } from "@/lib/stats";

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

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      <StatTile label="Total publicadores" value={stats.totalPublishers} />
      <StatTile
        label="Informaron actividad"
        value={stats.reported}
        tone="green"
        hint={`${stats.participationPct}% de participación`}
      />
      <StatTile
        label="Cursos bíblicos"
        value={stats.totalBibleStudies}
        tone="blue"
      />
      <StatTile label="Horas de predicación" value={stats.totalHours} tone="amber" />

      <StatTile
        label={PUBLISHER_STATUS_LABELS.BAUTIZADO}
        value={s[PUBLISHER_STATUS.BAUTIZADO]}
        tone="green"
      />
      <StatTile
        label={PUBLISHER_STATUS_LABELS.NO_BAUTIZADO}
        value={s[PUBLISHER_STATUS.NO_BAUTIZADO]}
        tone="blue"
      />
      <StatTile
        label={PUBLISHER_STATUS_LABELS.INACTIVO}
        value={s[PUBLISHER_STATUS.INACTIVO]}
        tone="slate"
      />
      <StatTile
        label="Precursores (total)"
        value={stats.totalPrecursores}
        tone="violet"
      />

      <StatTile
        label={PUBLISHER_STATUS_LABELS.PRECURSOR_REGULAR}
        value={s[PUBLISHER_STATUS.PRECURSOR_REGULAR]}
        tone="violet"
      />
      <StatTile
        label={PUBLISHER_STATUS_LABELS.PRECURSOR_AUXILIAR}
        value={s[PUBLISHER_STATUS.PRECURSOR_AUXILIAR]}
        tone="amber"
      />
      <StatTile
        label={PUBLISHER_STATUS_LABELS.PRECURSOR_AUXILIAR_INDEFINIDO}
        value={s[PUBLISHER_STATUS.PRECURSOR_AUXILIAR_INDEFINIDO]}
        tone="amber"
      />
    </div>
  );
}
