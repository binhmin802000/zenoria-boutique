// ZENORIA - Simplification de mentions-legales.js (CGV deplacees vers /cgv)
// ============================================================
// Ce script modifie UNIQUEMENT pages/mentions-legales.js, et
// seulement si TOUS les controles reussissent. Si un seul echoue,
// AUCUNE ecriture n'est faite.
//
// Supprime les sections de type CGV (produits, prix-commande, paiement,
// livraison, retractation, garanties, mediation, droit-applicable,
// formulaire-retractation), deja reprises dans le texte admin CGV.
// Conserve : editeur, hebergement, propriete intellectuelle.
// Renomme le titre et le <title> de la page en consequence.
//
// Usage :
//   node scripts/patch-simplifier-mentions-legales.mjs --dry-run
//   node scripts/patch-simplifier-mentions-legales.mjs --apply
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

let text = original;

// ------------------------------------------------------------
// A — Retitrer la page
// ------------------------------------------------------------
const TITLE_OLD = "Mentions légales &amp; CGV – Zenoria";
if (countSubstring(text, TITLE_OLD) !== 1) {
  fail(`balise <title> : attendu 1 occurrence de ${JSON.stringify(TITLE_OLD)}.`);
}
text = text.replace(TITLE_OLD, "Mentions légales – Zenoria");

const H1_OLD = "Mentions légales &amp; Conditions générales de vente";
if (countSubstring(text, H1_OLD) !== 1) {
  fail(`titre H1 : attendu 1 occurrence de ${JSON.stringify(H1_OLD)}.`);
}
text = text.replace(H1_OLD, "Mentions légales");
console.log("OK repere : titre de page et H1 simplifies");

// ------------------------------------------------------------
// B — Supprimer les sections CGV, du debut "produits" jusqu'a la fin
//     du formulaire de retractation (bloc contigu dans le fichier)
// ------------------------------------------------------------
const CGV_START = '<Section id="produits"';
const CGV_END_MARKER = '</Section>' + EOL + '      </main>';

const startIdx = text.indexOf(CGV_START);
if (startIdx === -1) {
  fail(`debut des sections CGV introuvable (${JSON.stringify(CGV_START)}).`);
}
if (countSubstring(text, CGV_START) !== 1) {
  fail(`debut des sections CGV : attendu 1 occurrence, trouve ${countSubstring(text, CGV_START)}.`);
}

const endMarkerIdx = text.indexOf(CGV_END_MARKER, startIdx);
if (endMarkerIdx === -1) {
  fail("fin des sections CGV introuvable (bloc </Section> suivi de </main>).");
}
const endIdx = endMarkerIdx + "</Section>".length;

const removedBlock = text.slice(startIdx, endIdx);
const expectedSections = [
  'id="produits"', 'id="prix-commande"', 'id="paiement"', 'id="livraison"',
  'id="retractation"', 'id="garanties"', 'id="mediation"',
  'id="droit-applicable"', 'id="formulaire-retractation"',
];
const missing = expectedSections.filter((s) => !removedBlock.includes(s));
if (missing.length > 0) {
  fail(`bloc CGV : sections attendues manquantes dans le bloc repere : ${missing.join(", ")}.`);
}

text = text.slice(0, startIdx) + text.slice(endIdx);
console.log("OK repere : 9 sections CGV supprimees (produits -> formulaire-retractation)");

// ------------------------------------------------------------
// Garde-fous finaux
// ------------------------------------------------------------
if (countSubstring(text, 'id="editeur"') !== 1) fail("garde-fou final : section editeur a disparu.");
if (countSubstring(text, 'id="hebergement"') !== 1) fail("garde-fou final : section hebergement a disparu.");
if (countSubstring(text, 'id="propriete"') !== 1) fail("garde-fou final : section propriete intellectuelle a disparu.");
if (countSubstring(text, 'id="produits"') !== 0) fail("garde-fou final : la section produits (CGV) est encore presente.");
if (countSubstring(text, 'id="formulaire-retractation"') !== 0) fail("garde-fou final : le formulaire de retractation est encore present.");
if (countSubstring(text, "logo-facture.png") !== 1) fail("garde-fou final : le logo a disparu (ne doit pas etre touche).");
console.log("OK garde-fou : editeur/hebergement/propriete conserves, CGV absentes, logo intact");

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
console.log("  - Titre de page et H1 : \"Mentions legales\" (sans CGV)");
console.log("  - Suppression des 9 sections CGV (deplacees vers /cgv via l'admin)");
console.log("  - Conservation : editeur, hebergement, propriete intellectuelle");

if (dryRun) {
  console.log("");
  console.log("VERIFICATION SEULE : aucun fichier modifie.");
  console.log("");
  console.log("--- APERCU : lignes autour du point de suppression ---");
  const previewStart = Math.max(0, original.indexOf(CGV_START) - 200);
  console.log(original.slice(previewStart, original.indexOf(CGV_START)));
  console.log(">>> [ 9 SECTIONS CGV SERONT SUPPRIMEES ICI ] <<<");
  const afterIdx = original.indexOf(CGV_END_MARKER, original.indexOf(CGV_START)) + "</Section>".length;
  console.log(original.slice(afterIdx, afterIdx + 100));
} else {
  fs.writeFileSync(file, text, "utf8");
  console.log("");
  console.log(`Fichier modifie : ${path.relative(process.cwd(), file)}`);
}