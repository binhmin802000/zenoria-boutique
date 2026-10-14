// patch-tests-delai30.mjs
// Met a jour tests/quizCartReturn.test.mjs : le test attendait encore "5 jours"
// et "Rupture de stock", alors que lib/shopUtils.js utilise "30 jours" et "Epuise"
// depuis l'etape 1 des textes. Corrige les 4 lignes concernees.
//
// Garanties : verifie TOUS les reperes avant d'ecrire, n'ecrit rien si un seul
// manque, liste les reperes manquants avec un extrait, garde les fins de ligne
// du fichier telles quelles, peut etre relance sans effet.
//
// Usage : node patch-tests-delai30.mjs

import fs from "node:fs";
import path from "node:path";

const file = path.join("tests", "quizCartReturn.test.mjs");

if (!fs.existsSync(file)) {
  console.error(`✗ Fichier introuvable : ${file}`);
  console.error("Lancez cette commande depuis le dossier « zenoria ».");
  process.exit(1);
}

const content = fs.readFileSync(file, "utf8");

// Chaque remplacement cible une ligne complete (ou quasi complete), ce qui
// rend le repere peu ambigu dans le fichier.
const replacements = [
  {
    label: "délai du BACKORDER_LEAD_TIME (ligne ~81)",
    oldText: `assert.equal(U.BACKORDER_LEAD_TIME, "5 jours");`,
    newText: `assert.equal(U.BACKORDER_LEAD_TIME, "30 jours");`,
  },
  {
    label: "détail « 2 exemplaires » (ligne ~87)",
    oldText: `assert.equal(partial.detail, "2 exemplaires fabriqués sur commande · délai 5 jours");`,
    newText: `assert.equal(partial.detail, "2 exemplaires fabriqués sur commande · délai 30 jours");`,
  },
  {
    label: "détail « 1 exemplaire » (ligne ~88)",
    oldText: `assert.equal(U.getAvailability({ stock: 3 }, 4).detail, "1 exemplaire fabriqué sur commande · délai 5 jours");`,
    newText: `assert.equal(U.getAvailability({ stock: 3 }, 4).detail, "1 exemplaire fabriqué sur commande · délai 30 jours");`,
  },
  {
    label: "libellé et détail de la rupture (ligne ~90)",
    oldText: `assert.deepEqual([out.state, out.label, out.detail], ["backorder", "Rupture de stock", "Fabriquée sur commande · délai 5 jours"]);`,
    newText: `assert.deepEqual([out.state, out.label, out.detail], ["backorder", "Épuisé", "Fabriquée sur commande · délai 30 jours"]);`,
  },
];

const missing = [];
const alreadyDone = [];
const toApply = [];

for (const r of replacements) {
  if (content.includes(r.oldText)) {
    toApply.push(r);
  } else if (content.includes(r.newText)) {
    alreadyDone.push(r);
  } else {
    missing.push(r);
  }
}

if (missing.length > 0) {
  console.error(`✗ ${missing.length} repère(s) à adapter — aucun fichier n'a été modifié.\n`);
  for (const r of missing) {
    console.error(`  • ${r.label}`);
    console.error(`    Repère attendu : ${r.oldText}`);
  }
  console.error("\nVérifiez le contenu actuel du fichier et dites-le-moi.");
  process.exit(1);
}

if (toApply.length === 0) {
  console.log("✓ Rien à modifier : les 4 lignes sont déjà à jour (30 jours / Épuisé).");
  process.exit(0);
}

let updated = content;
for (const r of toApply) {
  updated = updated.replace(r.oldText, r.newText);
}

fs.writeFileSync(file, updated, "utf8");

console.log(`✓ ${file} : ${toApply.length} modification(s)`);
for (const r of toApply) {
  console.log(`  • ${r.label}`);
}
if (alreadyDone.length > 0) {
  console.log(`(${alreadyDone.length} ligne(s) étaient déjà à jour, non touchées.)`);
}
console.log("\nTerminé.");
