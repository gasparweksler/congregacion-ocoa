import { requireSecretary } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { monthName } from "@/lib/constants";
import { currentPeriod, nextPeriod, parsePeriod } from "@/lib/period";
import { PageHeader } from "@/components/PageHeader";
import {
  Card,
  CardHeader,
  CardBody,
  Table,
  Th,
  Td,
  Badge,
  EmptyState,
} from "@/components/ui";
import { AuxPioneerInvite } from "@/components/AuxPioneerInvite";
import { isFifteenAllowed } from "@/server/aux-pioneer-actions";
import {
  AuxPeriodViewSelector,
  type ViewOption,
} from "@/components/AuxPeriodViewSelector";

export default async function PrecursoresAuxiliaresPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; mes?: string }>;
}) {
  await requireSecretary();
  const sp = await searchParams;

  const curso = currentPeriod();
  const siguiente = nextPeriod(curso);

  // Período que se está consultando en la tabla (por defecto, mes en curso).
  const { year, month } = parsePeriod(sp.anio, sp.mes, curso);

  const [signups, distinct] = await Promise.all([
    prisma.auxiliaryPioneerSignup.findMany({
      where: { year, month },
      orderBy: { name: "asc" },
      select: { id: true, name: true, hours: true, year: true, month: true },
    }),
    prisma.auxiliaryPioneerSignup.findMany({
      distinct: ["year", "month"],
      select: { year: true, month: true },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
  ]);

  // Opciones del selector: mes en curso, siguiente y meses con registros.
  const optsMap = new Map<string, ViewOption>();
  const add = (y: number, m: number) =>
    optsMap.set(`${y}-${m}`, { year: y, month: m, label: `${monthName(m)} ${y}` });
  add(curso.year, curso.month);
  add(siguiente.year, siguiente.month);
  for (const d of distinct) add(d.year, d.month);
  add(year, month);
  const viewOptions = [...optsMap.values()].sort(
    (a, b) => b.year - a.year || b.month - a.month,
  );

  const [allow15Curso, allow15Sig] = await Promise.all([
    isFifteenAllowed(curso.year, curso.month),
    isFifteenAllowed(siguiente.year, siguiente.month),
  ]);

  const invite = (
    p: { year: number; month: number },
    allow15: boolean,
  ) => ({
    year: p.year,
    month: p.month,
    label: `${monthName(p.month)} ${p.year}`,
    monthLower: monthName(p.month).toLowerCase(),
    allow15,
  });

  return (
    <>
      <PageHeader
        title="Precursores Auxiliares"
        description="Invita a los hermanos e inscríbelos como Precursores Auxiliares por mes."
      />

      {/* Invitación */}
      <Card className="mb-6">
        <CardHeader
          title="Invitar a inscribirse"
          description="Elige el mes, genera el mensaje y compártelo por WhatsApp o cópialo."
        />
        <CardBody>
          <AuxPioneerInvite
            curso={invite(curso, allow15Curso)}
            siguiente={invite(siguiente, allow15Sig)}
          />
        </CardBody>
      </Card>

      {/* Inscritos */}
      <Card>
        <CardHeader
          title="Inscritos"
          description={`Inscripciones de ${monthName(month)} ${year}.`}
          action={
            <AuxPeriodViewSelector
              options={viewOptions}
              year={year}
              month={month}
            />
          }
        />
        {signups.length === 0 ? (
          <EmptyState
            title="Sin inscripciones"
            description={`Nadie se ha inscrito para ${monthName(month)} ${year} todavía.`}
          />
        ) : (
          <CardBody className="px-0 py-0">
            <Table>
              <thead>
                <tr>
                  <Th>Nombre</Th>
                  <Th>Horas</Th>
                  <Th>Mes</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {signups.map((s) => (
                  <tr key={s.id}>
                    <Td className="font-medium text-foreground">{s.name}</Td>
                    <Td>{s.hours} Horas</Td>
                    <Td>
                      {monthName(s.month)} {s.year}
                    </Td>
                    <Td>
                      <Badge tone="green">Inscrito</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardBody>
        )}
      </Card>
    </>
  );
}
