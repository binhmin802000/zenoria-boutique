// ZENORIA - Mes favoris : nom du bijou cliquable vers sa fiche
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

const NEEDLE = '<div className="font-serif text-base leading-tight truncate">{p.name}</div>';
const idx = requireUnique(linesContaining(lines, NEEDLE), "nom du bijou dans Mes favoris", NEEDLE);

const indentMatch = lines[idx].match(/^(\s*)/);
const indent = indentMatch ? indentMatch[1] : "                              ";

const newLines = [
  `${indent}{p.active && p.slug ? (`,
  `${indent}  <a href={\`/#bague=${"$"}{encodeURIComponent(p.slug)}\`} className="font-serif text-base leading-tight truncate hover:underline block">{p.name}</a>`,
  `${indent}) : (`,
  `${indent}  <div className="font-serif text-base leading-tight truncate">{p.name}</div>`,
  `${indent})}`,
];

lines = [...lines.slice(0, idx), ...newLines, ...lines.slice(idx + 1)];
console.log("OK repere : nom du bijou (Mes favoris) rendu cliquable conditionnellement");

let text = lines.join(EOL);

if (countSubstring(text, "/#bague=") < 1) {
  fail('garde-fou final : aucun lien "/#bague=" trouve apres modification.');
}
if (countSubstring(text, "FavThumb") < 2) {
  fail("garde-fou final : FavThumb a disparu (verification de non-regression).");
}
if (countSubstring(text, "removeFromFavorites") < 1) {
  fail("garde-fou final : le bouton Retirer des favoris a disparu.");
}
console.log("OK garde-fou : lien ajoute, FavThumb et boutons existants intacts");

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