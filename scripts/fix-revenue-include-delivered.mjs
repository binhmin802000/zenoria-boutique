// scripts/fix-revenue-include-delivered.mjs
//
// Corrige le calcul du chiffre d'affaires (components/AdminCrm.js,
// AdminOrders) : le filtre ne reconnaissait que les statuts "paid" et
// "shipped" comme ventes comptabilisees. Des qu'une commande passait a
// "delivered" (Phase 3, bouton "Marquer comme livree"), elle sortait du
// calcul et son montant etait SOUSTRAIT du chiffre d'affaires affiche --
// alors qu'une commande livree reste une vente tout aussi reelle qu'une
// commande simplement payee ou expediee.
//
// Ce script ajoute "delivered" a la liste des statuts comptabilises.
//
// Garanties : verifie le repere exact avant d'ecrire, n'ecrit rien si le
// repere manque ou si c'est deja en place, conserve les fins de ligne du
// fichier, peut etre relance sans effet.
//
// Usage : node scripts/fix-revenue-include-delivered.mjs

import fs from "node:fs";
import path from "node:path";

const filePath = path.join("components", "AdminCrm.js");

if (!fs.existsSync(filePath)) {
  console.error(`✗ Fichier introuvable : ${filePath}`);
  console.error("Lancez cette commande depuis le dossier « zenoria ».");
  process.exit(1);
}

const raw = fs.readFileSync(filePath, "utf8");

const TARGET = 'const paid = filteredOrders.filter((o) => o.status === "paid" || o.status === "shipped" || o.status === "delivered");';

if (raw.includes(TARGET)) {
  console.log("✓ Rien à modifier : le chiffre d'affaires inclut déjà les commandes livrées.");
  process.exit(0);
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

const needle = 'const paid = filteredOrders.filter((o) => o.status === "paid" || o.status === "shipped");';

const count = countOccurrences(raw, needle);
if (count !== 1) {
  console.error("✗ 1 repère à adapter — aucun fichier n'a été modifié.\n");
  console.error(`  • ligne « const paid = filteredOrders.filter(...) » attendue, ${count} correspondance(s) trouvée(s), 1 attendue`);
  console.error("\nVérifiez le contenu actuel de components/AdminCrm.js et collez-moi les lignes concernées.");
  process.exit(1);
}

const out = raw.replace(needle, TARGET);
fs.writeFileSync(filePath, out, "utf8");

console.log(`✓ ${filePath} : chiffre d'affaires corrigé — les commandes « delivered » restent comptabilisées.`);
console.log("\nTerminé.");
