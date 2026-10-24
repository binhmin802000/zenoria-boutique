// ZENORIA - Lot 4A-2 (panier) + 4A-4 partiel (compteur accueil)
// ============================================================
// Ce script modifie UNIQUEMENT pages/index.js, et seulement si TOUS
// les contrôles ci-dessous réussissent. Si un seul échoue, AUCUNE
// écriture n'est faite (tout ou rien).
//
// Chantier A — Panier : pour une pièce unique (p.isUnique === true),
//   remplace les boutons +/- par un texte fixe "Pièce unique · 1 exemplaire".
//   Pour une bague classique, le comportement est strictement inchangé.
//
// Chantier B — Accueil : remplace "X collections ·" par "X bijoux ·"
//   (ou "1 bijou ·" au singulier), sans toucher au fallback du pied de
//   page ("Collections") ni aux compteurs de saisons ("X créations").
//
// Prérequis vérifié (non modifié) : mapDbProduct doit déjà contenir
//   "isUnique: row.is_unique === true," — sinon le script s'arrête.
//
// Usage :
//   node scripts/patch-piece-unique-panier-compteur.mjs --dry-run
//   node scripts/patch-piece-unique-panier-compteur.mjs --apply
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
  console.error("Lancez ce script depuis la racine du projet (dossier zenoria).");
  process.exit(1);
}

const original = fs.readFileSync(file, "utf8");
const hasCRLF = /\r\n/.test(original);
const EOL = hasCRLF ? "\r\n" : "\n";

function countSubstring(haystack, needle) {
  let count = 0, pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

function fail(message) {
  console.error(`ECHEC : ${message}`);
  console.error("Aucune modification n'a ete ecrite.");
  process.exit(1);
}

// ------------------------------------------------------------
// Contrôle préalable : isUnique doit déjà exister dans mapDbProduct
// ------------------------------------------------------------
const ISUNIQUE_MARKER = "isUnique: row.is_unique === true,";
const isUniqueCount = countSubstring(original, ISUNIQUE_MARKER);
if (isUniqueCount !== 1) {
  fail(
    `prerequis "isUnique" : attendu 1 occurrence de ${JSON.stringify(ISUNIQUE_MARKER)}, trouve ${isUniqueCount}. ` +
    "Ce chantier suppose que mapDbProduct() expose deja p.isUnique."
  );
}
console.log("OK prerequis : isUnique present dans mapDbProduct (1 occurrence)");

// ------------------------------------------------------------
// Chantier A — Panier : localiser le bloc +/- par son contenu
// ------------------------------------------------------------
const lines = original.split(/\r\n|\n/);

const DIV_OPEN = '<div className="flex items-center rounded-full border border-[#d9c5cc]">';
const matchingOpenIndexes = [];
lines.forEach((l, i) => {
  if (l.trim() === DIV_OPEN) matchingOpenIndexes.push(i);
});
if (matchingOpenIndexes.length !== 1) {
  fail(
    `bloc quantite panier : attendu 1 ligne egale a ${JSON.stringify(DIV_OPEN)} (apres trim), trouve ${matchingOpenIndexes.length}.`
  );
}
const openIdx = matchingOpenIndexes[0];
console.log(`OK repere : ouverture du bloc quantite trouvee (ligne ${openIdx + 1})`);

// Cherche la fermeture correspondante : premiere ligne "</div>" seule
// apres l'ouverture, dans une fenetre raisonnable (ce bloc ne contient
// pas d'autre <div> imbrique).
const MAX_WINDOW = 20;
let closeIdx = -1;
for (let i = openIdx + 1; i < Math.min(lines.length, openIdx + 1 + MAX_WINDOW); i++) {
  if (lines[i].trim() === "</div>") {
    closeIdx = i;
    break;
  }
}
if (closeIdx === -1) {
  fail(`bloc quantite panier : fermeture "</div>" introuvable dans les ${MAX_WINDOW} lignes suivant la ligne ${openIdx + 1}.`);
}
console.log(`OK repere : fermeture du bloc quantite trouvee (ligne ${closeIdx + 1})`);

// Sanity check : on verifie que ce bloc contient bien les boutons attendus,
// pour etre certain de ne pas s'etre trompe d'endroit.
const innerBlock = lines.slice(openIdx, closeIdx + 1).join("\n");
const requiredPieces = [
  "changeQty(p, -1)",
  "changeQty(p, 1)",
  "qty <= 1",
  "<Minus",
  "<Plus",
];
const missingPieces = requiredPieces.filter((piece) => !innerBlock.includes(piece));
if (missingPieces.length > 0) {
  fail(`bloc quantite panier : contenu inattendu, elements manquants : ${missingPieces.join(", ")}.`);
}
console.log("OK verification : le bloc contient bien les boutons +/- attendus (changeQty, Minus, Plus)");

// Construction du remplacement : on enveloppe le bloc original (inchange)
// dans une condition ternaire. Pour une piece unique, un texte fixe
// remplace les boutons. Pour une bague classique, rien ne change.
const indentMatch = lines[openIdx].match(/^(\s*)/);
const indent = indentMatch ? indentMatch[1] : "";

const openWrapper = [
  `${indent}{p.isUnique === true ? (`,
  `${indent}  <span className="text-xs text-[#8b737e]">Pièce unique · 1 exemplaire</span>`,
  `${indent}) : (`,
];
const closeWrapper = [`${indent})}`];

const newLines = [
  ...lines.slice(0, openIdx),
  ...openWrapper,
  ...lines.slice(openIdx, closeIdx + 1),
  ...closeWrapper,
  ...lines.slice(closeIdx + 1),
];

let text = newLines.join(EOL);

// ------------------------------------------------------------
// Chantier B — Accueil : compteur "collections" -> "bijoux"
// ------------------------------------------------------------
const COUNTER_OLD = "`${products.length} collections · `";
const COUNTER_NEW = '`${products.length} ${products.length > 1 ? "bijoux" : "bijou"} · `';

const counterCount = countSubstring(text, COUNTER_OLD);
if (counterCount !== 1) {
  fail(
    `compteur accueil : attendu 1 occurrence de ${JSON.stringify(COUNTER_OLD)}, trouve ${counterCount}. ` +
    "Verifiez que le texte n'a pas deja ete modifie."
  );
}
text = text.split(COUNTER_OLD).join(COUNTER_NEW);
console.log("OK repere : compteur accueil localise et remplace (collections -> bijoux/bijou)");

// ------------------------------------------------------------
// Garde-fou final : le fallback du pied de page "Collections" et les
// compteurs de saisons "X creation(s)" ne doivent JAMAIS etre touches.
// ------------------------------------------------------------
if (countSubstring(text, "<p>Collections</p>") !== 1) {
  fail("garde-fou : le fallback du pied de page <p>Collections</p> a disparu ou est en double. Abandon par precaution.");
}
if (countSubstring(text, 'création{filteredProducts.length > 1 ? "s" : ""}') !== 1) {
  fail("garde-fou : le compteur de creations du catalogue a ete modifie par erreur. Abandon par precaution.");
}
console.log("OK garde-fou : pied de page et compteurs de saisons intacts");

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
console.log("  - Panier : boutons +/- masques pour une piece unique (texte fixe a la place)");
console.log("  - Accueil : compteur \"X collections\" -> \"X bijoux\" / \"1 bijou\"");

if (dryRun) {
  console.log("");
  console.log("VERIFICATION SEULE : aucun fichier modifie.");
} else {
  fs.writeFileSync(file, text, "utf8");
  console.log("");
  console.log(`Fichier modifie : ${path.relative(process.cwd(), file)}`);
}
