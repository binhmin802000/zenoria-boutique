// scripts/add-checkout-order-metadata.mjs
//
// Complete les metadata de la session Stripe Checkout (pages/api/checkout.js)
// avec le detail du panier (identifiants, noms, prix, quantites) et les
// totaux deja calcules. Ces metadata seront relues par le webhook
// (pages/api/webhooks/stripe.js) pour reconstituer fidelement la commande
// dans order_items, sans jamais re-interroger la base au moment du
// paiement (le webhook doit rester simple et rapide).
//
// Garanties : verifie le repere exact avant d'ecrire, n'ecrit rien si le
// repere manque ou si c'est deja en place, conserve les fins de ligne du
// fichier, peut etre relance sans effet.
//
// Usage : node scripts/add-checkout-order-metadata.mjs

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

if (raw.includes("cart_items:")) {
  console.log("✓ Rien à modifier : les métadonnées de commande sont déjà en place.");
  process.exit(0);
}

const needle =
  "      metadata: {" + eol +
  '        promo_code: normalizedPromoCode || "",' + eol +
  "      },";

if (!raw.includes(needle)) {
  console.error("✗ 1 repère à adapter — aucun fichier n'a été modifié.\n");
  console.error("  • bloc « metadata: { promo_code: ... } » attendu, introuvable tel quel");
  console.error("\nVérifiez le contenu actuel de pages/api/checkout.js et collez-moi les lignes concernées.");
  process.exit(1);
}

const replacement =
  "      metadata: {" + eol +
  '        promo_code: normalizedPromoCode || "",' + eol +
  "        cart_items: JSON.stringify(" + eol +
  "          lines.map((l) => ({ id: l.product.id, name: l.product.name, price: effectivePrice(l.product), qty: l.qty }))" + eol +
  "        )," + eol +
  "        subtotal: String(totals.subtotal)," + eol +
  "        discount: String(totals.discount)," + eol +
  "        shipping: String(totals.shipping)," + eol +
  "        total: String(totals.total)," + eol +
  "      },";

const updated = raw.replace(needle, replacement);
fs.writeFileSync(filePath, updated, "utf8");

console.log(`✓ ${filePath} : métadonnées de commande (cart_items, totaux) ajoutées.`);
console.log("\nTerminé.");
