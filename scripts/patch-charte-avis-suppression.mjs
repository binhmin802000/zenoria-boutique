// ZENORIA - Precision charte des avis : avis non affectes par suppression de compte
// ============================================================
import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) {
  console.error("Utilisez --dry-run ou --apply.");
  process.exit(2);
}

const file = path.join(process.cwd(), "pages", "charte-des-avis.js");
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

const ANCHOR = `<p>Un avis reste en ligne {r.publicationYears} ans. Son autrice peut le retirer à tout moment depuis son espace « Mes commandes &amp; avis », ou en nous écrivant.</p>`;
const count = countSubstring(original, ANCHOR);
if (count !== 1) {
  fail(`attendu 1 occurrence exacte du paragraphe "duree" dans la charte des avis, trouve ${count}.`);
}
console.log("OK repere : paragraphe \"Duree de publication\" de la charte des avis");

const indentMatch = original.split(/\r\n|\n/).find((l) => l.includes(ANCHOR));
const indentWs = indentMatch ? indentMatch.match(/^(\s*)/)[1] : "          ";

const ADDITION = `${EOL}${indentWs}<p>Un avis publié reste visible même après la suppression de votre compte, afin de garantir l'authenticité des avis.</p>`;

let text = original.replace(ANCHOR, ANCHOR + ADDITION);

if (countSubstring(text, "après la suppression de votre compte") !== 1) {
  fail("garde-fou final : le nouveau paragraphe n'a pas ete insere correctement.");
}
if (countSubstring(text, ANCHOR) !== 1) {
  fail("garde-fou final : le paragraphe original a disparu ou est en double.");
}
console.log("OK garde-fou : nouveau paragraphe ajoute, paragraphe original intact");

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