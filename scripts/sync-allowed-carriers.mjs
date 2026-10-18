// scripts/sync-allowed-carriers.mjs
//
// Synchronise ALLOWED_CARRIERS (pages/api/admin/orders/update-status.js,
// liste de validation cote serveur) avec CARRIERS (components/AdminCrm.js,
// liste affichee dans le menu deroulant du bloc Expedition). Les deux
// listes avaient diverge : CARRIERS avait ete etendue a 5 transporteurs
// (ajout de DPD et Colis Prive), mais ALLOWED_CARRIERS n'avait jamais ete
// mise a jour en consequence, provoquant un rejet 400 ("transporteur
// invalide") des que l'un des deux nouveaux transporteurs etait choisi.
//
// Garanties : verifie le repere exact avant d'ecrire, n'ecrit rien si le
// repere manque ou si c'est deja en place, conserve les fins de ligne du
// fichier, peut etre relance sans effet.
//
// Usage : node scripts/sync-allowed-carriers.mjs

import fs from "node:fs";
import path from "node:path";

const filePath = path.join("pages", "api", "admin", "orders", "update-status.js");

if (!fs.existsSync(filePath)) {
  console.error(`✗ Fichier introuvable : ${filePath}`);
  console.error("Lancez cette commande depuis le dossier « zenoria ».");
  process.exit(1);
}

const raw = fs.readFileSync(filePath, "utf8");

const TARGET = 'const ALLOWED_CARRIERS = ["Colissimo", "Mondial Relay", "Chronopost", "DPD", "Colis Privé"];';

if (raw.includes(TARGET)) {
  console.log("✓ Rien à modifier : ALLOWED_CARRIERS est déjà synchronisée avec CARRIERS.");
  process.exit(0);
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

const needle = 'const ALLOWED_CARRIERS = ["Colissimo", "Mondial Relay", "Chronopost"];';

const count = countOccurrences(raw, needle);
if (count !== 1) {
  console.error("✗ 1 repère à adapter — aucun fichier n'a été modifié.\n");
  console.error(`  • ligne « const ALLOWED_CARRIERS = [...] » attendue, ${count} correspondance(s) trouvée(s), 1 attendue`);
  console.error("\nVérifiez le contenu actuel de pages/api/admin/orders/update-status.js et collez-moi les lignes concernées.");
  process.exit(1);
}

const out = raw.replace(needle, TARGET);
fs.writeFileSync(filePath, out, "utf8");

console.log(`✓ ${filePath} : ALLOWED_CARRIERS synchronisée avec la liste affichée (DPD et Colis Privé ajoutés).`);
console.log("\nTerminé.");
