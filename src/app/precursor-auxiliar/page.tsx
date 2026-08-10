import { monthName } from "@/lib/constants";
import { parsePeriod } from "@/lib/period";
import { AuxPioneerSignupForm } from "@/components/forms/AuxPioneerSignupForm";

// Página pública (sin sesión): el hermano abre el enlace de WhatsApp y se
// inscribe como Precursor Auxiliar para el período que viene en el enlace.
export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 text-xl font-bold text-white shadow">
            O
          </div>
          <div className="leading-tight">
            <p className="font-semibold tracking-tight text-foreground">
              Congregación Ocoa
            </p>
            <p className="text-xs text-muted">Precursor Auxiliar</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}

export default async function PrecursorAuxiliarPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; mes?: string }>;
}) {
  const sp = await searchParams;
  // El período viene en el enlace; si falta o es inválido, usa el mes actual.
  const { year, month } = parsePeriod(sp.anio, sp.mes);
  const periodLabel = `${monthName(month)} ${year}`;

  return (
    <Shell>
      <h1 className="text-lg font-semibold text-foreground">
        Inscripción como Precursor Auxiliar
      </h1>
      <p className="mt-1 text-sm text-muted">
        Completa tus datos para inscribirte durante{" "}
        <strong className="text-foreground">{periodLabel}</strong>.
      </p>
      <div className="mt-4">
        <AuxPioneerSignupForm
          year={year}
          month={month}
          periodLabel={periodLabel}
        />
      </div>
    </Shell>
  );
}
