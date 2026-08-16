import type { Prisma } from "@prisma/client";
import { PUBLISHER_STATUS } from "@/lib/constants";

// Filtro Prisma por tipo de publicador según el estado al momento del informe
// (y si hizo precursorado auxiliar ese mes). Consistente con las Estadísticas.
// tipo: "regular" | "auxiliar" | "precursores" | otro/undefined (todos).
export function reportTypeWhere(
  tipo?: string,
): Prisma.MonthlyReportWhereInput {
  const AUX: Prisma.MonthlyReportWhereInput = {
    OR: [
      {
        statusAtReport: {
          in: [
            PUBLISHER_STATUS.PRECURSOR_AUXILIAR,
            PUBLISHER_STATUS.PRECURSOR_AUXILIAR_INDEFINIDO,
          ],
        },
      },
      { auxiliaryPioneer: true },
    ],
  };
  if (tipo === "regular")
    return { statusAtReport: PUBLISHER_STATUS.PRECURSOR_REGULAR };
  if (tipo === "auxiliar") return AUX;
  if (tipo === "precursores")
    return {
      OR: [
        { statusAtReport: PUBLISHER_STATUS.PRECURSOR_REGULAR },
        ...(AUX.OR as Prisma.MonthlyReportWhereInput[]),
      ],
    };
  return {};
}
