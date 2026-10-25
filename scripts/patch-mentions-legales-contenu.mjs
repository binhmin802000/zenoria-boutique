// ZENORIA - Mise a jour du contenu de mentions-legales.js
// ============================================================
// Ce script modifie UNIQUEMENT pages/mentions-legales.js, et
// seulement si TOUS les controles reussissent. Si un seul echoue,
// AUCUNE ecriture n'est faite.
//
// Remplace les blocs "Qui edite ce site ?" et "Hebergement" par le
// contenu fourni par l'utilisateur (reformule), en retirant les
// <Todo> desormais combles. La section "Propriete intellectuelle"
// n'est pas touchee.
//
// Usage :
//   node scripts/patch-mentions-legales-contenu.mjs --dry-run
//   node scripts/patch-mentions-legales-contenu.mjs --apply
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
// A — Section "editeur" : du titre jusqu'a </Section>
// ------------------------------------------------------------
const EDITEUR_START = '<Section id="editeur" title="Qui édite ce site ?">';
const startA = text.indexOf(EDITEUR_START);
if (startA === -1) fail(`section editeur introuvable (${JSON.stringify(EDITEUR_START)}).`);
if (countSubstring(text, EDITEUR_START) !== 1) fail("section editeur : occurrence multiple du titre.");
const endMarkerA = "</Section>";
const endAIdx = text.indexOf(endMarkerA, startA);
if (endAIdx === -1) fail("section editeur : fermeture </Section> introuvable.");
const endA = endAIdx + endMarkerA.length;

const oldEditeurBlock = text.slice(startA, endA);
if (!oldEditeurBlock.includes("<Todo>")) {
  fail("section editeur : aucun <Todo> trouve dans le bloc repere (le contenu a peut-etre deja ete modifie).");
}

const newEditeurBlock = [
  '<Section id="editeur" title="Qui édite ce site ?">',
  '          <p>',
  '            Le site Zenoria est édité par une entreprise individuelle immatriculée sous le numéro SIRET 821 828 183 00011.',
  '          </p>',
  '          <p>',
  '            Contact : bagues.mandala@proton.me',
  '          </p>',
  '          <p>',
  '            TVA non applicable — article 293 B du Code général des impôts.',
  '          </p>',
  '        </Section>',
].join(EOL);

text = text.slice(0, startA) + newEditeurBlock + text.slice(endA);
console.log("OK repere : section \"Qui edite ce site ?\" mise a jour");

// ------------------------------------------------------------
// B — Section "hebergement" : du titre jusqu'a </Section>
// ------------------------------------------------------------
const HEBERGEMENT_START = '<Section id="hebergement" title="Hébergement">';
const startB = text.indexOf(HEBERGEMENT_START);
if (startB === -1) fail(`section hebergement introuvable (${JSON.stringify(HEBERGEMENT_START)}).`);
if (countSubstring(text, HEBERGEMENT_START) !== 1) fail("section hebergement : occurrence multiple du titre.");
const endBIdx = text.indexOf(endMarkerA, startB);
if (endBIdx === -1) fail("section hebergement : fermeture </Section> introuvable.");
const endB = endBIdx + endMarkerA.length;

const oldHebergementBlock = text.slice(startB, endB);
if (!oldHebergementBlock.includes("Vercel Inc.") || !oldHebergementBlock.includes("Supabase Inc.")) {
  fail("section hebergement : contenu inattendu (Vercel/Supabase introuvables dans le bloc repere).");
}

const newHebergementBlock = [
  '<Section id="hebergement" title="Hébergement">',
  '          <ul className="list-disc pl-5 space-y-2">',
  '            <li><strong>Vercel Inc.</strong> — hébergement du site. Données hébergées à Dublin, Irlande.</li>',
  '            <li><strong>Supabase Inc.</strong> — hébergement de la base de données, de l\'authentification et des fichiers. Données hébergées à Dublin, Irlande.</li>',
  '          </ul>',
  '        </Section>',
].join(EOL);

text = text.slice(0, startB) + newHebergementBlock + text.slice(endB);
console.log("OK repere : section \"Hebergement\" mise a jour");

// ------------------------------------------------------------
// Garde-fous finaux
// ------------------------------------------------------------
if (countSubstring(text, "<Todo>") !== 0) {
  fail(`garde-fou final : il reste ${countSubstring(text, "<Todo>")} balise(s) <Todo> non attendue(s) dans le fichier.`);
}
if (countSubstring(text, "821 828 183 00011") !== 1) fail("garde-fou final : le numero SIRET est absent.");
if (countSubstring(text, "bagues.mandala@proton.me") !== 1) fail("garde-fou final : l'adresse de contact est absente.");
if (countSubstring(text, "Vercel Inc.") !== 1) fail("garde-fou final : Vercel Inc. absent ou en double.");
if (countSubstring(text, "Supabase Inc.") !== 1) fail("garde-fou final : Supabase Inc. absent ou en double.");
if (countSubstring(text, 'id="propriete"') !== 1) fail("garde-fou final : la section propriete intellectuelle a disparu (ne doit pas etre touchee).");
if (countSubstring(text, "logo-facture.png") !== 1) fail("garde-fou final : le logo a disparu.");
console.log("OK garde-fou : plus aucun <Todo>, SIRET/contact/hebergeurs presents, propriete intellectuelle et logo intacts");

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
console.log("  - \"Qui edite ce site ?\" : SIRET, contact, TVA renseignes (plus de <Todo>)");
console.log("  - \"Hebergement\" : Vercel et Supabase, localisation Dublin, Irlande");

if (dryRun) {
  console.log("");
  console.log("VERIFICATION SEULE : aucun fichier modifie.");
} else {
  fs.writeFileSync(file, text, "utf8");
  console.log("");
  console.log(`Fichier modifie : ${path.relative(process.cwd(), file)}`);
}