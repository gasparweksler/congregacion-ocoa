// Mosaicos de estadísticas para un período (reutilizable en panel/estadísticas).
import type { ReactNode } from "react";
import { Card, StatTile } from "@/components/ui";
import { PUBLISHER_STATUS, PUBLISHER_STATUS_LABELS } from "@/lib/constants";
import type { PeriodStats } from "@/lib/stats";
import { cn } from "@/lib/cn";
import { PioneerTile } from "@/components/PioneerTile";

// Recuadro enriquecido: título, número grande y una lista de sub-datos.
// Mantiene el mismo estilo visual de tarjeta que el resto de la página.
function RichTile({
  label,
  value,
  tone = "slate",
  rows,
}: {
  label: string;
  value: ReactNode;
  tone?: "slate" | "green" | "blue" | "amber" | "violet";
  rows: { k: string; v: ReactNode }[];
}) {
  const accent: Record<string, string> = {
    slate: "text-slate-700",
    green: "text-emerald-600",
    blue: "text-blue-600",
    amber: "text-amber-600",
    violet: "text-violet-600",
  };
  return (
    <Card className="p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", accent[tone])}>
        {value}
      </p>
      <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
        {rows.map((r, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3">
            <dt className="text-muted">{r.k}</dt>
            <dd className="font-semibold tabular-nums text-foreground">
              {r.v}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

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
      {/* 1. Total Publicadores */}
      <RichTile
        label="Total Publicadores"
        value={stats.totalPublishers}
        tone="slate"
        rows={[
          {
            k: PUBLISHER_STATUS_LABELS.BAUTIZADO,
            v: s[PUBLISHER_STATUS.BAUTIZADO],
          },
          {
            k: PUBLISHER_STATUS_LABELS.NO_BAUTIZADO,
            v: s[PUBLISHER_STATUS.NO_BAUTIZADO],
          },
          { k: "✅ Participaron", v: stats.reported },
          { k: "❌ No participaron", v: notReported },
          { k: "Cursos bíblicos", v: stats.publisherBibleStudies },
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
