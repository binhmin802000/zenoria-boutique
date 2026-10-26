// ZENORIA - Precision RGPD : avis non affectes par la suppression de compte
// ============================================================
import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) {
  console.error("Utilisez --dry-run ou --apply.");
  process.exit(2);
}

const file = path.join(process.cwd(), "pages", "confidentialite.js");
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

const ANCHOR = '<p>Un avis reste en ligne pendant 3 ans, ou jusqu&apos;à ce que vous demandiez sa suppression à l&apos;adresse <a href="mailto:bagues.mandala@proton.me" className="underline text-[#8f6075]">bagues.mandala@proton.me</a>.</p>';
const count = countSubstring(original, ANCHOR);
if (count !== 1) {
  fail(`attendu 1 occurrence exacte du paragraphe sur la duree de vie d'un avis, trouve ${count}.`);
}
console.log("OK repere : paragraphe sur la duree de vie d'un avis");

const indentMatch = original.split(/\r\n|\n/).find((l) => l.includes(ANCHOR));
const indentWs = indentMatch ? indentMatch.match(/^(\s*)/)[1] : "          ";

const ADDITION = `${EOL}${indentWs}<p>Les avis, contrôlés, acceptés et publiés restent visibles après la suppression de votre compte, afin de garantir l'authenticité et l'intégrité des avis clients (ils ne peuvent être modifiés après publication, pas même par nos soins). Vous pouvez toutefois retirer un avis à tout moment depuis votre espace client, tant qu'il reste dans la fenêtre de retrait prévue.</p>`;

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