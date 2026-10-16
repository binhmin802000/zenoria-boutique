// scripts/fix-checkout-payment-methods.mjs
//
// Corrige pages/api/checkout.js : Stripe n'accepte plus le parametre
// "payment_method_types" a la creation d'une session Checkout (il est
// devenu obsolete ; les moyens de paiement se gerent desormais depuis le
// Dashboard Stripe > Settings > Payment methods). Ce script retire
// uniquement cette ligne, sans toucher au reste du fichier.
//
// Erreur rencontree (journalisee par Vercel) :
//   "The `payment_method_types` parameter is no longer supported when
//   creating a Checkout Session. Payment methods are now managed from
//   your Dashboard settings."
//
// Garanties : verifie le repere exact avant d'ecrire, n'ecrit rien si le
// repere manque ou si c'est deja corrige, conserve les fins de ligne du
// fichier, peut etre relance sans effet.
//
// Usage : node scripts/fix-checkout-payment-methods.mjs

import fs from "node:fs";
import path from "node:path";

const filePath = path.join("pages", "api", "checkout.js");

if (!fs.existsSync(filePath)) {
  console.error(`✗ Fichier introuvable : ${filePath}`);
  console.error("Lancez cette commande depuis le dossier « zenoria ».");
  process.exit(1);
}

const raw = fs.readFileSync(filePath, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";

if (!raw.includes("payment_method_types")) {
  console.log("✓ Rien à modifier : « payment_method_types » n'est déjà plus présent.");
  process.exit(0);
}

const needle = '      payment_method_types: ["card"],' + eol;

if (!raw.includes(needle)) {
  console.error("✗ 1 repère à adapter — aucun fichier n'a été modifié.\n");
  console.error('  • ligne « payment_method_types: ["card"], » attendue, introuvable telle quelle');
  console.error("\nVérifiez le contenu actuel du fichier et collez-moi les lignes concernées.");
  process.exit(1);
}

const updated = raw.replace(needle, "");
fs.writeFileSync(filePath, updated, "utf8");

console.log(`✓ ${filePath} : ligne « payment_method_types » retirée.`);
console.log("\nTerminé. Stripe choisira désormais les moyens de paiement depuis votre Dashboard.");
