// scripts/patch-admin-expired-badge.mjs
//
// Ajoute le statut "expired" dans ORDER_STATUS_LABELS (components/AdminCrm.js),
// pour qu'il affiche un badge distinct ("Expirée", gris) dans /admin >
// Commandes, plutot que de retomber sur le badge generique.
//
// Garanties : verifie le repere exact avant d'ecrire, n'ecrit rien si le
// repere manque ou si c'est deja en place, conserve les fins de ligne du
// fichier, peut etre relance sans effet.
//
// Usage : node scripts/patch-admin-expired-badge.mjs

import fs from "node:fs";
import path from "node:path";

const filePath = path.join("components", "AdminCrm.js");

if (!fs.existsSync(filePath)) {
  console.error(`✗ Fichier introuvable : ${filePath}`);
  console.error("Lancez cette commande depuis le dossier « zenoria ».");
  process.exit(1);
}

const raw = fs.readFileSync(filePath, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";

if (raw.includes('expired: { label: "Expirée"')) {
  console.log("✓ Rien à modifier : le badge « Expirée » est déjà en place.");
  process.exit(0);
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

const needle =
  "const ORDER_STATUS_LABELS = {" + eol +
  '  pending: { label: "En attente", className: "bg-amber-50 text-amber-700" },' + eol +
  '  paid: { label: "Payée", className: "bg-emerald-50 text-emerald-700" },' + eol +
  '  shipped: { label: "Expédiée", className: "bg-sky-50 text-sky-700" },' + eol +
  '  cancelled: { label: "Annulée", className: "bg-red-50 text-red-700" },' + eol +
  '  refunded: { label: "Remboursée", className: "bg-[#f5edf1] text-[#8f6075]" },' + eol +
  "};";

const count = countOccurrences(raw, needle);
if (count !== 1) {
  console.error("✗ 1 repère à adapter — aucun fichier n'a été modifié.\n");
  console.error(`  • bloc ORDER_STATUS_LABELS attendu, ${count} correspondance(s) trouvée(s), 1 attendue`);
  console.error("\nVérifiez le contenu actuel de components/AdminCrm.js et collez-moi les lignes concernées.");
  process.exit(1);
}

const replacement =
  "const ORDER_STATUS_LABELS = {" + eol +
  '  pending: { label: "En attente", className: "bg-amber-50 text-amber-700" },' + eol +
  '  paid: { label: "Payée", className: "bg-emerald-50 text-emerald-700" },' + eol +
  '  shipped: { label: "Expédiée", className: "bg-sky-50 text-sky-700" },' + eol +
  '  cancelled: { label: "Annulée", className: "bg-red-50 text-red-700" },' + eol +
  '  refunded: { label: "Remboursée", className: "bg-[#f5edf1] text-[#8f6075]" },' + eol +
  '  expired: { label: "Expirée", className: "bg-gray-100 text-gray-500" },' + eol +
  "};";

const out = raw.replace(needle, replacement);
fs.writeFileSync(filePath, out, "utf8");

console.log(`✓ ${filePath} : badge « Expirée » ajouté pour le statut expired.`);
console.log("\nTerminé.");
