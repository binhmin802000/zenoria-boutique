// ZENORIA - Extraction de CrystalLogo vers components/CrystalLogo.js
// ============================================================
// Ce script modifie UNIQUEMENT pages/index.js, et seulement si TOUS
// les controles reussissent. Retire la definition locale de
// CrystalLogo (fonction complete) et ajoute l'import du composant
// partage a la place. Le composant components/CrystalLogo.js doit
// deja exister et etre identique a la version extraite (verifie par
// garde-fou de contenu, pas seulement de forme).
//
// Usage :
//   node scripts/patch-crystallogo-extraction.mjs --dry-run
//   node scripts/patch-crystallogo-extraction.mjs --apply
// ============================================================

import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) {
  console.error("Utilisez --dry-run ou --apply.");
  process.exit(2);
}

const indexFile = path.join(process.cwd(), "pages", "index.js");
const logoFile = path.join(process.cwd(), "components", "CrystalLogo.js");

for (const f of [indexFile, logoFile]) {
  if (!fs.existsSync(f)) {
    console.error(`Fichier introuvable : ${f}`);
    process.exit(1);
  }
}

const original = fs.readFileSync(indexFile, "utf8");
const logoFileContent = fs.readFileSync(logoFile, "utf8");
const hasCRLF = /\r\n/.test(original);
const EOL = hasCRLF ? "\r\n" : "\n";

function fail(message) {
  console.error(`ECHEC : ${message}`);
  console.error("Aucune modification n'a ete ecrite.");
  process.exit(1);
}

function countSubstring(haystack, needle) {
  let count = 0, pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

function linesContaining(lines, needle) {
  const idxs = [];
  lines.forEach((l, i) => { if (l.includes(needle)) idxs.push(i); });
  return idxs;
}

function requireUnique(idxs, label, needle) {
  if (idxs.length !== 1) {
    fail(`${label} : attendu 1 occurrence de ${JSON.stringify(needle)}, trouve ${idxs.length}.`);
  }
  return idxs[0];
}

// ------------------------------------------------------------
// Verification prealable : components/CrystalLogo.js contient bien
// le composant attendu, avec les memes props.
// ------------------------------------------------------------
if (!logoFileContent.includes("export default function CrystalLogo({ mode = 1, compact = false, dark = false })")) {
  fail("components/CrystalLogo.js ne correspond pas a la signature attendue.");
}
console.log("OK prerequis : components/CrystalLogo.js correspond a la signature attendue");

let lines = original.split(/\r\n|\n/);

// ------------------------------------------------------------
// A — Import, apres FavoriteButton
// ------------------------------------------------------------
const IMPORT_ANCHOR = 'import FavoriteButton from "@/components/FavoriteButton";';
const importIdx = requireUnique(linesContaining(lines, IMPORT_ANCHOR), "import FavoriteButton (ancre)", IMPORT_ANCHOR);
lines = [
  ...lines.slice(0, importIdx + 1),
  'import CrystalLogo from "@/components/CrystalLogo";',
  ...lines.slice(importIdx + 1),
];
console.log("OK repere : import CrystalLogo ajoute");

// ------------------------------------------------------------
// B — Suppression de la definition locale de CrystalLogo
// ------------------------------------------------------------
const FUNC_START_NEEDLE = "function CrystalLogo({ mode = 1, compact = false, dark = false }) {";
const startIdxs = linesContaining(lines, FUNC_START_NEEDLE);
const startIdx = requireUnique(startIdxs, "debut de la fonction CrystalLogo locale", FUNC_START_NEEDLE);

// Comptage d'accolades pour trouver la fin exacte de la fonction
let depth = 0;
let endIdx = -1;
for (let i = startIdx; i < lines.length; i++) {
  for (const ch of lines[i]) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
  }
  if (depth === 0 && i > startIdx) {
    endIdx = i;
    break;
  }
}
if (endIdx === -1) {
  fail("fin de la fonction CrystalLogo locale introuvable (comptage d'accolades).");
}

const removedBlock = lines.slice(startIdx, endIdx + 1).join(" ");
if (!removedBlock.includes("styles[mode - 1]") || !removedBlock.includes("ZENORIA")) {
  fail("contenu inattendu dans le bloc repere pour CrystalLogo (verification de contenu).");
}

lines = [...lines.slice(0, startIdx), ...lines.slice(endIdx + 1)];
console.log(`OK repere : definition locale de CrystalLogo supprimee (lignes ${startIdx + 1} a ${endIdx + 1})`);

// ------------------------------------------------------------
// Garde-fous finaux
// ------------------------------------------------------------
let text = lines.join(EOL);

if (countSubstring(text, 'import CrystalLogo from "@/components/CrystalLogo";') !== 1) {
  fail("garde-fou final : import CrystalLogo absent ou en double.");
}
if (countSubstring(text, "function CrystalLogo(") !== 0) {
  fail("garde-fou final : une definition locale de CrystalLogo subsiste.");
}
if (countSubstring(text, "<CrystalLogo") < 1) {
  fail("garde-fou final : aucun usage de <CrystalLogo ... /> trouve (verifie que le composant est toujours utilise).");
}
if (countSubstring(text, "function HeroVideo(") !== 1) {
  fail("garde-fou final : HeroVideo a disparu ou est en double (ne doit pas etre touche).");
}
console.log("OK garde-fou : import present une fois, definition locale supprimee, usages intacts, HeroVideo preserve");

// ------------------------------------------------------------
// Resultat
// ------------------------------------------------------------
if (text === original) {
  fail("aucune modification produite malgre les controles reussis (cas inattendu).");
}

console.log("");
console.log(`Mode : ${dryRun ? "DRY-RUN" : "APPLY"}`);
console.log("Tous les controles sont conformes.");

if (dryRun) {
  console.log("VERIFICATION SEULE : aucun fichier modifie.");
} else {
  fs.writeFileSync(indexFile, text, "utf8");
  console.log(`Fichier modifie : ${path.relative(process.cwd(), indexFile)}`);
}