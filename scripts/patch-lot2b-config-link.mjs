// ============================================================
// PATCH LOT 2b — LIGNE « PASTILLE DE NOUVEAUTÉS » DANS ACCUEIL › CONFIGURATION — ZENORIA_ACCOUNT_NEWS_BADGE_V1
//
// Modifie : lib/configOverview.js (uniquement)
// Prerequis (fichier a copier AVANT, ce script ne le cree pas) :
//   lib/accountNewsCacheOverview.js
// Prerequis : lot 2 deja en place (lib/accountNewsCacheSettings.js, le reglage account_news_cache
// deja lisible, la carte data-config-card="account_news_cache" deja posee dans AdminSiteMedia.js).
//
// Ajoute une ligne « Pastille de nouveautés (autres pages) » dans Accueil › Configuration, avec un
// lien « Modifier › » vers Contenu du site › Vitrine & ambiance, qui ouvre directement la carte
// « Pastille de nouveautés sur toutes les pages » (meme mecanisme que les liens Ordre des bijoux et
// Badge Nouveauté deja en place).
//
// Tout ou rien : chaque repere doit exister UNE SEULE fois, sinon rien n'est ecrit.
// Fins de ligne (CRLF/LF) conservees. Relancer apres succes est refuse.
//
// Usage : node scripts/patch-lot2b-config-link.mjs
// ============================================================
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TAG = "[patch-lot2b-config-link]";
const FILE = "lib/configOverview.js";
const MARKER = "ZENORIA_ACCOUNT_NEWS_BADGE_V1";
const REQUIRED_NEW_FILE = "lib/accountNewsCacheOverview.js";

const edits = [
  {
    name: "import de la fonction d'affichage",
    find: 'import { newBadgeOverviewItems } from "@/lib/newBadgeOverview"; // ZENORIA_NEW_BADGE_V3',
    replace: [
      'import { newBadgeOverviewItems } from "@/lib/newBadgeOverview"; // ZENORIA_NEW_BADGE_V3',
      'import { accountNewsCacheOverviewItems } from "@/lib/accountNewsCacheOverview"; // ZENORIA_ACCOUNT_NEWS_BADGE_V1',
    ].join("\n"),
  },
  {
    name: "ajout de la cle dans CONFIG_KEYS",
    find: 'export const CONFIG_KEYS = ["payment_methods", "bank_transfer", "billing", "shipping", "season_fx", "ring_animation", "reviews", "contact", "grid_order", "newsletter", "new_badge"]; // ZENORIA_NEWSLETTER_V1',
    replace: 'export const CONFIG_KEYS = ["payment_methods", "bank_transfer", "billing", "shipping", "season_fx", "ring_animation", "reviews", "contact", "grid_order", "newsletter", "new_badge", "account_news_cache"]; // ZENORIA_ACCOUNT_NEWS_BADGE_V1',
  },
  {
    name: "ajout de la carte dans SITE_MEDIA_CARDS",
    find: 'export const SITE_MEDIA_CARDS = ["grid_order", "new_badge"];',
    replace: 'export const SITE_MEDIA_CARDS = ["grid_order", "new_badge", "account_news_cache"]; // ZENORIA_ACCOUNT_NEWS_BADGE_V1',
  },
  {
    name: "calcul des lignes a afficher",
    find: "const newBadgeItems = newBadgeOverviewItems(rows.new_badge || null); // ZENORIA_NEW_BADGE_V3",
    replace: [
      "const newBadgeItems = newBadgeOverviewItems(rows.new_badge || null); // ZENORIA_NEW_BADGE_V3",
      "  const accountNewsCacheItems = accountNewsCacheOverviewItems(rows.account_news_cache || null); // ZENORIA_ACCOUNT_NEWS_BADGE_V1",
    ].join("\n"),
  },
  {
    name: "ajout de la section dans le tableau retourne",
    find: '    { id: "new_badge", title: "Badge Nouveauté", keys: "new_badge", link: { group: "produits", tab: "site", anchor: "vitrine", card: "new_badge", where: "Contenu du site › Vitrine & ambiance › Badge Nouveauté" }, items: newBadgeItems }, // ZENORIA_NEW_BADGE_V3',
    replace: [
      '    { id: "new_badge", title: "Badge Nouveauté", keys: "new_badge", link: { group: "produits", tab: "site", anchor: "vitrine", card: "new_badge", where: "Contenu du site › Vitrine & ambiance › Badge Nouveauté" }, items: newBadgeItems }, // ZENORIA_NEW_BADGE_V3',
      '    { id: "account_news_cache", title: "Pastille de nouveautés (autres pages)", keys: "account_news_cache", link: { group: "produits", tab: "site", anchor: "vitrine", card: "account_news_cache", where: "Contenu du site › Vitrine & ambiance › Pastille de nouveautés sur toutes les pages" }, items: accountNewsCacheItems }, // ZENORIA_ACCOUNT_NEWS_BADGE_V1',
    ].join("\n"),
  },
];

function countOccurrences(text, needle) {
  let n = 0;
  let i = text.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = text.indexOf(needle, i + needle.length);
  }
  return n;
}

const problems = [];
if (!fs.existsSync(path.join(ROOT, REQUIRED_NEW_FILE))) {
  problems.push(REQUIRED_NEW_FILE + " : fichier a copier avant de lancer ce script");
}

const full = path.join(ROOT, FILE);
let out = null;
let crlf = false;
if (!fs.existsSync(full)) {
  problems.push(FILE + " : fichier introuvable (lancer le script depuis le dossier du projet)");
} else {
  const raw = fs.readFileSync(full, "utf8");
  crlf = raw.includes("\r\n");
  let text = raw.replace(/\r\n/g, "\n");
  if (text.includes(MARKER)) {
    problems.push(FILE + " : deja patche (" + MARKER + " present), rien a faire");
  } else {
    let ok = true;
    for (const e of edits) {
      const n = countOccurrences(text, e.find);
      if (n !== 1) {
        problems.push(FILE + " : repere \"" + e.name + "\" trouve " + n + " fois (attendu : 1)");
        ok = false;
      }
    }
    if (ok) {
      for (const e of edits) text = text.replace(e.find, () => e.replace);
      out = crlf ? text.replace(/\n/g, "\r\n") : text;
    }
  }
}

if (problems.length > 0 || out === null) {
  console.error(TAG + " au moins un probleme, RIEN n a ete ecrit :");
  problems.forEach((p) => console.error("  - " + p));
  process.exit(1);
}

fs.writeFileSync(full, out, "utf8");
console.log(TAG + " 1 fichier mis a jour : " + FILE + " (" + (crlf ? "CRLF" : "LF") + ")");
