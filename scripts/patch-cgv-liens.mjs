// ZENORIA - Lot 4B (CGV) - 6f : liens pied de page + case a cocher panier (v3)
// ============================================================
import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) {
  console.error("Utilisez --dry-run ou --apply.");
  process.exit(2);
}

const file = path.join(process.cwd(), "pages", "index.js");
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
// A — Pied de page : lien CGV avant Mentions legales
// ------------------------------------------------------------
const FOOTER_NEEDLE = 'Mentions légales</a></p>';
const footerIdx = requireUnique(linesContaining(lines, FOOTER_NEEDLE), "pied de page : ligne Mentions legales", FOOTER_NEEDLE);
const footerIndentMatch = lines[footerIdx].match(/^(\s*)/);
const footerIndent = footerIndentMatch ? footerIndentMatch[1] : "              ";
const cgvFooterLine = `${footerIndent}<p><a href="/cgv" className="hover:text-white underline-offset-2 hover:underline">Conditions générales de vente</a></p>`;
lines = [...lines.slice(0, footerIdx), cgvFooterLine, ...lines.slice(footerIdx)];
console.log("OK repere : lien CGV ajoute dans le pied de page, avant Mentions legales");

// ------------------------------------------------------------
// B — Case a cocher : 3 lignes a modifier individuellement
// ------------------------------------------------------------
// Ligne 1 : ouverture du lien (href + attributs)
const LINK_OPEN_NEEDLE = '<a href="/mentions-legales" target="_blank" rel="noopener noreferrer" className="underline text-[#8f6075]">';
const linkOpenIdxs = linesContaining(lines, LINK_OPEN_NEEDLE);
const linkOpenIdx = requireUnique(linkOpenIdxs, "case a cocher : ouverture du lien", LINK_OPEN_NEEDLE);

// Ligne 2 : le texte du lien
const LINK_TEXT_NEEDLE = "conditions générales de vente et les mentions légales";
const linkTextIdxs = linesContaining(lines, LINK_TEXT_NEEDLE);
const linkTextIdx = requireUnique(linkTextIdxs, "case a cocher : texte du lien", LINK_TEXT_NEEDLE);

// Ligne 3 : fermeture du lien, doit suivre juste apres le texte
if (linkTextIdx !== linkOpenIdx + 1) {
  fail(`case a cocher : le texte du lien (ligne ${linkTextIdx + 1}) n'est pas juste apres l'ouverture (ligne ${linkOpenIdx + 1}).`);
}
const CLOSE_NEEDLE = "</a>";
if (lines[linkTextIdx + 1].trim() !== CLOSE_NEEDLE) {
  fail(`case a cocher : fermeture </a> non trouvee juste apres le texte (ligne ${linkTextIdx + 2}).`);
}

const openIndentMatch = lines[linkOpenIdx].match(/^(\s*)/);
const openIndent = openIndentMatch ? openIndentMatch[1] : "                        ";
const textIndentMatch = lines[linkTextIdx].match(/^(\s*)/);
const textIndent = textIndentMatch ? textIndentMatch[1] : "                          ";

const newBlock = [
  `${openIndent}<a href="/cgv" target="_blank" rel="noopener noreferrer" className="underline text-[#8f6075]">`,
  `${textIndent}conditions générales de vente`,
  `${openIndent}</a>{" "}`,
  `${openIndent}et les{" "}`,
  `${openIndent}<a href="/mentions-legales" target="_blank" rel="noopener noreferrer" className="underline text-[#8f6075]">`,
  `${textIndent}mentions légales`,
  `${openIndent}</a>`,
];

lines = [
  ...lines.slice(0, linkOpenIdx),
  ...newBlock,
  ...lines.slice(linkTextIdx + 2),
];
console.log("OK repere : case a cocher scindee en deux liens distincts (CGV + mentions legales)");

// ------------------------------------------------------------
// Garde-fous finaux
// ------------------------------------------------------------
let text = lines.join(EOL);

const cgvCount = countSubstring(text, 'href="/cgv"');
if (cgvCount !== 2) {
  fail(`garde-fou final : attendu exactement 2 occurrences de href="/cgv" (pied de page + case a cocher), trouve ${cgvCount}.`);
}
const mlCount = countSubstring(text, 'href="/mentions-legales"');
if (mlCount !== 2) {
  fail(`garde-fou final : attendu exactement 2 occurrences de href="/mentions-legales" (pied de page + case a cocher), trouve ${mlCount}.`);
}
console.log("OK garde-fou : 2 liens /cgv et 2 liens /mentions-legales presents (pied de page + case a cocher)");

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