// ZENORIA - Branchement du Footer partage dans quiz.js
// ============================================================
import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) {
  console.error("Utilisez --dry-run ou --apply.");
  process.exit(2);
}

const file = path.join(process.cwd(), "pages", "quiz.js");
if (!fs.existsSync(file)) {
  console.error(`Fichier introuvable : ${file}`);
  process.exit(1);
}

const original = fs.readFileSync(file, "utf8");

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

let text = original;

// A — Remplace l'import de QuizFooter (garde QuizHeader, ShippingStrip) par Footer
const OLD_IMPORT = 'import { QuizHeader, QuizFooter, ShippingStrip } from "@/components/QuizChrome";';
if (countSubstring(text, OLD_IMPORT) !== 1) {
  fail(`import : attendu 1 occurrence exacte de ${JSON.stringify(OLD_IMPORT)}.`);
}
const NEW_IMPORT = 'import { QuizHeader, ShippingStrip } from "@/components/QuizChrome";\nimport Footer from "@/components/Footer";';
text = text.replace(OLD_IMPORT, NEW_IMPORT);
console.log("OK repere : import QuizFooter remplace par Footer (QuizHeader/ShippingStrip conserves)");

// B — Remplace l'usage
const OLD_USAGE = '<QuizFooter seasons={footerSeasons} />';
if (countSubstring(text, OLD_USAGE) !== 1) {
  fail(`usage : attendu 1 occurrence exacte de ${JSON.stringify(OLD_USAGE)}.`);
}
const NEW_USAGE = '<Footer seasons={footerSeasons} logoCompact={false} logoDark={true} />';
text = text.replace(OLD_USAGE, NEW_USAGE);
console.log("OK repere : usage <QuizFooter /> remplace par <Footer /> (meme prop seasons)");

// Garde-fous finaux
if (countSubstring(text, "QuizFooter") !== 0) {
  fail("garde-fou final : QuizFooter est encore reference dans quiz.js.");
}
if (countSubstring(text, "<Footer ") !== 1) {
  fail("garde-fou final : <Footer ... /> absent ou en double.");
}
if (countSubstring(text, "QuizHeader") < 1) {
  fail("garde-fou final : QuizHeader a disparu (ne doit pas etre touche).");
}
if (countSubstring(text, "ShippingStrip") < 1) {
  fail("garde-fou final : ShippingStrip a disparu (ne doit pas etre touche).");
}
console.log("OK garde-fou : QuizFooter totalement remplace, QuizHeader/ShippingStrip intacts");

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