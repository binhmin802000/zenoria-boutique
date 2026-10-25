// ZENORIA - Retrait du bandeau "Version provisoire" (mentions-legales.js)
// ============================================================
import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) {
  console.error("Utilisez --dry-run ou --apply.");
  process.exit(2);
}

const file = path.join(process.cwd(), "pages", "mentions-legales.js");
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

if (countSubstring(original, "<Todo>") !== 0) {
  fail(`prerequis : il reste ${countSubstring(original, "<Todo>")} balise(s) <Todo> non resolue(s). Le bandeau ne doit pas etre retire tant que des Todo subsistent.`);
}
console.log("OK prerequis : aucun <Todo> restant dans le fichier");

let lines = original.split(/\r\n|\n/);

// ------------------------------------------------------------
// A — Commentaire d'avertissement en haut du fichier
// ------------------------------------------------------------
const COMMENT_NEEDLE = "VERSION PROVISOIRE";
const commentIdxs = [];
lines.forEach((l, i) => { if (l.includes(COMMENT_NEEDLE)) commentIdxs.push(i); });
if (commentIdxs.length !== 1) {
  fail(`commentaire VERSION PROVISOIRE : attendu 1 occurrence, trouve ${commentIdxs.length}.`);
}
const commentIdx = commentIdxs[0];
lines = [...lines.slice(0, commentIdx), ...lines.slice(commentIdx + 1)];
console.log("OK repere : commentaire VERSION PROVISOIRE supprime");

// ------------------------------------------------------------
// B — Bandeau visuel affiche aux clientes
// ------------------------------------------------------------
const BANNER_START_NEEDLE = 'data-testid="draft-notice"';
const startIdxs = [];
lines.forEach((l, i) => { if (l.includes(BANNER_START_NEEDLE)) startIdxs.push(i); });
if (startIdxs.length !== 1) {
  fail(`bandeau draft-notice : attendu 1 occurrence, trouve ${startIdxs.length}.`);
}
const startIdx = startIdxs[0];
// Le bandeau <div ...>...texte...</div> se termine par une ligne contenant seulement </div>
let closeIdx = -1;
for (let i = startIdx; i < Math.min(lines.length, startIdx + 8); i++) {
  if (lines[i].trim() === "</div>") { closeIdx = i; break; }
}
if (closeIdx === -1) {
  fail("bandeau draft-notice : fermeture </div> introuvable dans les 8 lignes suivantes.");
}
const bannerBlock = lines.slice(startIdx, closeIdx + 1).join(" ");
if (!bannerBlock.includes("Version provisoire")) {
  fail("bandeau draft-notice : le texte attendu \"Version provisoire\" est absent du bloc repere.");
}
lines = [...lines.slice(0, startIdx), ...lines.slice(closeIdx + 1)];
console.log("OK repere : bandeau visuel \"Version provisoire\" supprime");

// ------------------------------------------------------------
// Garde-fous finaux
// ------------------------------------------------------------
let text = lines.join(EOL);

if (countSubstring(text, "Version provisoire") !== 0) fail("garde-fou final : le texte \"Version provisoire\" est encore present.");
if (countSubstring(text, "draft-notice") !== 0) fail("garde-fou final : le data-testid draft-notice est encore present.");
if (countSubstring(text, 'id="editeur"') !== 1) fail("garde-fou final : section editeur disparue (ne doit pas etre touchee).");
if (countSubstring(text, "logo-facture.png") !== 1) fail("garde-fou final : le logo a disparu.");
console.log("OK garde-fou : bandeau totalement retire, sections et logo intacts");

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