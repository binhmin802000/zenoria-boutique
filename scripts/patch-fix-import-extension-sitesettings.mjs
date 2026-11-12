// ============================================================
// CORRECTIF — EXTENSION D'IMPORT MANQUANTE DANS lib/accountNewsCacheSettings.js — ZENORIA_FIX_IMPORT_EXT_V1
//
// Ce fichier (deja en production depuis le lot 2) importe "./siteSettings" sans l'extension .js.
// Next.js/webpack resolvent ce chemin sans probleme (le site fonctionne normalement). Mais la
// commande "node tests/....test.mjs" exige une extension explicite sur les imports relatifs,
// ce qui empeche de lancer les tests directement.
//
// Correctif sans effet fonctionnel : "./siteSettings" -> "./siteSettings.js".
//
// Modifie : lib/accountNewsCacheSettings.js (uniquement). Tout ou rien.
// Usage : node scripts/patch-fix-import-extension-sitesettings.mjs
// ============================================================
import fs from "node:fs";
import path from "node:path";

const TAG = "[patch-fix-import-extension-sitesettings]";
const FILE = "lib/accountNewsCacheSettings.js";
const MARKER = "ZENORIA_FIX_IMPORT_EXT_V1";
const full = path.join(process.cwd(), FILE);

if (!fs.existsSync(full)) {
  console.error(TAG + " " + FILE + " : fichier introuvable. RIEN n'a ete ecrit.");
  process.exit(1);
}
const raw = fs.readFileSync(full, "utf8");
const crlf = raw.includes("\r\n");
const text = raw.replace(/\r\n/g, "\n");

if (text.includes(MARKER)) {
  console.error(TAG + " deja applique (" + MARKER + " present). RIEN n'a ete ecrit.");
  process.exit(1);
}

const find = 'import { SITE_SETTINGS_TABLE } from "./siteSettings";';
const n = text.split(find).length - 1;
if (n !== 1) {
  console.error(TAG + " repere trouve " + n + " fois (attendu : 1). RIEN n'a ete ecrit.");
  process.exit(1);
}
const replacement = 'import { SITE_SETTINGS_TABLE } from "./siteSettings.js"; // ' + MARKER;
const patched = text.replace(find, replacement);

fs.writeFileSync(full, crlf ? patched.replace(/\n/g, "\r\n") : patched, "utf8");
console.log(TAG + " 1 fichier mis a jour : " + FILE + " (" + (crlf ? "CRLF" : "LF") + ")");
