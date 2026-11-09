#!/usr/bin/env node
// ============================================================
// patch-remove-search-everywhere.mjs
// ZENORIA_REMOVE_SEARCH_V1
//
// Retire le bouton de recherche (loupe) de TOUTES les pages qui utilisent
// SiteHeader, en changeant la valeur par défaut de la prop showSearch
// (true -> false) dans components/SiteHeader.js.
//
// Le bloc JSX du bouton (et la prop elle-même) ne sont PAS supprimés :
// la loupe reste réversible en un mot (remettre "true") sans avoir à
// retrouver ou réécrire le bloc JSX.
//
// Usage : node scripts/patch-remove-search-everywhere.mjs
// Idempotent : si déjà appliqué, ne fait rien. Si l'ancre ne correspond
// pas EXACTEMENT, le script s'arrête SANS RIEN ÉCRIRE.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_REMOVE_SEARCH_V1";
const FILE = path.join(process.cwd(), "components", "SiteHeader.js");

function fail(message) {
  console.error(`[patch-remove-search-everywhere] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(FILE)) {
  fail(`fichier introuvable : ${FILE} (lancez le script depuis la racine du projet)`);
}

const original = fs.readFileSync(FILE, "utf8");

if (original.includes(MARK)) {
  console.log("[patch-remove-search-everywhere] déjà appliqué, rien à faire.");
  process.exit(0);
}

const usesCRLF = original.includes("\r\n");
const content = original.replace(/\r\n/g, "\n");

const anchor = "  showSearch = true,\n";
const count = content.split(anchor).length - 1;
if (count !== 1) {
  fail(
    `ancre « showSearch = true, » trouvée ${count} fois au lieu de 1 dans components/SiteHeader.js. ` +
    `Fichier modifié depuis, ou texte différent de ce qui a été vérifié. Rien n'a été écrit.`
  );
}

const replacement = `  showSearch = false, // ${MARK} : loupe retiree de toutes les pages (reversible : remettre true)\n`;
const updated = content.replace(anchor, () => replacement);

fs.writeFileSync(FILE, usesCRLF ? updated.replace(/\n/g, "\r\n") : updated, "utf8");

console.log("[patch-remove-search-everywhere] components/SiteHeader.js mis à jour :");
console.log("[patch-remove-search-everywhere]   - showSearch par défaut passé de true à false");
console.log("[patch-remove-search-everywhere] Le bouton de recherche disparaît de toutes les pages qui n'imposent pas showSearch={true} explicitement.");
console.log("[patch-remove-search-everywhere] Réversible : remettre showSearch = true dans components/SiteHeader.js.");
