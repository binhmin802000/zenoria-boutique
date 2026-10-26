// ZENORIA - Branchement du Footer partage dans index.js
// ============================================================
// Remplace le footer en dur (lignes ~1201-1305) par le composant
// partage <Footer />, en transmettant seasonCards, un clic direct
// (chooseFamily + scrollToCatalogue) et le logo (mode={logo}, compact,
// dark) deja utilises par la page.
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
// A — Import de Footer, apres l'import de CrystalLogo
// ------------------------------------------------------------
const IMPORT_ANCHOR = 'import CrystalLogo from "@/components/CrystalLogo";';
const importIdx = requireUnique(linesContaining(lines, IMPORT_ANCHOR), "import CrystalLogo (ancre)", IMPORT_ANCHOR);
lines = [
  ...lines.slice(0, importIdx + 1),
  'import Footer from "@/components/Footer";',
  ...lines.slice(importIdx + 1),
];
console.log("OK repere : import Footer ajoute");

// ------------------------------------------------------------
// B — Localisation du <footer>...</footer> complet
// ------------------------------------------------------------
const FOOTER_OPEN = '<footer className="bg-[#2f252d] text-white/70 py-12">';
const openIdxs = linesContaining(lines, FOOTER_OPEN);
const openIdx = requireUnique(openIdxs, "ouverture du footer", FOOTER_OPEN);

const FOOTER_CLOSE = "</footer>";
const closeIdxs = linesContaining(lines, FOOTER_CLOSE);
const closeIdx = requireUnique(closeIdxs, "fermeture du footer", FOOTER_CLOSE);

if (closeIdx <= openIdx) {
  fail("fermeture du footer trouvee avant son ouverture (ordre inattendu).");
}

const removedBlock = lines.slice(openIdx, closeIdx + 1).join(" ");
const requiredPieces = ["CrystalLogo", "seasonCards", "Livraison et retours", "Conditions générales de vente", "Suivez-nous"];
const missingPieces = requiredPieces.filter((p) => !removedBlock.includes(p));
if (missingPieces.length > 0) {
  fail(`bloc footer : elements manquants dans la zone reperee : ${missingPieces.join(", ")}.`);
}
console.log(`OK verification : bloc footer repere (lignes ${openIdx + 1} a ${closeIdx + 1}), contenu attendu present`);

const indentMatch = lines[openIdx].match(/^(\s*)/);
const indent = indentMatch ? indentMatch[1] : "      ";

const newFooterLines = [
  `${indent}<Footer`,
  `${indent}  seasons={seasonCards}`,
  `${indent}  seasonsOnClick={(key) => { chooseFamily(key); scrollToCatalogue(); }}`,
  `${indent}  logoMode={logo}`,
  `${indent}  logoCompact={true}`,
  `${indent}  logoDark={true}`,
  `${indent}/>`,
];

lines = [...lines.slice(0, openIdx), ...newFooterLines, ...lines.slice(closeIdx + 1)];
console.log("OK repere : footer en dur remplace par <Footer ... />");

// ------------------------------------------------------------
// Garde-fous finaux
// ------------------------------------------------------------
let text = lines.join(EOL);

if (countSubstring(text, 'import Footer from "@/components/Footer";') !== 1) {
  fail("garde-fou final : import Footer absent ou en double.");
}
if (countSubstring(text, "<Footer") !== 1) {
  fail("garde-fou final : <Footer ... /> absent ou en double.");
}
if (countSubstring(text, "<footer ") !== 0) {
  fail("garde-fou final : un footer en dur subsiste encore.");
}
if (countSubstring(text, "<CrystalLogo") < 2) {
  fail("garde-fou final : les autres usages de <CrystalLogo> (header, bannière) ont disparu.");
}
if (countSubstring(text, "const chooseFamily") !== 1) {
  fail("garde-fou final : chooseFamily a disparu ou est en double (ne doit pas etre touche).");
}
console.log("OK garde-fou : import/usage Footer corrects, footer en dur supprime, autres usages de CrystalLogo et chooseFamily intacts");

// ------------------------------------------------------------
// Resultat
// ------------------------------------------------------------
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