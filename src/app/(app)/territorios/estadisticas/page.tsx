// ============================================================================
//  Estadísticas de Predicación
//
//  Esta pantalla solo decide quién entra y de qué congregación se cuenta; lo
//  que se ve está en src/components/EstadisticasDePredicacion.tsx.
//
//  Entra el Administrador y cualquier usuario con la casilla
//  "Sup. de Servicio - Territorios". Todos sobre los mismos datos: el
//  acceso se acota por congregación, nunca por usuario.
// ============================================================================

import { requireServiceAccess, congregationId } from "@/lib/access";
import { EstadisticasDePredicacion } from "@/components/EstadisticasDePredicacion";

export default async function EstadisticasPredicacionPage({
  searchParams,
}: {
  searchParams: Promise<{ meses?: string }>;
}) {
  const user = await requireServiceAccess();
  const { meses } = await searchParams;
  return (
    <EstadisticasDePredicacion
      cong={congregationId(user)}
      mesesParam={meses}
    />
  );
}
