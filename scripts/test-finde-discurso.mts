// ============================================================================
//  Reunión de FIN DE SEMANA: discurso público, hospitalidad y estadísticas.
//
//  Comprueba tres cosas, que es justo lo que se pidió:
//
//   1. El PDF del fin de semana YA NO imprime "Oración de inicio", y sí el
//      orador, el tema (con su número) y la hospitalidad.
//   2. El orador, el tema y la hospitalidad se guardan en la reunión y se
//      recuperan tal cual (ida y vuelta contra la base real, dentro de una
//      transacción que se revierte: no queda rastro).
//   3. Las estadísticas de asignaciones NO cuentan nada de fin de semana,
//      pero esas asignaciones siguen guardadas: no se borra ningún registro.
//
//      npm run test:finde
// ============================================================================
import { PrismaClient, type Prisma } from "@prisma/client";
import { MEETING_DAYS } from "../src/lib/constants.js";
import { buildFinDeSemanaPdf } from "../src/lib/fin-de-semana-pdf.js";

const p = new PrismaClient();
let fallos = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? "OK  " : "FALLA "}${msg}`);
  if (!ok) fallos++;
};

/** Para revertir la transacción a propósito al final. */
class Rollback extends Error {}

/** Saca el texto de un PDF con el mismo lector que usa la aplicación. */
async function textoDelPdf(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true })
    .promise;
  let texto = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    texto += content.items.map((t) => ("str" in t ? t.str : "")).join(" ") + "\n";
  }
  return texto;
}

// ---------------------------------------------------------------------------
console.log("\n1) El PDF de fin de semana");

const pdf = buildFinDeSemanaPdf(
  [
    {
      date: new Date(2026, 10, 7, 12),
      weekLabel: "Sábado 07 Noviembre 2026",
      presidente: "Horacio Tapia",
      lectorAtalaya: "Benjamín Saavedra",
      speakerName: "Raúl Aguilera - Cabildo",
      talkNumber: "10",
      talkTitle: "Seamos honrados en todo",
      hospitalityGroup: "Gastón Mondaca",
    },
  ],
  "NOVIEMBRE 2026",
  "Congregación De Prueba",
);
const texto = await textoDelPdf(new Uint8Array(pdf));

check(!/Oraci[oó]n de inicio/i.test(texto), "NO imprime «Oración de inicio»");
check(
  /Presidente/.test(texto) && texto.includes("Horacio Tapia"),
  "sigue imprimiendo el Presidente",
);
check(
  /Lector/.test(texto) && texto.includes("Benjamín Saavedra"),
  "sigue imprimiendo el Lector de la Atalaya",
);
check(
  /Orador/.test(texto) && texto.includes("Raúl Aguilera"),
  "imprime el Orador del discurso público",
);
check(
  /Tema/.test(texto) && texto.includes("Seamos honrados en todo"),
  "imprime el Tema",
);
check(texto.includes("10"), "imprime el número del tema");
check(
  /Hospitalidad/.test(texto) && texto.includes("Gastón Mondaca"),
  "imprime la Hospitalidad con el nombre del hermano",
);
check(
  !/Grupo N[uú]mero/i.test(texto),
  "la fila ya no se llama «Hospitalidad Grupo Número»",
);

// Lo que no está guardado se deja en blanco, nunca se inventa.
const vacio = await textoDelPdf(
  new Uint8Array(
    buildFinDeSemanaPdf(
      [
        {
          date: new Date(2026, 10, 14, 12),
          weekLabel: null,
          presidente: null,
          lectorAtalaya: null,
          speakerName: null,
          talkNumber: null,
          talkTitle: null,
          hospitalityGroup: null,
        },
      ],
      "NOVIEMBRE 2026",
      "Congregación De Prueba",
    ),
  ),
);
check(/Orador/.test(vacio), "con la reunión vacía siguen las filas…");
check(!/null|undefined/.test(vacio), "…y no aparece ningún dato inventado");

// ---------------------------------------------------------------------------
try {
  await p.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const cong = await tx.congregation.create({
        data: { name: "Prueba Finde", slug: `prueba-finde-${Date.now()}` },
        select: { id: true },
      });

      console.log("\n2) Orador, tema y hospitalidad: se guardan y se recuperan");

      const reunion = await tx.meeting.create({
        data: {
          congregationId: cong.id,
          date: new Date(2099, 0, 10, 12),
          day: MEETING_DAYS.SABADO,
          weekLabel: "Finde de prueba",
          assignments: {
            create: [
              {
                slotKey: "s_oracion_inicio",
                section: "SAB_ASIGNACIONES",
                label: "Oración de inicio",
                order: 0,
                primaryName: "Hermano Oración",
              },
              {
                slotKey: "s_lector_atalaya",
                section: "SAB_ASIGNACIONES",
                label: "Lector de la Atalaya",
                order: 1,
                primaryName: "Hermano Lector",
              },
              {
                slotKey: "s_presidente",
                section: "SAB_ASIGNACIONES",
                label: "Presidente de la Reunión",
                order: 2,
                primaryName: "Hermano Presidente",
              },
            ],
          },
        },
        select: { id: true },
      });

      // Lo mismo que hace "Guardar reunión" con las tarjetas nuevas.
      await tx.meeting.update({
        where: { id: reunion.id },
        data: {
          speakerName: "Raúl Aguilera - Cabildo",
          talkNumber: "10",
          talkTitle: "Seamos honrados en todo",
          hospitalityGroup: "Gastón Mondaca",
        },
      });

      const releida = await tx.meeting.findUniqueOrThrow({
        where: { id: reunion.id },
        select: {
          date: true,
          weekLabel: true,
          speakerName: true,
          talkNumber: true,
          talkTitle: true,
          hospitalityGroup: true,
          assignments: {
            select: { slotKey: true, primaryName: true, label: true },
          },
        },
      });
      check(
        releida.speakerName === "Raúl Aguilera - Cabildo",
        `el orador vuelve tal cual (${releida.speakerName})`,
      );
      check(
        releida.talkNumber === "10",
        `el número del tema vuelve tal cual (${releida.talkNumber})`,
      );
      check(
        releida.talkTitle === "Seamos honrados en todo",
        `el tema vuelve tal cual (${releida.talkTitle})`,
      );
      check(
        releida.hospitalityGroup === "Gastón Mondaca",
        `la hospitalidad vuelve tal cual (${releida.hospitalityGroup})`,
      );
      check(
        releida.assignments.length === 3 &&
          releida.assignments.every((a) => !!a.primaryName),
        "y las asignaciones de la reunión siguen con sus hermanos",
      );

      // Y desde ahí llegan al papel, que es lo que se pidió.
      const delPapel = await textoDelPdf(
        new Uint8Array(
          buildFinDeSemanaPdf(
            [
              {
                date: releida.date,
                weekLabel: releida.weekLabel,
                presidente:
                  releida.assignments.find((a) => a.slotKey === "s_presidente")
                    ?.primaryName ?? null,
                lectorAtalaya:
                  releida.assignments.find(
                    (a) => a.slotKey === "s_lector_atalaya",
                  )?.primaryName ?? null,
                speakerName: releida.speakerName,
                talkNumber: releida.talkNumber,
                talkTitle: releida.talkTitle,
                hospitalityGroup: releida.hospitalityGroup,
              },
            ],
            "ENERO 2099",
            "Prueba Finde",
          ),
        ),
      );
      check(delPapel.includes("Raúl Aguilera"), "el orador guardado sale en el PDF");
      check(
        delPapel.includes("Seamos honrados en todo"),
        "el tema guardado sale en el PDF",
      );
      check(
        delPapel.includes("Gastón Mondaca"),
        "la hospitalidad guardada sale en el PDF",
      );
      check(
        !delPapel.includes("Hermano Oración"),
        "y la oración de inicio, aunque esté guardada, no sale en el PDF",
      );

      // Borrar el dato es dejarlo vacío, no escribir "vacío".
      await tx.meeting.update({
        where: { id: reunion.id },
        data: { talkTitle: null, hospitalityGroup: null },
      });
      const sinTema = await tx.meeting.findUniqueOrThrow({
        where: { id: reunion.id },
        select: {
          talkTitle: true,
          hospitalityGroup: true,
          speakerName: true,
        },
      });
      check(
        sinTema.talkTitle === null && sinTema.hospitalityGroup === null,
        "dejar el campo vacío borra el dato",
      );
      check(
        sinTema.speakerName === "Raúl Aguilera - Cabildo",
        "y no se lleva por delante al orador",
      );

      // -------------------------------------------------------------------
      console.log("\n3) Las estadísticas no cuentan el fin de semana");

      await tx.meeting.create({
        data: {
          congregationId: cong.id,
          date: new Date(2020, 0, 6, 12), // ya pasó
          day: MEETING_DAYS.JUEVES,
          weekLabel: "Semana de prueba",
          assignments: {
            create: [
              {
                slotKey: "T1",
                section: "TESOROS",
                label: "Discurso",
                order: 0,
                primaryName: "Hermano Entre Semana",
              },
              {
                slotKey: "r_audio",
                section: "RESPONSABILIDADES",
                label: "Audio",
                order: 100,
                primaryName: "Hermano Audio",
              },
            ],
          },
        },
      });
      const findePasado = await tx.meeting.create({
        data: {
          congregationId: cong.id,
          date: new Date(2020, 0, 11, 12), // ya pasó
          day: MEETING_DAYS.SABADO,
          weekLabel: "Finde pasado",
          assignments: {
            create: [
              {
                slotKey: "s_presidente",
                section: "SAB_ASIGNACIONES",
                label: "Presidente de la Reunión",
                order: 0,
                primaryName: "Hermano Finde",
              },
              {
                slotKey: "r_audio",
                section: "RESPONSABILIDADES",
                label: "Audio",
                order: 100,
                primaryName: "Hermano Audio Finde",
              },
            ],
          },
        },
        select: { id: true },
      });

      // El MISMO filtro que usa getAssignmentStats para las asignaciones vivas.
      const cuentaStats = async (incluirResp: boolean) => {
        const filas = await tx.meetingAssignment.findMany({
          where: {
            meeting: {
              congregationId: cong.id,
              day: { not: MEETING_DAYS.SABADO },
            },
            OR: [
              { NOT: { primaryName: null } },
              { NOT: { secondaryName: null } },
            ],
          },
          select: { primaryName: true, section: true },
        });
        return filas.filter(
          (f) => incluirResp || f.section !== "RESPONSABILIDADES",
        );
      };

      const conResp = await cuentaStats(true);
      check(
        conResp.length === 2,
        `solo entran las 2 asignaciones de entre semana (${conResp.length})`,
      );
      check(
        conResp.every((f) => !f.primaryName?.includes("Finde")),
        "ningún nombre de fin de semana llega a las estadísticas",
      );
      const sinResp = await cuentaStats(false);
      check(
        sinResp.length === 1 && sinResp[0].primaryName === "Hermano Entre Semana",
        "sin responsabilidades queda la parte de entre semana",
      );

      // Y, sobre todo: lo de fin de semana SIGUE GUARDADO.
      const vivasFinde = await tx.meetingAssignment.count({
        where: { meetingId: findePasado.id },
      });
      check(
        vivasFinde === 2,
        `las 2 asignaciones de fin de semana siguen en la base (${vivasFinde})`,
      );
      check(
        (await tx.meeting.count({
          where: { congregationId: cong.id, day: MEETING_DAYS.SABADO },
        })) === 2,
        "y sus reuniones también",
      );

      // El historial de reuniones ya borradas se filtra igual.
      await tx.assignmentHistory.createMany({
        data: [
          {
            congregationId: cong.id,
            meetingDate: new Date(2020, 0, 6, 12),
            day: MEETING_DAYS.JUEVES,
            weekLabel: "Semana borrada",
            slotKey: "T1",
            section: "TESOROS",
            label: "Discurso",
            primaryName: "Hermano Borrado Entre Semana",
            primaryStatus: "PENDIENTE",
          },
          {
            congregationId: cong.id,
            meetingDate: new Date(2020, 0, 11, 12),
            day: MEETING_DAYS.SABADO,
            weekLabel: "Finde borrado",
            slotKey: "s_presidente",
            section: "SAB_ASIGNACIONES",
            label: "Presidente de la Reunión",
            primaryName: "Hermano Borrado Finde",
            primaryStatus: "PENDIENTE",
          },
        ],
      });
      const histStats = await tx.assignmentHistory.findMany({
        where: { congregationId: cong.id, day: { not: MEETING_DAYS.SABADO } },
        select: { primaryName: true },
      });
      check(
        histStats.length === 1 &&
          histStats[0].primaryName === "Hermano Borrado Entre Semana",
        "del historial guardado solo cuenta lo de entre semana",
      );
      check(
        (await tx.assignmentHistory.count({
          where: { congregationId: cong.id },
        })) === 2,
        "pero el historial de fin de semana sigue guardado, no se borra",
      );

      throw new Rollback();
    },
    { timeout: 60_000 },
  );
} catch (e) {
  if (!(e instanceof Rollback)) throw e;
}

console.log("\n4) No quedó nada en la base");
const sobrantes = await p.congregation.count({ where: { name: "Prueba Finde" } });
check(sobrantes === 0, `ninguna congregación de prueba sobrevivió (${sobrantes})`);

await p.$disconnect();
console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
