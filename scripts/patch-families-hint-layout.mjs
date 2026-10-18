// scripts/patch-families-hint-layout.mjs
//
// Page Admin > Produits > Familles (components/AdminFamilies.js) :
// deplace le bloc d'aide "Choisissez une famille..." sous le tableau,
// en pleine largeur, au lieu de la colonne de droite dans la grille
// actuelle (grid lg:grid-cols-[1.25fr_1fr]). Objectif : liberer de la
// place pour le tableau quand aucun formulaire n'est ouvert, pour
// supprimer le defilement horizontal.
//
// Comportement conserve a l'identique PENDANT l'edition : quand un
// formulaire est ouvert (form truthy), la disposition a deux colonnes
// (tableau + formulaire cote a cote) reste inchangee. Seul le cas "aucun
// formulaire ouvert" change : le tableau prend alors toute la largeur, et
// le bloc d'aide s'affiche en dessous plutot qu'a droite.
//
// Garanties : verifie TOUS les reperes avant d'ecrire quoi que ce soit ;
// n'ecrit rien si un seul manque ; liste tous les reperes manquants ;
// conserve les fins de ligne du fichier ; peut etre relance sans effet.
//
// Usage : node scripts/patch-families-hint-layout.mjs

import fs from "node:fs";
import path from "node:path";

const filePath = path.join("components", "AdminFamilies.js");

if (!fs.existsSync(filePath)) {
  console.error(`✗ Fichier introuvable : ${filePath}`);
  console.error("Lancez cette commande depuis le dossier « zenoria ».");
  process.exit(1);
}

const raw = fs.readFileSync(filePath, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";

if (raw.includes("{!form && (")) {
  console.log("✓ Rien à modifier : le bloc d'aide est déjà déplacé sous le tableau.");
  process.exit(0);
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

const anchors = {};

anchors.gridOpen =
  '      <div className="grid lg:grid-cols-[1.25fr_1fr] gap-6 items-start">';

anchors.formTernaryOpen = "        {form ? (";

anchors.hintAndGridClose =
  "        ) : (" + eol +
  '          <div className="bg-white rounded-[1.5rem] border border-dashed border-[#e3d3da] p-6 text-sm text-[#8b737e] leading-6" data-testid="family-hint">' + eol +
  "            Choisissez une famille dans la liste pour la modifier, voir ses collections ou en déplacer une. Les saisons alimentent le quiz couleurs : elles se renomment et se décrivent librement, mais ne se suppriment pas." + eol +
  "          </div>" + eol +
  "        )}" + eol +
  "      </div>";

const missing = [];
for (const [key, needle] of Object.entries(anchors)) {
  const count = countOccurrences(raw, needle);
  if (count !== 1) missing.push({ key, count });
}

if (missing.length > 0) {
  console.error(`✗ ${missing.length} repère(s) à adapter — aucun fichier n'a été modifié.\n`);
  for (const m of missing) {
    console.error(`  • repère « ${m.key} » (${m.count} correspondance(s) trouvée(s), 1 attendue)`);
  }
  console.error("\nVérifiez le contenu actuel de components/AdminFamilies.js et collez-moi les lignes concernées.");
  process.exit(1);
}

let out = raw;

// 1) La grille à deux colonnes ne s'applique que si un formulaire est ouvert
out = out.replace(
  anchors.gridOpen,
  '      <div className={form ? "grid lg:grid-cols-[1.25fr_1fr] gap-6 items-start" : ""}>'
);

// 2) Le formulaire reste affiché normalement, mais sans alternative "sinon" à cet endroit
out = out.replace(anchors.formTernaryOpen, "        {form && (");

// 3) Ferme le ternaire devenu un simple "&&", ferme la grille, puis ajoute
//    le bloc d'aide en pleine largeur juste après, uniquement si aucun
//    formulaire n'est ouvert.
out = out.replace(
  anchors.hintAndGridClose,
  "        )}" + eol +
    "      </div>" + eol +
    eol +
    "      {!form && (" + eol +
    '        <div className="mt-6 bg-white rounded-[1.5rem] border border-dashed border-[#e3d3da] p-6 text-sm text-[#8b737e] leading-6" data-testid="family-hint">' + eol +
    "          Choisissez une famille dans la liste pour la modifier, voir ses collections ou en déplacer une. Les saisons alimentent le quiz couleurs : elles se renomment et se décrivent librement, mais ne se suppriment pas." + eol +
    "        </div>" + eol +
    "      )}"
);

fs.writeFileSync(filePath, out, "utf8");

console.log(`✓ ${filePath} : bloc d'aide déplacé sous le tableau`);
console.log("  • grille à deux colonnes active uniquement pendant l'édition (formulaire ouvert)");
console.log("  • tableau en pleine largeur quand aucun formulaire n'est ouvert, plus de défilement horizontal attendu");
console.log("  • bloc d'aide affiché en dessous, en pleine largeur, dans ce même cas");
console.log("\nTerminé.");
