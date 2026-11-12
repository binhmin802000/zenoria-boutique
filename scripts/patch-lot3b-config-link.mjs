// ============================================================
// PATCH LOT 3b — LIGNE « ENTRETIEN DU BIJOU » DANS ACCUEIL › CONFIGURATION — ZENORIA_CARE_INFO_V1
//
// Modifie : lib/configOverview.js (uniquement)
// Prerequis (fichier a copier AVANT, ce script ne le cree pas) :
//   lib/careInfoOverview.js
// Prerequis : lot 3 deja en place (lib/careInfoSettings.js, le reglage care_info deja lisible,
// la carte data-config-card="care_info" deja posee dans AdminSiteMedia.js).
//
// Ajoute une ligne « Entretien du bijou » dans Accueil › Configuration, avec un lien « Modifier › »
// vers Contenu du site › Vitrine & ambiance, qui ouvre directement la carte « Entretien du bijou »
// (meme mecanisme que les liens Ordre des bijoux, Badge Nouveauté et Pastille de nouveautés).
//
// Tout ou rien : chaque repere doit exister UNE SEULE fois, sinon rien n'est ecrit.
// Fins de ligne (CRLF/LF) conservees. Relancer apres succes est refuse.
//
// Usage : node scripts/patch-lot3b-config-link.mjs
// ============================================================
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TAG = "[patch-lot3b-config-link]";
const FILE = "lib/configOverview.js";
const MARKER = "ZENORIA_CARE_INFO_V1";
const REQUIRED_NEW_FILE = "lib/careInfoOverview.js";

const edits = [
  {
    name: "import de la fonction d'affichage",
    find: 'import { accountNewsCacheOverviewItems } from "@/lib/accountNewsCacheOverview"; // ZENORIA_ACCOUNT_NEWS_BADGE_V1',
    replace: [
      'import { accountNewsCacheOverviewItems } from "@/lib/accountNewsCacheOverview"; // ZENORIA_ACCOUNT_NEWS_BADGE_V1',
      'import { careInfoOverviewItems } from "@/lib/careInfoOverview"; // ZENORIA_CARE_INFO_V1',
    ].join("\n"),
  },
  {
    name: "ajout de la cle dans CONFIG_KEYS",
    find: 'export const CONFIG_KEYS = ["payment_methods", "bank_transfer", "billing", "shipping", "season_fx", "ring_animation", "reviews", "contact", "grid_order", "newsletter", "new_badge", "account_news_cache"]; // ZENORIA_ACCOUNT_NEWS_BADGE_V1',
    replace: 'export const CONFIG_KEYS = ["payment_methods", "bank_transfer", "billing", "shipping", "season_fx", "ring_animation", "reviews", "contact", "grid_order", "newsletter", "new_badge", "account_news_cache", "care_info"]; // ZENORIA_CARE_INFO_V1',
  },
  {
    name: "ajout de la carte dans SITE_MEDIA_CARDS",
    find: 'export const SITE_MEDIA_CARDS = ["grid_order", "new_badge", "account_news_cache"]; // ZENORIA_ACCOUNT_NEWS_BADGE_V1',
    replace: 'export const SITE_MEDIA_CARDS = ["grid_order", "new_badge", "account_news_cache", "care_info"]; // ZENORIA_CARE_INFO_V1',
  },
  {
    name: "calcul des lignes a afficher",
    find: "const accountNewsCacheItems = accountNewsCacheOverviewItems(rows.account_news_cache || null); // ZENORIA_ACCOUNT_NEWS_BADGE_V1",
    replace: [
      "const accountNewsCacheItems = accountNewsCacheOverviewItems(rows.account_news_cache || null); // ZENORIA_ACCOUNT_NEWS_BADGE_V1",
      "  const careInfoItems = careInfoOverviewItems(rows.care_info || null); // ZENORIA_CARE_INFO_V1",
    ].join("\n"),
  },
  {
    name: "ajout de la section dans le tableau retourne",
    find: '    { id: "account_news_cache", title: "Pastille de nouveautés (autres pages)", keys: "account_news_cache", link: { group: "produits", tab: "site", anchor: "vitrine", card: "account_news_cache", where: "Contenu du site › Vitrine & ambiance › Pastille de nouveautés sur toutes les pages" }, items: accountNewsCacheItems }, // ZENORIA_ACCOUNT_NEWS_BADGE_V1',
    replace: [
      '    { id: "account_news_cache", title: "Pastille de nouveautés (autres pages)", keys: "account_news_cache", link: { group: "produits", tab: "site", anchor: "vitrine", card: "account_news_cache", where: "Contenu du site › Vitrine & ambiance › Pastille de nouveautés sur toutes les pages" }, items: accountNewsCacheItems }, // ZENORIA_ACCOUNT_NEWS_BADGE_V1',
      '    { id: "care_info", title: "Entretien du bijou", keys: "care_info", link: { group: "produits", tab: "site", anchor: "vitrine", card: "care_info", where: "Contenu du site › Vitrine & ambiance › Entretien du bijou" }, items: careInfoItems }, // ZENORIA_CARE_INFO_V1',
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
