// scripts/add-shipping-collection.mjs
//
// Active, dans la session Stripe Checkout (pages/api/checkout.js), la
// collecte obligatoire de l'adresse de livraison (France) et du numero de
// telephone, AVANT le paiement.
//
// Pourquoi : sans ces deux parametres, Stripe ne demande ni adresse ni
// telephone a la cliente. Le webhook (pages/api/webhooks/stripe.js) lit
// deja session.customer_details.address et .phone, mais ces champs
// restent vides tant que Stripe ne les collecte pas lui-meme. Resultat
// observe : les colonnes shipping_* de la table orders restent a NULL
// pour toutes les commandes passees jusqu'ici.
//
// Ce script ajoute seulement 2 lignes dans l'objet sessionParams deja
// existant, sans toucher au reste (calcul des totaux, code promo, etc.).
//
// Garanties : verifie le repere exact avant d'ecrire, n'ecrit rien si le
// repere manque ou si c'est deja en place, conserve les fins de ligne du
// fichier, peut etre relance sans effet.
//
// Usage : node scripts/add-shipping-collection.mjs

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

if (raw.includes("shipping_address_collection")) {
  console.log("✓ Rien à modifier : la collecte d'adresse et de téléphone est déjà en place.");
  process.exit(0);
}

const needle =
  '    const sessionParams = {' + eol +
  '      mode: "payment",' + eol +
  '      line_items: stripeLineItems,' + eol +
  '      success_url: `${origin}/?paiement=succes&session_id={CHECKOUT_SESSION_ID}`,' + eol +
  '      cancel_url: `${origin}/?paiement=annule`,' + eol +
  '      metadata: {';

if (!raw.includes(needle)) {
  console.error("✗ 1 repère à adapter — aucun fichier n'a été modifié.\n");
  console.error("  • début du bloc « sessionParams » attendu, introuvable tel quel dans pages/api/checkout.js");
  console.error("\nVérifiez le contenu actuel du fichier et collez-moi les lignes concernées.");
  process.exit(1);
}

const replacement =
  '    const sessionParams = {' + eol +
  '      mode: "payment",' + eol +
  '      line_items: stripeLineItems,' + eol +
  '      success_url: `${origin}/?paiement=succes&session_id={CHECKOUT_SESSION_ID}`,' + eol +
  '      cancel_url: `${origin}/?paiement=annule`,' + eol +
  '      shipping_address_collection: { allowed_countries: ["FR"] },' + eol +
  '      phone_number_collection: { enabled: true },' + eol +
  '      metadata: {';

const updated = raw.replace(needle, replacement);
fs.writeFileSync(filePath, updated, "utf8");

console.log(`✓ ${filePath} : collecte d'adresse de livraison (France) et de téléphone activées.`);
console.log("\nTerminé.");
