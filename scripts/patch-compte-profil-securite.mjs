// ZENORIA - Branchement d'AccountProfileSection dans "Profil & securite" (compte.js)
// ============================================================
import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) {
  console.error("Utilisez --dry-run ou --apply.");
  process.exit(2);
}

const file = path.join(process.cwd(), "pages", "compte.js");
if (!fs.existsSync(file)) {
  console.error(`Fichier introuvable : ${file}`);
  process.exit(1);
}

const original = fs.readFileSync(file, "utf8");
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

let lines = original.split(/\r\n|\n/);

// ------------------------------------------------------------
// A — Import du composant, juste apres l'import de AccountDataSection
// ------------------------------------------------------------
const IMPORT_ANCHOR = 'import AccountDataSection from "@/components/AccountDataSection";';
const importIdx = requireUnique(linesContaining(lines, IMPORT_ANCHOR), "import AccountDataSection (ancre)", IMPORT_ANCHOR);
lines = [
  ...lines.slice(0, importIdx + 1),
  'import AccountProfileSection from "@/components/AccountProfileSection";',
  ...lines.slice(importIdx + 1),
];
console.log("OK repere : import AccountProfileSection ajoute");

// ------------------------------------------------------------
// B — Exclut "profil" du bloc generique, et ajoute un bloc dedie avant
// ------------------------------------------------------------
const GENERIC_OLD = '{current && !["accueil", "commandes", "avis", "favoris", "donnees"].includes(current.id) && (';
const genericIdxs = linesContaining(lines, GENERIC_OLD);
const genericIdx = requireUnique(genericIdxs, "bloc generique (rubrique bientot disponible)", GENERIC_OLD);
const indentMatch = lines[genericIdx].match(/^(\s*)/);
const indent = indentMatch ? indentMatch[1] : "              ";

const GENERIC_NEW = `${indent}{current && !["accueil", "commandes", "avis", "favoris", "donnees", "profil"].includes(current.id) && (`;
lines[genericIdx] = GENERIC_NEW;
console.log("OK repere : bloc generique exclut desormais \"profil\"");

const profileBlockLines = [
  `${indent}{current && current.id === "profil" && (`,
  `${indent}  <AccountProfileSection user={user} />`,
  `${indent})}`,
  "",
];

lines = [
  ...lines.slice(0, genericIdx),
  ...profileBlockLines,
  ...lines.slice(genericIdx),
];
console.log("OK repere : bloc dedie \"profil\" insere avant le bloc generique");

// ------------------------------------------------------------
// Garde-fous finaux
// ------------------------------------------------------------
let text = lines.join(EOL);

if (countSubstring(text, "AccountProfileSection") < 3) {
  fail(`garde-fou final : attendu au moins 3 occurrences de AccountProfileSection, trouve ${countSubstring(text, "AccountProfileSection")}.`);
}
if (!text.includes('!["accueil", "commandes", "avis", "favoris", "donnees", "profil"].includes(current.id)')) {
  fail("garde-fou final : le bloc generique n'exclut pas correctement \"profil\".");
}
if (countSubstring(text, 'current.id === "profil"') !== 1) {
  fail("garde-fou final : condition dediee \"profil\" absente ou en double.");
}
if (countSubstring(text, 'current.id === "donnees"') !== 1) {
  fail("garde-fou final : le bloc \"donnees\" (chantier precedent) a disparu ou est en double.");
}
console.log("OK garde-fou : AccountProfileSection branche, bloc generique exclut profil, donnees intact");

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
  fs.writeFileSync(file, text, "utf8");
  console.log(`Fichier modifie : ${path.relative(process.cwd(), file)}`);
}