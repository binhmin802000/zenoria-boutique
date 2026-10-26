// ZENORIA - Correctif : ajoute ShieldCheck a l'import lucide-react de pages/admin.js
// ============================================================
import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) {
  console.error("Utilisez --dry-run ou --apply.");
  process.exit(2);
}

const file = path.join(process.cwd(), "pages", "admin.js");
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

const OLD = "ChevronDown, ChevronLeft, ChevronRight } from \"lucide-react\";";
const count = countSubstring(original, OLD);
if (count !== 1) {
  fail(`attendu 1 occurrence exacte de ${JSON.stringify(OLD)}, trouve ${count}.`);
}
console.log("OK repere : fin de l'import lucide-react principal");

const NEW = "ChevronDown, ChevronLeft, ChevronRight, ShieldCheck } from \"lucide-react\";";
let text = original.replace(OLD, NEW);

if (countSubstring(text, "ShieldCheck") < 1) {
  fail("garde-fou final : ShieldCheck n'a pas ete ajoute correctement.");
}
console.log("OK garde-fou : ShieldCheck ajoute a l'import lucide-react");

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