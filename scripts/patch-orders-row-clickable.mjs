// scripts/patch-orders-row-clickable.mjs
//
// Rend toute la ligne du tableau "Commandes" cliquable pour ouvrir le
// detail (solution C demandee : surbrillance au survol + ligne entiere
// cliquable, pas seulement le lien "Voir le detail").
//
//   - La <tr> recoit onClick (ouvre/ferme le detail) + hover:bg-[#faf6f8]
//     cursor-pointer transition, pour signaler visuellement qu'elle est
//     cliquable.
//   - Le bouton "Voir le detail"/"Masquer" reste fonctionnel mais son
//     onClick appelle desormais e.stopPropagation() avant de changer
//     l'etat, pour eviter un double traitement (clic sur le bouton ET sur
//     la ligne en meme temps).
//   - Rien ne change sur la selection de texte (copier un e-mail reste
//     possible normalement, un simple clic de selection ne declenche pas
//     de navigation).
//
// Garanties : verifie les reperes exacts avant d'ecrire, n'ecrit rien si
// un seul manque, conserve les fins de ligne du fichier, peut etre
// relance sans effet.
//
// Usage : node scripts/patch-orders-row-clickable.mjs

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

if (raw.includes("orders-row-clickable")) {
  console.log("✓ Rien à modifier : la ligne cliquable est déjà en place.");
  process.exit(0);
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

const anchors = {
  trRow:
    '                <tr className="border-t border-[#eee2e5]" data-testid="orders-row">',
  button:
    "                    <button" + eol +
    '                      type="button"' + eol +
    "                      onClick={() => setOpenOrderId(openOrderId === o.id ? null : o.id)}" + eol +
    '                      className="text-xs text-[#8f6075] underline"' + eol +
    "                    >" + eol +
    '                      {openOrderId === o.id ? "Masquer" : "Voir le détail"}' + eol +
    "                    </button>",
};

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
  console.error("\nVérifiez le contenu actuel de components/AdminCrm.js et collez-moi les lignes concernées.");
  process.exit(1);
}

let out = raw;

// 1) La <tr> devient cliquable, avec surbrillance au survol
out = out.replace(
  anchors.trRow,
  "                <tr" + eol +
    '                  className="border-t border-[#eee2e5] hover:bg-[#faf6f8] cursor-pointer transition"' + eol +
    '                  data-testid="orders-row"' + eol +
    "                  onClick={() => setOpenOrderId(openOrderId === o.id ? null : o.id)}" + eol +
    "                >"
);

// 2) Le bouton stoppe la propagation, pour ne pas déclencher deux fois
out = out.replace(
  anchors.button,
  "                    <button" + eol +
    '                      type="button"' + eol +
    "                      onClick={(e) => { e.stopPropagation(); setOpenOrderId(openOrderId === o.id ? null : o.id); }}" + eol +
    '                      className="text-xs text-[#8f6075] underline"' + eol +
    '                      data-testid="orders-row-clickable"' + eol +
    "                    >" + eol +
    '                      {openOrderId === o.id ? "Masquer" : "Voir le détail"}' + eol +
    "                    </button>"
);

fs.writeFileSync(filePath, out, "utf8");

console.log(`✓ ${filePath} : ligne de commande entièrement cliquable`);
console.log("  • <tr> cliquable, surbrillance au survol (hover:bg-[#faf6f8])");
console.log("  • bouton « Voir le détail » conservé, sans double-déclenchement (stopPropagation)");
console.log("\nTerminé.");
