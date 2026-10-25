// ZENORIA - Lot 4B (CGV) - 6d : brancher AdminCgv dans AdminSiteMedia.js
// ============================================================
// Ce script modifie UNIQUEMENT components/AdminSiteMedia.js, et
// seulement si TOUS les controles reussissent. Si un seul echoue,
// AUCUNE ecriture n'est faite (tout ou rien).
//
// Ajoute l'import de AdminCgv et insere <AdminCgv /> juste apres
// <AdminSiteTexts />, dans la meme liste de composants empiles.
//
// Usage :
//   node scripts/patch-admin-cgv.mjs --dry-run
//   node scripts/patch-admin-cgv.mjs --apply
// ============================================================

import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) {
  console.error("Utilisez --dry-run ou --apply.");
  process.exit(2);
}

const file = path.join(process.cwd(), "components", "AdminSiteMedia.js");
if (!fs.existsSync(file)) {
  console.error(`Fichier introuvable : ${file}`);
  console.error("Lancez ce script depuis la racine du projet (dossier zenoria).");
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
// A — Import AdminCgv, juste apres l'import de AdminSiteTexts
// ------------------------------------------------------------
const IMPORT_NEEDLE = 'import AdminSiteTexts from "@/components/AdminSiteTexts";';
const importIdx = requireUnique(linesContaining(lines, IMPORT_NEEDLE), "import AdminSiteTexts", IMPORT_NEEDLE);
lines = [
  ...lines.slice(0, importIdx + 1),
  'import AdminCgv from "@/components/AdminCgv";',
  ...lines.slice(importIdx + 1),
];
console.log("OK repere : import AdminCgv ajoute apres import AdminSiteTexts");

// ------------------------------------------------------------
// B — <AdminSiteTexts /> dans le JSX, insertion de <AdminCgv /> apres
// ------------------------------------------------------------
const JSX_NEEDLE = "<AdminSiteTexts />";
const jsxIdxs = linesContaining(lines, JSX_NEEDLE);
const jsxIdx = requireUnique(jsxIdxs, "balise <AdminSiteTexts /> dans le JSX", JSX_NEEDLE);
const indentMatch = lines[jsxIdx].match(/^(\s*)/);
const indent = indentMatch ? indentMatch[1] : "      ";
lines = [
  ...lines.slice(0, jsxIdx + 1),
  `${indent}{/* CGV : conditions generales de vente, page publique /cgv */}`,
  `${indent}<AdminCgv />`,
  ...lines.slice(jsxIdx + 1),
];
console.log("OK repere : <AdminCgv /> insere apres <AdminSiteTexts />");

// ------------------------------------------------------------
// Garde-fous finaux
// ------------------------------------------------------------
let text = lines.join(EOL);

if (countSubstring(text, 'import AdminCgv from "@/components/AdminCgv";') !== 1) {
  fail("garde-fou final : import AdminCgv absent ou en double.");
}
if (countSubstring(text, "<AdminCgv />") !== 1) {
  fail("garde-fou final : balise <AdminCgv /> absente ou en double.");
}
if (countSubstring(text, "<AdminSiteTexts />") !== 1) {
  fail("garde-fou final : <AdminSiteTexts /> a disparu ou est en double (ne doit pas etre touche).");
}
if (countSubstring(text, "<AdminLegalPages />") !== 1) {
  fail("garde-fou final : <AdminLegalPages /> a disparu (verification de non-regression).");
}
console.log("OK garde-fou : AdminCgv importe et insere, AdminSiteTexts/AdminLegalPages intacts");

// ------------------------------------------------------------
// Resultat
// ------------------------------------------------------------
if (text === original) {
  fail("aucune modification produite malgre les controles reussis (cas inattendu).");
}

console.log("");
console.log(`Mode : ${dryRun ? "DRY-RUN" : "APPLY"}`);
console.log("Tous les controles sont conformes.");
console.log("Modifications preparees :");
console.log("  - Import de AdminCgv");
console.log("  - <AdminCgv /> insere juste apres <AdminSiteTexts /> dans l'onglet Contenu du site");

if (dryRun) {
  console.log("");
  console.log("VERIFICATION SEULE : aucun fichier modifie.");
} else {
  fs.writeFileSync(file, text, "utf8");
  console.log("");
  console.log(`Fichier modifie : ${path.relative(process.cwd(), file)}`);
}