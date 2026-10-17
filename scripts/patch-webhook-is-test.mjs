// scripts/patch-webhook-is-test.mjs
//
// Ajoute, dans pages/api/webhooks/stripe.js, le renseignement de la
// colonne orders.is_test a partir de event.livemode, fourni directement
// par Stripe (false en mode test, true en mode reel). Aucune deduction de
// notre part : on fait confiance a l'information que Stripe donne
// lui-meme sur chaque evenement.
//
// Prerequis : la colonne orders.is_test doit deja exister (voir
// supabase_orders_is_test.sql).
//
// Garanties : verifie le repere exact avant d'ecrire, n'ecrit rien si le
// repere manque ou si c'est deja en place, conserve les fins de ligne du
// fichier, peut etre relance sans effet.
//
// Usage : node scripts/patch-webhook-is-test.mjs

import fs from "node:fs";
import path from "node:path";

const filePath = path.join("pages", "api", "webhooks", "stripe.js");

if (!fs.existsSync(filePath)) {
  console.error(`✗ Fichier introuvable : ${filePath}`);
  console.error("Lancez cette commande depuis le dossier « zenoria ».");
  process.exit(1);
}

const raw = fs.readFileSync(filePath, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";

if (raw.includes("is_test: event.livemode")) {
  console.log("✓ Rien à modifier : is_test est déjà renseigné dans le webhook.");
  process.exit(0);
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

const needle =
  "        guest_email: customer.email || null," + eol +
  '        status: "paid",';

const count = countOccurrences(raw, needle);
if (count !== 1) {
  console.error("✗ 1 repère à adapter — aucun fichier n'a été modifié.\n");
  console.error(`  • bloc « guest_email / status: "paid" » attendu, ${count} correspondance(s) trouvée(s), 1 attendue`);
  console.error("\nVérifiez le contenu actuel de pages/api/webhooks/stripe.js et collez-moi les lignes concernées.");
  process.exit(1);
}

const replacement =
  "        guest_email: customer.email || null," + eol +
  '        status: "paid",' + eol +
  "        is_test: event.livemode === false,";

const updated = raw.replace(needle, replacement);
fs.writeFileSync(filePath, updated, "utf8");

console.log(`✓ ${filePath} : is_test renseigné automatiquement à partir de event.livemode.`);
console.log("\nTerminé.");
