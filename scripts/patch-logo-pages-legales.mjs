// ZENORIA - Logo sur les pages legales (CGV, Mentions legales, Confidentialite, Charte des avis)
// ============================================================
// Ce script modifie 4 fichiers, et seulement si TOUS les controles
// reussissent sur les 4. Si un seul echoue, AUCUNE ecriture n'est
// faite (tout ou rien), sur aucun des 4 fichiers.
//
//   - pages/cgv.js
//   - pages/mentions-legales.js
//   - pages/confidentialite.js
//   - pages/charte-des-avis.js
//
// Remplace le texte "ZENORIA" du header par le logo horizontal
// (public/images/logo-facture.png), en gardant le lien vers "/" et
// le lien "Retour à la boutique" inchange.
//
// Usage :
//   node scripts/patch-logo-pages-legales.mjs --dry-run
//   node scripts/patch-logo-pages-legales.mjs --apply
// ============================================================

import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) {
  console.error("Utilisez --dry-run ou --apply.");
  process.exit(2);
}

const files = [
  path.join(process.cwd(), "pages", "cgv.js"),
  path.join(process.cwd(), "pages", "mentions-legales.js"),
  path.join(process.cwd(), "pages", "confidentialite.js"),
  path.join(process.cwd(), "pages", "charte-des-avis.js"),
];

for (const f of files) {
  if (!fs.existsSync(f)) {
    console.error(`Fichier introuvable : ${f}`);
    process.exit(1);
  }
}

function fail(message) {
  console.error(`ECHEC : ${message}`);
  console.error("Aucune modification n'a ete ecrite sur aucun des 4 fichiers.");
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

const OLD_LOGO = '<a href="/" className="font-serif text-xl tracking-[.22em] text-[#412f3b]">ZENORIA</a>';
const NEW_LOGO = '<a href="/"><img src="/images/logo-facture.png" alt="Zenoria" className="h-9 w-auto" /></a>';

const results = [];

for (const file of files) {
  const original = fs.readFileSync(file, "utf8");
  const count = countSubstring(original, OLD_LOGO);
  if (count !== 1) {
    fail(`${path.basename(file)} : attendu 1 occurrence exacte du header ZENORIA, trouve ${count}.`);
  }
  const text = original.replace(OLD_LOGO, NEW_LOGO);
  if (countSubstring(text, "logo-facture.png") !== 1) {
    fail(`${path.basename(file)} : garde-fou, le logo n'a pas ete insere correctement.`);
  }
  if (countSubstring(text, "Retour à la boutique") !== 1) {
    fail(`${path.basename(file)} : garde-fou, le lien "Retour à la boutique" a disparu.`);
  }
  results.push({ file, original, text });
  console.log(`OK repere : ${path.basename(file)} (header localise, logo pret a etre insere)`);
}

console.log("OK garde-fou : les 4 fichiers sont prets, logo et lien retour intacts partout");

const anyChanged = results.some((r) => r.text !== r.original);
if (!anyChanged) {
  fail("aucune modification produite malgre les controles reussis (cas inattendu).");
}

console.log("");
console.log(`Mode : ${dryRun ? "DRY-RUN" : "APPLY"}`);
console.log("Tous les controles sont conformes.");
console.log("Modifications preparees :");
console.log("  - Logo Zenoria a la place du texte ZENORIA, sur les 4 pages legales");

if (dryRun) {
  console.log("");
  console.log("VERIFICATION SEULE : aucun fichier modifie.");
} else {
  for (const r of results) {
    fs.writeFileSync(r.file, r.text, "utf8");
    console.log(`Fichier modifie : ${path.relative(process.cwd(), r.file)}`);
  }
}