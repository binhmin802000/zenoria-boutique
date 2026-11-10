#!/usr/bin/env node
// ============================================================
// patch-account-menu-close-prop.mjs
// ZENORIA_ACCOUNT_MENU_CLOSE_PROP_V1
//
// Ajoute, dans pages/index.js, la prop onAccountMenuClose sur l'appel
// <SiteHeader ...>, pour activer la fermeture automatique du menu compte
// au clic en dehors (deja implementee dans components/SiteHeader.js par
// le patch ZENORIA_ACCOUNT_MENU_OUTSIDE_CLICK_V1, qui doit etre applique
// AVANT celui-ci).
//
// Sans cette prop, le mecanisme de fermeture automatique reste present
// dans le composant mais INACTIF (aucune erreur, juste sans effet).
//
// Usage : node scripts/patch-account-menu-close-prop.mjs
// Idempotent : si deja applique, ne fait rien. Si l'ancre ne correspond
// pas EXACTEMENT, le script s'arrete SANS RIEN ECRIRE.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_ACCOUNT_MENU_CLOSE_PROP_V1";
const FILE = path.join(process.cwd(), "pages", "index.js");

function fail(message) {
  console.error(`[patch-account-menu-close-prop] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(FILE)) fail(`fichier introuvable : ${FILE} (lancez le script depuis la racine du projet)`);

const original = fs.readFileSync(FILE, "utf8");
if (original.includes(MARK)) {
  console.log("[patch-account-menu-close-prop] déjà appliqué, rien à faire.");
  process.exit(0);
}

const usesCRLF = original.includes("\r\n");
const content = original.replace(/\r\n/g, "\n");

const FROM =
  '        accountMenuOpen={accountMenuOpen}\n' +
  '        onAccountClick={() => {\n' +
  '          if (user) {\n' +
  '            setAccountMenuOpen(!accountMenuOpen);\n' +
  '          } else {\n' +
  '            setAuthModalOpen(true);\n' +
  '          }\n' +
  '        }}\n';

const TO =
  '        accountMenuOpen={accountMenuOpen}\n' +
  '        onAccountClick={() => {\n' +
  '          if (user) {\n' +
  '            setAccountMenuOpen(!accountMenuOpen);\n' +
  '          } else {\n' +
  '            setAuthModalOpen(true);\n' +
  '          }\n' +
  '        }}\n' +
  '        onAccountMenuClose={() => setAccountMenuOpen(false)} // ' + MARK + ' : ferme le menu au clic en dehors\n';

const count = content.split(FROM).length - 1;
if (count !== 1) {
  fail(
    `ancre introuvable (ou en double) : trouvée ${count} fois au lieu de 1. ` +
    `Fichier modifié depuis, ou texte différent de ce qui a été vérifié. Rien n'a été écrit. ` +
    `Envoyez le texte exact autour de "accountMenuOpen={accountMenuOpen}" pour corriger l'ancre.`
  );
}

const updated = content.replace(FROM, () => TO);

if (!updated.includes(MARK)) fail("contrôle final : le marqueur est absent après patch.");
if ((updated.match(/onAccountMenuClose=/g) || []).length !== 1) {
  fail("contrôle final : onAccountMenuClose= devrait apparaître exactement 1 fois après patch.");
}

fs.writeFileSync(FILE, usesCRLF ? updated.replace(/\n/g, "\r\n") : updated, "utf8");

console.log("[patch-account-menu-close-prop] pages/index.js mis à jour :");
console.log("[patch-account-menu-close-prop]   - onAccountMenuClose={() => setAccountMenuOpen(false)} ajouté sur <SiteHeader ...>");
console.log("[patch-account-menu-close-prop] La fermeture automatique du menu compte au clic extérieur est maintenant active.");
