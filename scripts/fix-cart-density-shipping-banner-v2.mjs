// scripts/fix-cart-density-shipping-banner-v2.mjs
//
// Corrige DEFINITIVEMENT la regression de densite du panier liee au
// bandeau de livraison offerte, apres un premier correctif errone.
//
// Erreur du premier correctif (deja en production) : la condition
// (!totals.freeShipping ? 44 : 0) supposait que le bandeau disparaissait
// une fois le seuil de livraison offerte atteint. FAUX, confirme par le
// code reel (pages/index.js ~ligne 1168) : le bloc est affiche des que
// shippingCfg.enabled est vrai, qu'elle soit atteinte ou non - seul son
// texte et la largeur de sa barre changent. Resultat observe : troncature
// de la liste d'articles meme avec un seul article, des que la livraison
// offerte est active dans l'admin.
//
// Ce bloc contient 3 elements empiles (icone+texte, barre de progression,
// legende), nettement plus haut qu'un badge d'une ligne (44px utilise pour
// promoOpen/cartNotice) : la valeur retenue est 92px (padding du
// conteneur pt-3 pb-2, ligne de texte, marges mt-2/mt-1.5, barre h-1.5,
// legende text-[11px]).
//
// Garanties : verifie le repere exact avant d'ecrire, n'ecrit rien si le
// repere manque ou si c'est deja en place, conserve les fins de ligne du
// fichier, peut etre relance sans effet.
//
// Usage : node scripts/fix-cart-density-shipping-banner-v2.mjs

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

if (raw.includes("shippingCfg.enabled ? 92 : 0")) {
  console.log("✓ Rien à modifier : la correction (v2) est déjà en place.");
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
  '    (promoOpen && !promo ? 44 : 0) + (cartNotice ? 44 : 0) + (quizReturn ? 56 : 0) + (!user ? 24 : 0) + 44 + (!totals.freeShipping ? 44 : 0)' + eol +
  "  );";

const count = countOccurrences(raw, needle);
if (count !== 1) {
  console.error("✗ 1 repère à adapter — aucun fichier n'a été modifié.\n");
  console.error(`  • appel à pickCartDensity() (avec le premier correctif erroné) attendu, ${count} correspondance(s) trouvée(s), 1 attendue`);
  console.error("\nVérifiez le contenu actuel de pages/index.js et collez-moi les lignes concernées.");
  process.exit(1);
}

const replacement =
  "  const cartDensity = pickCartDensity(" + eol +
  "    cartLines.length," + eol +
  "    viewportH," + eol +
  '    (promoOpen && !promo ? 44 : 0) + (cartNotice ? 44 : 0) + (quizReturn ? 56 : 0) + (!user ? 24 : 0) + 44 + (shippingCfg.enabled ? 92 : 0)' + eol +
  "  );";

const out = raw.replace(needle, replacement);
fs.writeFileSync(filePath, out, "utf8");

console.log(`✓ ${filePath} : bandeau de livraison offerte correctement pris en compte (v2).`);
console.log("  • remplace la condition erronée !totals.freeShipping par shippingCfg.enabled (le bloc est toujours affiché si activé, quel que soit le seuil atteint)");
console.log("  • hauteur réservée passée de 44px à 92px (bloc à 3 lignes empilées, pas un simple badge)");
console.log("\nTerminé.");
