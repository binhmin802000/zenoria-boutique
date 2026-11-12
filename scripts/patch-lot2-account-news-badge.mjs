// ============================================================
// PATCH LOT 2 — PASTILLE DE NOUVEAUTES SUR TOUTES LES PAGES — ZENORIA_ACCOUNT_NEWS_BADGE_V1
//
// Modifie : pages/index.js, pages/quiz.js, lib/configLog.js, components/AdminSiteMedia.js
// Prerequis (fichiers a copier AVANT, ce script ne les cree pas) :
//   lib/accountNewsCacheSettings.js, lib/accountNewsBadge.js, lib/useAccountNewsBadge.js,
//   components/AdminAccountNewsCache.js
// Prerequis base : sql/supabase_lot2_account_news_badge.sql deja execute (customer_account_news()
// elargi + customer_account_reviews() + politique de lecture de account_news_cache).
//
// Tout ou rien : chaque repere doit exister UNE SEULE fois dans chaque fichier concerne, sinon le
// script s'arrete sans rien ecrire NULLE PART (verification complete avant toute ecriture).
// Fins de ligne (CRLF/LF) conservees par fichier. Relancer apres succes est refuse.
//
// Usage : node scripts/patch-lot2-account-news-badge.mjs
// ============================================================
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TAG = "[patch-lot2-account-news-badge]";
const MARKER = "ZENORIA_ACCOUNT_NEWS_BADGE_V1";
const REQUIRED_NEW_FILES = [
  "lib/accountNewsCacheSettings.js",
  "lib/accountNewsBadge.js",
  "lib/useAccountNewsBadge.js",
  "components/AdminAccountNewsCache.js",
];

const indexEdits = [
  {
    name: "import des reglages du cache",
    find: 'import { DEFAULT_NEW_BADGE, NEW_BADGE_KEY, parseNewBadgeSetting, isNewProduct } from "@/lib/newBadge"; // ZENORIA_NEW_BADGE_V1',
    replace: [
      'import { DEFAULT_NEW_BADGE, NEW_BADGE_KEY, parseNewBadgeSetting, isNewProduct } from "@/lib/newBadge"; // ZENORIA_NEW_BADGE_V1',
      'import { DEFAULT_ACCOUNT_NEWS_CACHE, ACCOUNT_NEWS_CACHE_KEY, parseAccountNewsCacheSetting } from "@/lib/accountNewsCacheSettings"; // ZENORIA_ACCOUNT_NEWS_BADGE_V1',
      'import { useAccountNewsBadge } from "@/lib/useAccountNewsBadge"; // ZENORIA_ACCOUNT_NEWS_BADGE_V1',
    ].join("\n"),
  },
  {
    name: "etat du reglage de cache",
    find: "const [newBadgeCfg, setNewBadgeCfg] = useState(DEFAULT_NEW_BADGE); // ZENORIA_NEW_BADGE_V2 : reglage du badge Nouveaute (admin : Contenu du site > Vitrine & ambiance)",
    replace: [
      "const [newBadgeCfg, setNewBadgeCfg] = useState(DEFAULT_NEW_BADGE); // ZENORIA_NEW_BADGE_V2 : reglage du badge Nouveaute (admin : Contenu du site > Vitrine & ambiance)",
      "  const [accountNewsCacheCfg, setAccountNewsCacheCfg] = useState(DEFAULT_ACCOUNT_NEWS_CACHE); // ZENORIA_ACCOUNT_NEWS_BADGE_V1",
    ].join("\n"),
  },
  {
    name: "ajout de la cle dans la lecture groupee des reglages",
    find: "SEASON_FX_KEY, SHIPPING_KEY, SITE_TEXTS_KEY, CONTACT_KEY, REVIEWS_KEY, PAYMENT_METHODS_KEY, GRID_ORDER_KEY, NEWSLETTER_KEY, NEW_BADGE_KEY])),",
    replace: "SEASON_FX_KEY, SHIPPING_KEY, SITE_TEXTS_KEY, CONTACT_KEY, REVIEWS_KEY, PAYMENT_METHODS_KEY, GRID_ORDER_KEY, NEWSLETTER_KEY, NEW_BADGE_KEY, ACCOUNT_NEWS_CACHE_KEY])), // ZENORIA_ACCOUNT_NEWS_BADGE_V1",
  },
  {
    name: "lecture du reglage apres chargement",
    find: "const newBadgeRow = settingRows.find((r) => r.key === NEW_BADGE_KEY) || null;\n      setNewBadgeCfg(parseNewBadgeSetting(newBadgeRow ? newBadgeRow.value : null));",
    replace: [
      "const newBadgeRow = settingRows.find((r) => r.key === NEW_BADGE_KEY) || null;",
      "      setNewBadgeCfg(parseNewBadgeSetting(newBadgeRow ? newBadgeRow.value : null));",
      "      // ZENORIA_ACCOUNT_NEWS_BADGE_V1 : ligne absente ou illisible -> valeurs par defaut (actif, 15 min)",
      "      const accountNewsCacheRow = settingRows.find((r) => r.key === ACCOUNT_NEWS_CACHE_KEY) || null;",
      "      setAccountNewsCacheCfg(parseAccountNewsCacheSetting(accountNewsCacheRow ? accountNewsCacheRow.value : null));",
    ].join("\n"),
  },
  {
    name: "appel du hook",
    find: "logoMode={logo}\n      />",
    replace: [
      "logoMode={logo}",
      "        accountBadge={useAccountNewsBadge({ userId: user ? user.id : null, settingsReady: !catalogLoading, enabled: accountNewsCacheCfg.enabled, cacheMinutes: accountNewsCacheCfg.minutes })} // ZENORIA_ACCOUNT_NEWS_BADGE_V1",
      "      />",
    ].join("\n"),
  },
];

const quizEdits = [
  {
    name: "import des reglages et du hook",
    find: 'import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";',
    replace: [
      'import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";',
      'import { DEFAULT_ACCOUNT_NEWS_CACHE, fetchAccountNewsCacheSetting } from "@/lib/accountNewsCacheSettings"; // ZENORIA_ACCOUNT_NEWS_BADGE_V1',
      'import { useAccountNewsBadge } from "@/lib/useAccountNewsBadge"; // ZENORIA_ACCOUNT_NEWS_BADGE_V1',
    ].join("\n"),
  },
  {
    name: "etats du reglage de cache",
    find: "const [isAdmin, setIsAdmin] = useState(false);",
    replace: [
      "const [isAdmin, setIsAdmin] = useState(false);",
      "  // ZENORIA_ACCOUNT_NEWS_BADGE_V1 : identifiant du compte (sans ecoute en temps reel, comme accountHref ci-dessous)",
      "  const [badgeUserId, setBadgeUserId] = useState(null);",
      "  const [accountNewsCacheCfg, setAccountNewsCacheCfg] = useState(DEFAULT_ACCOUNT_NEWS_CACHE);",
      "  const [accountNewsCacheReady, setAccountNewsCacheReady] = useState(false);",
      "  useEffect(() => {",
      "    let alive = true;",
      "    fetchAccountNewsCacheSetting(supabase).then((s) => { if (alive) { setAccountNewsCacheCfg(s); setAccountNewsCacheReady(true); } });",
      "    return () => { alive = false; };",
      "  }, []);",
    ].join("\n"),
  },
  {
    name: "capture de l identifiant du compte",
    find: 'if (active) setAccountHref(u ? "/compte" : DEFAULT_ACCOUNT_HREF);',
    replace: [
      'if (active) setAccountHref(u ? "/compte" : DEFAULT_ACCOUNT_HREF);',
      "        if (active) setBadgeUserId(u ? u.id : null); // ZENORIA_ACCOUNT_NEWS_BADGE_V1",
    ].join("\n"),
  },
  {
    name: "appel du hook sur le bouton compte",
    find: "onCartClick={openCart}\n      />",
    replace: [
      "onCartClick={openCart}",
      "        accountBadge={useAccountNewsBadge({ userId: badgeUserId, settingsReady: accountNewsCacheReady, enabled: accountNewsCacheCfg.enabled, cacheMinutes: accountNewsCacheCfg.minutes })} // ZENORIA_ACCOUNT_NEWS_BADGE_V1",
      "      />",
    ].join("\n"),
  },
];

const configLogEdits = [
  {
    name: "libelle de la cle dans le journal",
    find: '  newsletter: "Newsletter", // ZENORIA_NEW_BADGE_V3\n};',
    replace: [
      '  newsletter: "Newsletter", // ZENORIA_NEW_BADGE_V3',
      '  account_news_cache: "Pastille de nouveautés (autres pages)", // ZENORIA_ACCOUNT_NEWS_BADGE_V1',
      "};",
    ].join("\n"),
  },
  {
    name: "libelle du champ minutes",
    find: '  days: "Durée d\'affichage", // ZENORIA_NEW_BADGE_V3\n};',
    replace: [
      '  days: "Durée d\'affichage", // ZENORIA_NEW_BADGE_V3',
      '  minutes: "Durée de cache (minutes)", // ZENORIA_ACCOUNT_NEWS_BADGE_V1',
      "};",
    ].join("\n"),
  },
];

const adminSiteMediaEdits = [
  {
    name: "import du composant",
    find: 'import AdminNewBadge from "@/components/AdminNewBadge"; // ZENORIA_NEW_BADGE_V2',
    replace: [
      'import AdminNewBadge from "@/components/AdminNewBadge"; // ZENORIA_NEW_BADGE_V2',
      'import AdminAccountNewsCache from "@/components/AdminAccountNewsCache"; // ZENORIA_ACCOUNT_NEWS_BADGE_V1',
    ].join("\n"),
  },
  {
    name: "compte de cartes du groupe Vitrine & ambiance",
    find: 'title="Vitrine & ambiance"\n        count={4}',
    replace: 'title="Vitrine & ambiance"\n        count={5} // ZENORIA_ACCOUNT_NEWS_BADGE_V1 : 4 -> 5 (carte de la pastille de nouveautes)',
  },
  {
    name: "carte ajoutee apres le badge Nouveaute",
    find: '<div data-config-card="new_badge" style={{ scrollMarginTop: 84 }}> {/* ZENORIA_CONFIG_LINKS_V1 */}\n          <AdminNewBadge />\n        </div>',
    replace: [
      '<div data-config-card="new_badge" style={{ scrollMarginTop: 84 }}> {/* ZENORIA_CONFIG_LINKS_V1 */}',
      "          <AdminNewBadge />",
      "        </div>",
      '        <div data-config-card="account_news_cache" style={{ scrollMarginTop: 84 }}> {/* ZENORIA_ACCOUNT_NEWS_BADGE_V1 */}',
      "          <AdminAccountNewsCache />",
      "        </div>",
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

function prepare(rel, edits, problems) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    problems.push(rel + " : fichier introuvable (lancer le script depuis le dossier du projet)");
    return null;
  }
  const raw = fs.readFileSync(full, "utf8");
  const crlf = raw.includes("\r\n");
  let text = raw.replace(/\r\n/g, "\n");
  if (text.includes(MARKER)) {
    problems.push(rel + " : deja patche (" + MARKER + " present), rien a faire");
    return null;
  }
  let ok = true;
  for (const e of edits) {
    const n = countOccurrences(text, e.find);
    if (n !== 1) {
      problems.push(rel + " : repere \"" + e.name + "\" trouve " + n + " fois (attendu : 1)");
      ok = false;
    }
  }
  if (!ok) return null;
  for (const e of edits) text = text.replace(e.find, () => e.replace);
  return { full, out: crlf ? text.replace(/\n/g, "\r\n") : text, crlf };
}

const problems = [];
for (const rel of REQUIRED_NEW_FILES) {
  if (!fs.existsSync(path.join(ROOT, rel))) problems.push(rel + " : fichier a copier avant de lancer ce script");
}

const targets = [
  ["pages/index.js", indexEdits],
  ["pages/quiz.js", quizEdits],
  ["lib/configLog.js", configLogEdits],
  ["components/AdminSiteMedia.js", adminSiteMediaEdits],
];
const prepared = {};
for (const [rel, edits] of targets) {
  prepared[rel] = prepare(rel, edits, problems);
}

if (problems.length > 0 || Object.values(prepared).some((p) => !p)) {
  console.error(TAG + " au moins un probleme, RIEN n a ete ecrit :");
  problems.forEach((p) => console.error("  - " + p));
  process.exit(1);
}

for (const [rel] of targets) {
  const p = prepared[rel];
  fs.writeFileSync(p.full, p.out, "utf8");
  console.log(TAG + " mis a jour : " + rel + " (" + (p.crlf ? "CRLF" : "LF") + ")");
}
