// scripts/fix-cart-density-shipping-banner.mjs
//
// Corrige une regression du calcul de densite du panier (pickCartDensity) :
// le bandeau "Plus que X € pour la livraison offerte" (avec sa barre de
// progression), affiche uniquement quand le panier n'atteint pas encore
// le seuil de livraison offerte (!totals.freeShipping), n'a jamais ete
// pris en compte dans extraHeight. Resultat observe : la liste des
// articles se retrouve a nouveau tronquee quand ce bandeau est visible.
//
// Ce script ajoute (!totals.freeShipping ? 44 : 0) au calcul existant,
// selon la meme convention deja utilisee pour les autres blocs
// conditionnels d'une ligne (promoOpen, cartNotice).
//
// Garanties : verifie le repere exact avant d'ecrire, n'ecrit rien si le
// repere manque ou si c'est deja en place, conserve les fins de ligne du
// fichier, peut etre relance sans effet.
//
// Usage : node scripts/fix-cart-density-shipping-banner.mjs

import fs from "node:fs";
import path from "node:path";

const filePath = path.join("pages", "index.js");

if (!fs.existsSync(filePath)) {
  console.error(`✗ Fichier introuvable : ${filePath}`);
  console.error("Lancez cette commande depuis le dossier « zenoria ».");
  process.exit(1);
}

const raw = fs.readFileSync(filePath, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";

if (raw.includes("!totals.freeShipping ? 44 : 0")) {
  console.log("✓ Rien à modifier : le bandeau de livraison offerte est déjà pris en compte dans pickCartDensity.");
  process.exit(0);
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

const needle =
  "  const cartDensity = pickCartDensity(" + eol +
  "    cartLines.length," + eol +
  "    viewportH," + eol +
  '    (promoOpen && !promo ? 44 : 0) + (cartNotice ? 44 : 0) + (quizReturn ? 56 : 0) + (!user ? 24 : 0) + 44' + eol +
  "  );";

const count = countOccurrences(raw, needle);
if (count !== 1) {
  console.error("✗ 1 repère à adapter — aucun fichier n'a été modifié.\n");
  console.error(`  • appel à pickCartDensity() attendu, ${count} correspondance(s) trouvée(s), 1 attendue`);
  console.error("\nVérifiez le contenu actuel de pages/index.js et collez-moi les lignes concernées.");
  process.exit(1);
}

const replacement =
  "  const cartDensity = pickCartDensity(" + eol +
  "    cartLines.length," + eol +
  "    viewportH," + eol +
  '    (promoOpen && !promo ? 44 : 0) + (cartNotice ? 44 : 0) + (quizReturn ? 56 : 0) + (!user ? 24 : 0) + 44 + (!totals.freeShipping ? 44 : 0)' + eol +
  "  );";

const out = raw.replace(needle, replacement);
fs.writeFileSync(filePath, out, "utf8");

console.log(`✓ ${filePath} : bandeau de livraison offerte ajouté au calcul de densité du panier.`);
console.log("\nTerminé.");
