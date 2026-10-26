// ZENORIA - Ajout de l'onglet RGPD dans la navigation admin (groupe CRM)
// ============================================================
import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) {
  console.error("Utilisez --dry-run ou --apply.");
  process.exit(2);
}

const file = path.join(process.cwd(), "lib", "adminNav.js");
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

const OLD = '{ id: "avenir", label: "À venir" },';
const count = countSubstring(original, OLD);
if (count !== 1) {
  fail(`attendu 1 occurrence exacte de ${JSON.stringify(OLD)}, trouve ${count}.`);
}
console.log("OK repere : entree \"avenir\" dans le groupe CRM");

const NEW = `${OLD}${EOL}      { id: "rgpd", label: "RGPD" },`;
let text = original.replace(OLD, NEW);

if (countSubstring(text, '{ id: "rgpd", label: "RGPD" },') !== 1) {
  fail("garde-fou final : l'entree rgpd n'a pas ete correctement ajoutee.");
}
if (countSubstring(text, '{ id: "avenir", label: "À venir" },') !== 1) {
  fail("garde-fou final : l'entree avenir a disparu ou est en double.");
}
console.log("OK garde-fou : entree rgpd ajoutee, avenir intacte");

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