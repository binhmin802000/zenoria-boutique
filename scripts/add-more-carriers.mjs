// scripts/add-more-carriers.mjs
//
// Ajoute "DPD" et "Colis Privé" a la liste des transporteurs disponibles
// dans le bloc Expedition (components/AdminCrm.js), en plus des 3 deja
// en place (Colissimo, Mondial Relay, Chronopost). Liste codee en dur,
// aucune base de donnees a modifier.
//
// Garanties : verifie le repere exact avant d'ecrire, n'ecrit rien si le
// repere manque ou si c'est deja en place, conserve les fins de ligne du
// fichier, peut etre relance sans effet.
//
// Usage : node scripts/add-more-carriers.mjs

import fs from "node:fs";
import path from "node:path";

const filePath = path.join("components", "AdminCrm.js");

if (!fs.existsSync(filePath)) {
  console.error(`✗ Fichier introuvable : ${filePath}`);
  console.error("Lancez cette commande depuis le dossier « zenoria ».");
  process.exit(1);
}

const raw = fs.readFileSync(filePath, "utf8");

if (raw.includes('"DPD"') && raw.includes('"Colis Privé"')) {
  console.log("✓ Rien à modifier : DPD et Colis Privé sont déjà dans la liste des transporteurs.");
  process.exit(0);
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

const needle = '  const CARRIERS = ["Colissimo", "Mondial Relay", "Chronopost"];';

const count = countOccurrences(raw, needle);
if (count !== 1) {
  console.error("✗ 1 repère à adapter — aucun fichier n'a été modifié.\n");
  console.error(`  • ligne « const CARRIERS = [...] » attendue, ${count} correspondance(s) trouvée(s), 1 attendue`);
  console.error("\nVérifiez le contenu actuel de components/AdminCrm.js et collez-moi les lignes concernées.");
  process.exit(1);
}

const replacement = '  const CARRIERS = ["Colissimo", "Mondial Relay", "Chronopost", "DPD", "Colis Privé"];';

const out = raw.replace(needle, replacement);
fs.writeFileSync(filePath, out, "utf8");

console.log(`✓ ${filePath} : DPD et Colis Privé ajoutés à la liste des transporteurs.`);
console.log("\nTerminé.");
