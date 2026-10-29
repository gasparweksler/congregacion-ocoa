// ============================================================================
//  Nuevo programa
//  El editor es de cliente (todo pasa en el navegador y el PDF se genera ahí
//  mismo). Aquí solo se le pasan los días de reunión de la congregación y la
//  lista de publicadores para autocompletar.
// ============================================================================

import { requireMeetingsAccess, congregationId } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getMeetingDays } from "@/lib/meeting-days";
import { PageHeader } from "@/components/PageHeader";
import { BackButton } from "@/components/BackButton";
import { ProgramaEditor } from "@/components/forms/ProgramaEditor";

export default async function NuevoProgramaPage() {
  const user = await requireMeetingsAccess();
  const cong = congregationId(user);

  const [days, publishers] = await Promise.all([
    getMeetingDays(cong),
    prisma.publisher.findMany({
      where: { congregationId: cong, active: true },
      orderBy: { fullName: "asc" },
      select: { fullName: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Nuevo programa"
        description="Rellena la tabla y descárgala en PDF."
        action={<BackButton href="/programas" />}
      />
      <ProgramaEditor
        days={days}
        publishers={publishers.map((p) => p.fullName)}
      />
    </>
  );
}
