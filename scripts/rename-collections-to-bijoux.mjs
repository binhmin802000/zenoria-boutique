// scripts/rename-collections-to-bijoux.mjs
//
// Renomme l'etiquette affichee "Collections" en "Bijoux", a deux
// endroits precis :
//   1. lib/adminNav.js : le libelle de l'onglet admin (groupe Produits).
//   2. pages/index.js  : le lien de navigation du site public (desktop
//      ET mobile), juste avant "Les saisons".
//
// IMPORTANT : seul le TEXTE AFFICHE change. L'identifiant technique
// "collections" (utilise par scrollToSection("collections"), l'id de la
// section HTML, et l'id de l'onglet admin "collections") reste
// STRICTEMENT INCHANGE partout - renommer l'identifiant casserait le
// defilement de la page et le routage de l'admin (#produits/collections).
//
// Garanties : verifie TOUS les reperes avant d'ecrire quoi que ce soit ;
// n'ecrit rien si un seul manque ; liste tous les reperes manquants ;
// conserve les fins de ligne de chaque fichier ; peut etre relance sans
// effet.
//
// Usage : node scripts/rename-collections-to-bijoux.mjs

import fs from "node:fs";
import path from "node:path";

const adminNavPath = path.join("lib", "adminNav.js");
const indexPath = path.join("pages", "index.js");

for (const f of [adminNavPath, indexPath]) {
  if (!fs.existsSync(f)) {
    console.error(`✗ Fichier introuvable : ${f}`);
    console.error("Lancez cette commande depuis le dossier « zenoria ».");
    process.exit(1);
  }
}

function readFile(p) {
  const raw = fs.readFileSync(p, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  return { raw, eol };
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

const adminNav = readFile(adminNavPath);
const indexJs = readFile(indexPath);

// ---------------------------------------------------------------------
// Idempotence globale
// ---------------------------------------------------------------------
const alreadyDone =
  adminNav.raw.includes('{ id: "collections", label: "Bijoux" }') &&
  indexJs.raw.includes('>Bijoux</button>');

if (alreadyDone) {
  console.log("✓ Rien à modifier : le renommage « Bijoux » est déjà en place.");
  process.exit(0);
}

// ---------------------------------------------------------------------
// Repères
// ---------------------------------------------------------------------
const adminNavNeedle = '      { id: "collections", label: "Collections" },';

const indexDesktopNeedle =
  '            <button onClick={() => scrollToSection("collections")} className="hover:text-[#8f6075]">Collections</button>';

const indexMobileNeedle =
  '            <button onClick={() => { scrollToSection("collections"); setMenu(false); }} className="text-left">Collections</button>';

const missing = [];
if (countOccurrences(adminNav.raw, adminNavNeedle) !== 1) {
  missing.push({ key: "lib/adminNav.js : libellé « Collections »", count: countOccurrences(adminNav.raw, adminNavNeedle) });
}
if (countOccurrences(indexJs.raw, indexDesktopNeedle) !== 1) {
  missing.push({ key: "pages/index.js : lien desktop « Collections »", count: countOccurrences(indexJs.raw, indexDesktopNeedle) });
}
if (countOccurrences(indexJs.raw, indexMobileNeedle) !== 1) {
  missing.push({ key: "pages/index.js : lien mobile « Collections »", count: countOccurrences(indexJs.raw, indexMobileNeedle) });
}

if (missing.length > 0) {
  console.error(`✗ ${missing.length} repère(s) à adapter — aucun fichier n'a été modifié.\n`);
  for (const m of missing) {
    console.error(`  • ${m.key} (${m.count} correspondance(s) trouvée(s), 1 attendue)`);
  }
  console.error("\nVérifiez le contenu actuel des fichiers et collez-moi les lignes concernées.");
  process.exit(1);
}

// ---------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------
const adminNavOut = adminNav.raw.replace(
  adminNavNeedle,
  '      { id: "collections", label: "Bijoux" },'
);
fs.writeFileSync(adminNavPath, adminNavOut, "utf8");

let indexOut = indexJs.raw.replace(
  indexDesktopNeedle,
  '            <button onClick={() => scrollToSection("collections")} className="hover:text-[#8f6075]">Bijoux</button>'
);
indexOut = indexOut.replace(
  indexMobileNeedle,
  '            <button onClick={() => { scrollToSection("collections"); setMenu(false); }} className="text-left">Bijoux</button>'
);
fs.writeFileSync(indexPath, indexOut, "utf8");

console.log(`✓ ${adminNavPath} : libellé de l'onglet admin renommé « Collections » → « Bijoux ».`);
console.log(`✓ ${indexPath} : lien de navigation (desktop + mobile) renommé « Collections » → « Bijoux ».`);
console.log("\nL'identifiant technique « collections » (défilement, routage admin) reste inchangé.");
console.log("\nTerminé.");
