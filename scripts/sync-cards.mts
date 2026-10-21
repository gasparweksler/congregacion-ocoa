// ============================================================================
//  Compara las tarjetas PDF con los publicadores de la base de datos.
//
//  Por defecto SOLO INFORMA (no escribe nada). Con --apply actualiza únicamente
//  los datos personales del publicador (sexo, fecha de nacimiento y fecha de
//  bautismo) y jamás toca informes, estados ni ninguna otra tabla.
//
//    npx tsx scripts/sync-cards.mts cards.json            # informe
//    npx tsx scripts/sync-cards.mts cards.json --apply    # escribe
// ============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { CardData } from "./extract-cards.mts";

const prisma = new PrismaClient();

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();

/** "07-11-1953" -> Date al mediodía local (evita saltos de día por zona). */
function parseCardDate(s: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s.trim());
  if (!m) return null;
  const [, d, mo, y] = m.map(Number) as unknown as [unknown, number, number, number];
  const date = new Date(y, mo - 1, d, 12, 0, 0);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

const iso = (d: Date | null) =>
  d ? `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}` : "—";

const sameDay = (a: Date | null, b: Date | null) =>
  (!a && !b) ||
  (!!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate());

async function main() {
  const cardsPath = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!cardsPath) throw new Error("Falta la ruta de cards.json");

  const cards: CardData[] = JSON.parse(readFileSync(cardsPath, "utf8"));
  const publishers = await prisma.publisher.findMany({
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      sex: true,
      birthDate: true,
      baptismDate: true,
      status: true,
      group: { select: { name: true } },
    },
  });

  // Emparejado: 1º por el nombre del archivo (sigue la misma convención que la
  // base de datos), 2º por contención de palabras en el nombre completo.
  const used = new Set<string>();
  const pairFor = (p: (typeof publishers)[number]) => {
    const target = norm(p.fullName);
    const byFile = cards.find(
      (c) => !used.has(c.file) && norm(basename(c.file, ".pdf")) === target,
    );
    if (byFile) return byFile;
    const words = target.split(" ").filter((w) => w.length > 2);
    return cards.find((c) => {
      if (used.has(c.file)) return false;
      const full = norm(c.name);
      return words.length > 0 && words.every((w) => full.includes(w));
    });
  };

  type Change = {
    id: string;
    fullName: string;
    group: string;
    file: string;
    sets: string[];
    data: { sex?: string; birthDate?: Date; baptismDate?: Date };
    conflicts: string[];
  };
  const changes: Change[] = [];
  const unmatchedPublishers: string[] = [];

  for (const p of publishers) {
    const card = pairFor(p);
    if (!card) {
      unmatchedPublishers.push(`${p.fullName} (${p.group?.name ?? "sin grupo"})`);
      continue;
    }
    used.add(card.file);

    const birth = parseCardDate(card.birthDate);
    const baptism = parseCardDate(card.baptismDate);
    const sets: string[] = [];
    const conflicts: string[] = [];
    const data: Change["data"] = {};

    // Solo se completa lo que falta; si el dato ya existe y DIFIERE, se avisa
    // y no se pisa sin que el usuario lo revise.
    if (card.sex && p.sex !== card.sex) {
      if (!p.sex) {
        data.sex = card.sex;
        sets.push(`sexo: — → ${card.sex}`);
      } else conflicts.push(`sexo: BD ${p.sex} vs PDF ${card.sex}`);
    }
    if (birth && !sameDay(p.birthDate, birth)) {
      if (!p.birthDate) {
        data.birthDate = birth;
        sets.push(`nacimiento: — → ${iso(birth)}`);
      } else conflicts.push(`nacimiento: BD ${iso(p.birthDate)} vs PDF ${iso(birth)}`);
    }
    if (baptism && !sameDay(p.baptismDate, baptism)) {
      if (!p.baptismDate) {
        data.baptismDate = baptism;
        sets.push(`bautismo: — → ${iso(baptism)}`);
      } else conflicts.push(`bautismo: BD ${iso(p.baptismDate)} vs PDF ${iso(baptism)}`);
    }

    if (sets.length || conflicts.length) {
      changes.push({
        id: p.id,
        fullName: p.fullName,
        group: p.group?.name ?? "sin grupo",
        file: card.file,
        sets,
        data,
        conflicts,
      });
    }
  }

  const unmatchedCards = cards.filter((c) => !used.has(c.file));

  // ---- Informe ----
  console.log(`Publicadores en la base de datos: ${publishers.length}`);
  console.log(`Tarjetas PDF: ${cards.length}`);
  console.log(`Emparejados: ${used.size}\n`);

  const toWrite = changes.filter((c) => Object.keys(c.data).length > 0);
  console.log(`--- A COMPLETAR (${toWrite.length}) ---`);
  for (const c of toWrite) {
    console.log(`${c.fullName} [${c.group}]  ← ${c.file}`);
    for (const s of c.sets) console.log(`    ${s}`);
  }

  const withConflicts = changes.filter((c) => c.conflicts.length > 0);
  console.log(`\n--- DIFERENCIAS CON DATOS YA GUARDADOS (${withConflicts.length}) ---`);
  for (const c of withConflicts) {
    console.log(`${c.fullName} [${c.group}]  ← ${c.file}`);
    for (const s of c.conflicts) console.log(`    ${s}`);
  }

  console.log(`\n--- PUBLICADORES SIN TARJETA (${unmatchedPublishers.length}) ---`);
  for (const n of unmatchedPublishers) console.log(`  ${n}`);

  console.log(`\n--- TARJETAS SIN PUBLICADOR (${unmatchedCards.length}) ---`);
  for (const c of unmatchedCards) console.log(`  ${c.name}  (${c.file})`);

  const sinDatos = cards.filter((c) => !c.birthDate || !c.baptismDate);
  console.log(`\n--- TARJETAS CON CASILLAS VACÍAS EN EL PDF (${sinDatos.length}) ---`);
  for (const c of sinDatos) {
    const falta = [
      !c.birthDate ? "nacimiento" : null,
      !c.baptismDate ? "bautismo" : null,
      !c.sex ? "sexo" : null,
    ].filter(Boolean);
    console.log(`  ${c.name} — falta ${falta.join(", ")} (${c.file})`);
  }

  if (!apply) {
    console.log("\n(Solo informe: NO se escribió nada. Usa --apply para aplicar.)");
    return;
  }

  // ---- Copia de seguridad antes de escribir ----
  const backup = cardsPath.replace(
    /[^\\/]+$/,
    `backup-publishers-${Date.now()}.json`,
  );
  writeFileSync(backup, JSON.stringify(publishers, null, 2), "utf8");
  console.log(`\nCopia de seguridad: ${backup}`);

  let updated = 0;
  for (const c of toWrite) {
    await prisma.publisher.update({ where: { id: c.id }, data: c.data });
    updated++;
  }
  console.log(`Publicadores actualizados: ${updated} (solo datos personales).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
