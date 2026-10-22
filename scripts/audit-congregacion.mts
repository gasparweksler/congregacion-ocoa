// ============================================================================
//  Auditoría: busca consultas a tablas de congregación que no estén acotadas.
//  Lee el bloque completo de cada llamada a Prisma (hasta equilibrar sus
//  paréntesis) y comprueba que incluya un filtro por congregación, directo o a
//  través de su relación padre. Conviene ejecutarlo tras cualquier cambio.
//    npx tsx scripts/audit-congregacion.mts
// ============================================================================
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const TENANT = [
  "group",
  "publisher",
  "monthlyReport",
  "meeting",
  "auxiliaryPioneerSignup",
  "auxPioneerSetting",
  "auditLog",
  "user",
];
const OPS = [
  "findMany",
  "findFirst",
  "findUnique",
  "findFirstOrThrow",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "create",
  "createMany",
  "upsert",
];

// Consultas legítimamente globales, con el motivo por el que lo son.
const ALLOW: Record<string, string> = {
  "src/auth.ts": "inicio de sesión: el usuario es único en toda la plataforma",
  "src/app/login/page.tsx": "comprueba la sesión del propio usuario",
  "src/app/(app)/layout.tsx": "lee la ficha del propio usuario de la sesión",
  "src/server/auth-actions.ts": "cambia la contraseña del propio usuario",
  "src/app/api/keep-alive/route.ts": "solo cuenta filas para despertar la base",
  "src/app/confirmar/[token]/page.tsx":
    "se accede por un token único e irrepetible",
};

const files: string[] = [];
const walk = (dir: string) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
  }
};
walk("src");

let total = 0;
const problemas: string[] = [];
const exentas: string[] = [];
const re = new RegExp(
  "prisma\\.(" + TENANT.join("|") + ")\\.(" + OPS.join("|") + ")\\(",
);

for (const file of files) {
  const rel = file.split("\\").join("/");
  const lines = readFileSync(file, "utf8").split("\n");

  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (!m) continue;
    total++;

    // Bloque de la llamada: hasta que los paréntesis vuelven a cerrarse.
    let depth = 0;
    let block = "";
    let started = false;
    for (let j = i; j < Math.min(lines.length, i + 40); j++) {
      for (const ch of lines[j]) {
        if (ch === "(") {
          depth++;
          started = true;
        } else if (ch === ")") depth--;
      }
      block += lines[j] + "\n";
      if (started && depth <= 0) break;
    }

    let acotada =
      /congregationId/.test(block) || /congregation:\s*\{/.test(block);

    // El filtro puede estar en una variable declarada antes (p. ej.
    // `const where: Prisma.XWhereInput = { congregationId: cong, ... }`).
    if (!acotada) {
      // Formas aceptadas: `where: nombreVariable` y la abreviada `where,`.
      const usaVariable =
        /where:\s*([A-Za-z_$][\w$]*)\s*[,}]/.exec(block) ??
        (/\bwhere\s*,/.test(block) ? ["", "where"] : null);
      if (usaVariable) {
        const nombre = usaVariable[1];
        const decl = new RegExp(
          `(const|let)\\s+${nombre}\\b[\\s\\S]{0,600}?congregationId`,
        );
        acotada = decl.test(lines.slice(0, i).join("\n"));
      }
    }
    if (acotada) continue;

    // El nombre de usuario es único global: buscarlo así es correcto.
    const porUsername = /username/.test(block) && m[1] === "user";
    const motivo = ALLOW[rel] ?? (porUsername ? "el usuario es único en toda la plataforma" : null);

    const ref = `${rel}:${i + 1}  prisma.${m[1]}.${m[2]}`;
    if (motivo) exentas.push(`${ref}  — ${motivo}`);
    else problemas.push(ref);
  }
}

console.log(`Consultas a tablas de congregación: ${total}`);
console.log(`  acotadas:            ${total - problemas.length - exentas.length}`);
console.log(`  exentas a propósito: ${exentas.length}`);
console.log(`  SIN ACOTAR:          ${problemas.length}\n`);

if (exentas.length) {
  console.log("Exentas:");
  for (const e of exentas) console.log(`  ${e}`);
  console.log("");
}
if (problemas.length) {
  console.log("SIN ACOTAR (revisar):");
  for (const p of problemas) console.log(`  ${p}`);
}
process.exit(problemas.length === 0 ? 0 : 1);
